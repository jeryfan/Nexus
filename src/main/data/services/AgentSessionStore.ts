import { application } from '@application'
import { loggerService } from '@logger'
import { agentProjectTable, type AgentProjectRow } from '@main/data/db/schemas/agentProject'
import { agentSessionTable, type AgentSessionRow } from '@main/data/db/schemas/agentSession'
import type { DbType } from '@main/data/db/types'
import type { SessionListsDto } from '@shared/agent/api/AgentDataApi'
import type { SessionSummaryDto } from '@shared/agent/types'
import { eq, inArray } from 'drizzle-orm'
import { readFile, unlink } from 'node:fs/promises'

const logger = loggerService.withContext('AgentSessionStore')

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** pi SessionManager.listAll() 返回条目的最小结构（由调用方注入，避免数据层依赖 pi） */
export interface SessionFileInfo {
  id: string
  cwd: string
  name?: string
  firstMessage: string
  modified: Date
}

export interface ReconcileInput {
  listSessionFiles: () => Promise<SessionFileInfo[]>
  /** 旧版侧车标志文件（nexus-flags.json）路径；存在则导入后删除 */
  legacyFlagsPath?: string
}

interface LegacyFlagsFile {
  sessions?: Record<string, { pinned?: boolean; archived?: boolean }>
  projects?: Record<string, { pinned?: boolean; removed?: boolean }>
}

/**
 * 会话/项目元数据索引（SQLite，唯一事实源）。
 *
 * - 存在性：项目/会话以入库记录为准，不从 pi jsonl 文件反推；
 *   jsonl 只在打开会话时提供消息内容
 * - 查询：项目树（工作区会话按项目分组）与对话列表（独立工作区会话）
 *   全部由 DB 组装（分组、置顶/时间排序、标志合并）
 * - 写入：AgentSessionService 写穿透（create/title/flags/delete）
 * - 一致性：启动 reconcile 单向清理（DB 有记录但 jsonl 已消失 → 删行；
 *   孤儿 jsonl 不补录、不展示）+ 旧版标志文件迁移
 * - 变更通知：onChanged 回调（由 AgentService 接 IPC 广播）
 */
export class AgentSessionStore {
  onChanged: ((lists: SessionListsDto) => void) | undefined

  private get db(): DbType {
    return application.get('DbService').getDb()
  }

  // ── Queries ──

  async getSessionLists(): Promise<SessionListsDto> {
    // 会话单查询全量取出后内存分流（项目会话/对话），避免同一表查两遍
    const [projects, sessions] = await Promise.all([
      this.db.select().from(agentProjectTable),
      this.db.select().from(agentSessionTable)
    ])
    const byProject = new Map<string, AgentSessionRow[]>()
    const chats: AgentSessionRow[] = []
    for (const row of sessions) {
      if (row.projectId === null) {
        chats.push(row)
        continue
      }
      const list = byProject.get(row.projectId) ?? []
      list.push(row)
      byProject.set(row.projectId, list)
    }

    const tree = projects
      .filter((project) => !project.removed)
      .map((project) => {
        const visible = (byProject.get(project.id) ?? []).filter((row) => !row.archived)
        visible.sort(compareSessions)
        return {
          id: project.id,
          cwd: project.cwd,
          name: project.name,
          pinned: project.pinned,
          latestAt: visible[0]?.updatedAt ?? project.updatedAt,
          sessions: visible.map(toSummary)
        }
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.latestAt - a.latestAt
      })

    return { projects: tree, chats: chats.filter((row) => !row.archived).sort(compareSessions).map(toSummary) }
  }

  /** 按 id 取会话行（openSession 的存在性与 cwd 判定，DB 为准） */
  async getSession(sessionId: string): Promise<AgentSessionRow | null> {
    const rows = await this.db
      .select()
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId))
      .limit(1)
    return rows[0] ?? null
  }

  // ── Session mutations ──

  async upsertSession(input: {
    sessionId: string
    /** 项目 id；null = 对话（独立工作区会话） */
    projectId: string | null
    /** 会话工作目录（项目目录或对话独立目录） */
    cwd: string
    title: string
    updatedAt?: number
  }): Promise<void> {
    await this.db
      .insert(agentSessionTable)
      .values({
        id: input.sessionId,
        projectId: input.projectId,
        cwd: input.cwd,
        title: input.title,
        ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {})
      })
      .onConflictDoUpdate({
        target: agentSessionTable.id,
        set: {
          title: input.title,
          projectId: input.projectId,
          cwd: input.cwd,
          ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {})
        }
      })
    this.emitChanged()
  }

  async setTitle(sessionId: string, title: string): Promise<void> {
    await this.db
      .update(agentSessionTable)
      .set({ title })
      .where(eq(agentSessionTable.id, sessionId))
    this.emitChanged()
  }

  /** 会话有新活动（prompt/回复完成），刷新最近时间（驱动排序） */
  async touchSession(sessionId: string, updatedAt: number): Promise<void> {
    await this.db
      .update(agentSessionTable)
      .set({ updatedAt })
      .where(eq(agentSessionTable.id, sessionId))
    this.emitChanged()
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.delete(agentSessionTable).where(eq(agentSessionTable.id, sessionId))
    this.emitChanged()
  }

  async setSessionPinned(sessionId: string, pinned: boolean): Promise<void> {
    await this.db
      .update(agentSessionTable)
      .set({ pinned })
      .where(eq(agentSessionTable.id, sessionId))
    this.emitChanged()
  }

  async setSessionArchived(sessionId: string, archived: boolean): Promise<void> {
    await this.db
      .update(agentSessionTable)
      .set({ archived })
      .where(eq(agentSessionTable.id, sessionId))
    this.emitChanged()
  }

  async archiveProjectSessions(cwd: string): Promise<void> {
    const project = await this.getProjectByCwd(cwd)
    if (!project) return
    await this.db
      .update(agentSessionTable)
      .set({ archived: true })
      .where(eq(agentSessionTable.projectId, project.id))
    this.emitChanged()
  }

  // ── Project mutations ──

  async getProjectByCwd(cwd: string): Promise<AgentProjectRow | null> {
    const rows = await this.db
      .select()
      .from(agentProjectTable)
      .where(eq(agentProjectTable.cwd, cwd))
      .limit(1)
    return rows[0] ?? null
  }

  /** 按 cwd 查或建项目（cwd 唯一；名缺省取 basename） */
  async getOrCreateProject(cwd: string, name?: string): Promise<AgentProjectRow> {
    const existing = await this.getProjectByCwd(cwd)
    if (existing) return existing
    const rows = await this.db
      .insert(agentProjectTable)
      .values({ cwd, name: name || basename(cwd) })
      .onConflictDoNothing({ target: agentProjectTable.cwd })
      .returning()
    const project = rows[0] ?? (await this.getProjectByCwd(cwd))
    if (!project) throw new Error(`Failed to create project: ${cwd}`)
    this.emitChanged()
    return project
  }

  async setProjectPinned(cwd: string, pinned: boolean): Promise<void> {
    await this.getOrCreateProject(cwd)
    await this.db.update(agentProjectTable).set({ pinned }).where(eq(agentProjectTable.cwd, cwd))
    this.emitChanged()
  }

  async setProjectRemoved(cwd: string, removed: boolean): Promise<void> {
    await this.getOrCreateProject(cwd)
    await this.db.update(agentProjectTable).set({ removed }).where(eq(agentProjectTable.cwd, cwd))
    this.emitChanged()
  }

  // ── Reconciliation ──

  /**
   * 启动对账（单向，DB 为准）：
   * - DB 有记录但 jsonl 已消失 → 删行（外部删除文件的清理）
   * - 孤儿 jsonl（无 DB 行）→ 不补录、不展示、不删除
   * - 存在旧版 nexus-flags.json → 导入标志位后删除文件
   */
  async reconcile(input: ReconcileInput): Promise<void> {
    await this.migrateLegacyFlags(input.legacyFlagsPath).catch((error) => {
      logger.warn('legacy flags migration failed, skipping', error)
    })

    const files = await input.listSessionFiles()
    const fileIds = new Set(files.map((file) => file.id))
    const rows = await this.db.select().from(agentSessionTable)

    const staleIds = rows.filter((row) => !fileIds.has(row.id)).map((row) => row.id)
    if (staleIds.length > 0) {
      await this.db.delete(agentSessionTable).where(inArray(agentSessionTable.id, staleIds))
    }
    logger.info('reconcile done', {
      files: files.length,
      dbRows: rows.length,
      stale: staleIds.length
    })
    this.emitChanged()
  }

  private async migrateLegacyFlags(legacyFlagsPath: string | undefined): Promise<void> {
    if (!legacyFlagsPath) return
    const raw = await readFile(legacyFlagsPath, 'utf8').catch(() => undefined)
    if (!raw) return
    const legacy = JSON.parse(raw) as LegacyFlagsFile

    for (const [sessionId, flags] of Object.entries(legacy.sessions ?? {})) {
      await this.db
        .update(agentSessionTable)
        .set({
          ...(flags.pinned ? { pinned: true } : {}),
          ...(flags.archived ? { archived: true } : {})
        })
        .where(eq(agentSessionTable.id, sessionId))
    }
    for (const [cwd, flags] of Object.entries(legacy.projects ?? {})) {
      await this.getOrCreateProject(cwd)
      await this.db
        .update(agentProjectTable)
        .set({
          ...(flags.pinned ? { pinned: true } : {}),
          ...(flags.removed ? { removed: true } : {})
        })
        .where(eq(agentProjectTable.cwd, cwd))
    }
    await unlink(legacyFlagsPath)
    logger.info('legacy flags migrated and removed', { path: legacyFlagsPath })
  }

  private emitTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * 变更广播合帧：一个窗口内的连续 mutation（agent 每轮 touchSession、
   * 批量归档等）只触发一次列表重建 + IPC 广播，取窗口末次状态。
   */
  private emitChanged(): void {
    if (!this.onChanged) return
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined
      void this.getSessionLists()
        .then((lists) => this.onChanged?.(lists))
        .catch((error) => logger.error('emitChanged failed', error))
    }, SESSION_LISTS_EMIT_COALESCE_MS)
  }
}

const SESSION_LISTS_EMIT_COALESCE_MS = 100

/** 会话排序：置顶优先，再按最近活动倒排 */
function compareSessions(a: AgentSessionRow, b: AgentSessionRow): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return b.updatedAt - a.updatedAt
}

function toSummary(row: AgentSessionRow): SessionSummaryDto {
  return {
    sessionId: row.id,
    cwd: row.cwd,
    title: row.title,
    updatedAt: row.updatedAt,
    ...(row.pinned ? { pinned: true } : {}),
    ...(row.archived ? { archived: true } : {})
  }
}

export const agentSessionStore = new AgentSessionStore()
