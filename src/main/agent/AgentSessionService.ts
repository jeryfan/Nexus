import type {
  AgentSession,
  ModelRuntime,
  ResourceLoader,
  SessionManager,
  SettingsManager
} from '@earendil-works/pi-coding-agent'
import type { CacheService } from '@main/data/CacheService'
import { loggerService } from '@logger'
import type {
  AgentMessageDto,
  ImageInputDto,
  ModelRefDto,
  SessionSnapshotDto
} from '@shared/agent/types'

import { AgentEventBridge, broadcastSessionMeta } from './AgentEventBridge'
import { loadPi } from './PiLoader'
import { extractUserText } from './utils'
import { agentSessionStore } from '@main/data/services/AgentSessionStore'
import type { AgentSessionRow } from '@main/data/db/schemas/agentSession'

const logger = loggerService.withContext('AgentSessionService')

/** Soft cap on live session instances; idle non-streaming sessions beyond it are disposed. */
const MAX_LIVE_SESSIONS = 10
const SELECTED_MODEL_CACHE_KEY = 'agent.selectedModel'

interface SessionHandle {
  session: AgentSession
  sessionManager: SessionManager
  cwd: string
  unsubscribe: () => void
  lastActiveAt: number
}

export interface AgentSessionServiceDeps {
  getModelRuntime: () => ModelRuntime
  /** 会话资源入口：共享的 loader（按 cwd）与 SettingsManager，由 AgentResourceService 提供。 */
  getResources: (
    cwd: string
  ) => Promise<{ resourceLoader: ResourceLoader; settingsManager: SettingsManager }>
  bridge: AgentEventBridge
  cache: CacheService
  /** Called on `agent_end` (used by TitleSummarizer). */
  onAgentEnd?: (session: AgentSession, sessionManager: SessionManager) => void
}

function toMessageDtos(messages: unknown[]): AgentMessageDto[] {
  // Structural mirror (see shared/agent/types.ts): pi messages are JSON-safe
  // and match the DTO field for field.
  return messages as AgentMessageDto[]
}

/**
 * Multi-active session pool. Each session keeps its own live AgentSession so
 * switching away never interrupts a running task (phase-1 decision 1A).
 * Disposed sessions lose nothing — state lives in the jsonl file and `open`
 * rebuilds the instance.
 */
export class AgentSessionService {
  private readonly sessions = new Map<string, SessionHandle>()

  constructor(private readonly deps: AgentSessionServiceDeps) {}

  // ── Queries（元数据由 DB 索引 AgentSessionStore 提供） ──

  async setPinned(sessionId: string, pinned: boolean): Promise<void> {
    await agentSessionStore.setSessionPinned(sessionId, pinned)
  }

  async setArchived(sessionId: string, archived: boolean): Promise<void> {
    await agentSessionStore.setSessionArchived(sessionId, archived)
  }

  // ── Project flags ──

  getSessionLists(): Promise<import('@shared/agent/api/AgentDataApi').SessionListsDto> {
    return agentSessionStore.getSessionLists()
  }

  async setProjectPinned(cwd: string, pinned: boolean): Promise<void> {
    await agentSessionStore.setProjectPinned(cwd, pinned)
  }

  async setProjectRemoved(cwd: string, removed: boolean): Promise<void> {
    await agentSessionStore.setProjectRemoved(cwd, removed)
  }

  /** 归档项目下全部会话 */
  async archiveProjectSessions(cwd: string): Promise<void> {
    await agentSessionStore.archiveProjectSessions(cwd)
  }

  async createSession(cwd: string, chat: boolean): Promise<{ sessionId: string }> {
    const pi = await loadPi()
    const sessionManager = pi.SessionManager.create(cwd)
    const session = await this.instantiate(sessionManager, cwd)
    // 写穿透：会话元数据入库（标题后续由 TitleSummarizer 更新）。
    // 项目会话按 cwd 查或建项目；对话（chat）无项目，cwd 为应用托管的独立目录。
    const project = chat ? null : await agentSessionStore.getOrCreateProject(cwd)
    await agentSessionStore.upsertSession({
      sessionId: session.sessionId,
      projectId: project?.id ?? null,
      cwd,
      title: '新会话'
    })
    return { sessionId: session.sessionId }
  }

  /** Open (or return the live handle for) a session and snapshot its state. */
  async openSession(sessionId: string): Promise<SessionSnapshotDto> {
    const live = this.sessions.get(sessionId)
    if (live) {
      return this.snapshot(sessionId, live)
    }

    // 存在性与 cwd 以 DB 为准：无记录即不存在；jsonl 只提供消息内容
    const record = await agentSessionStore.getSession(sessionId)
    if (!record) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const pi = await loadPi()
    const info = (await pi.SessionManager.listAll()).find((i) => i.id === sessionId)
    if (!info) {
      // 内容文件已被外部删除：清理 DB 行后按不存在处理
      await agentSessionStore.deleteSession(sessionId)
      throw new Error(`Session file missing: ${sessionId}`)
    }
    const sessionManager = pi.SessionManager.open(info.path)
    const session = await this.instantiate(sessionManager, record.cwd)
    const handle = this.sessions.get(session.sessionId)
    if (!handle) {
      throw new Error(`Failed to instantiate session: ${sessionId}`)
    }
    return this.snapshot(sessionId, handle)
  }

  /** 删除会话（dispose 运行时 + 删 jsonl + 清 DB 行），返回被删行供调用方做级联清理 */
  async deleteSession(sessionId: string): Promise<AgentSessionRow | null> {
    const record = await agentSessionStore.getSession(sessionId)

    const handle = this.sessions.get(sessionId)
    if (handle) {
      if (handle.session.isStreaming) {
        await handle.session.abort().catch(() => undefined)
      }
      handle.unsubscribe()
      handle.session.dispose()
      this.sessions.delete(sessionId)
    }
    this.deps.bridge.detach(sessionId)

    const pi = await loadPi()
    const info = (await pi.SessionManager.listAll()).find((i) => i.id === sessionId)
    if (info) {
      const { unlink } = await import('node:fs/promises')
      await unlink(info.path)
    }
    // 清理元数据索引
    await agentSessionStore.deleteSession(sessionId)
    return record
  }

  // ── Commands ──

  async prompt(sessionId: string, text: string, images?: ImageInputDto[]): Promise<void> {
    const handle = this.requireHandle(sessionId)
    handle.lastActiveAt = Date.now()
    // Resolve to acceptance asynchronously: prompt() resolves when the whole
    // run finishes, so report it through events instead of awaiting here.
    void handle.session
      .prompt(
        text,
        images?.length
          ? {
              images: images.map((img) => ({
                type: 'image' as const,
                data: img.data,
                mimeType: img.mimeType
              }))
            }
          : undefined
      )
      .catch((error) => {
        logger.error(`prompt failed for ${sessionId}`, error)
      })
  }

  async abort(sessionId: string): Promise<void> {
    const handle = this.requireHandle(sessionId)
    await handle.session.abort()
  }

  /**
   * 编辑历史用户消息并重发（edit-and-resend）：navigateTree 到目标用户消息
   * 使分支点落在其父条目（该消息及后续内容退出活动路径），再以新文本
   * prompt 生成新分支。会话内树形分支，不新建会话文件。
   */
  async editUserMessage(sessionId: string, timestamp: number, text: string): Promise<void> {
    const handle = this.requireHandle(sessionId)
    if (handle.session.isStreaming) {
      throw new Error('会话正在生成中，请等待完成后再编辑')
    }

    const target = handle.sessionManager.getEntries().find((entry) => {
      if (entry.type !== 'message') return false
      const message = (entry as { message: { role?: string; timestamp?: number } }).message
      return message.role === 'user' && message.timestamp === timestamp
    })
    if (!target) {
      throw new Error(`Message not found (timestamp=${timestamp})`)
    }

    await handle.session.navigateTree(target.id, { summarize: false })
    handle.lastActiveAt = Date.now()
    void handle.session.prompt(text).catch((error) => {
      logger.error(`edit-resend prompt failed for ${sessionId}`, error)
    })
  }

  async setModel(sessionId: string, ref: ModelRefDto): Promise<void> {
    const handle = this.requireHandle(sessionId)
    const model = this.deps.getModelRuntime().getModel(ref.provider, ref.modelId)
    if (!model) {
      throw new Error(`Model not found: ${ref.provider}/${ref.modelId}`)
    }
    await handle.session.setModel(model)
    this.deps.cache.set(SELECTED_MODEL_CACHE_KEY, ref)
    broadcastSessionMeta({ sessionId, model: ref })
  }

  getSessionCwd(sessionId: string): string {
    return this.requireHandle(sessionId).cwd
  }

  disposeAll(): void {
    for (const [sessionId, handle] of this.sessions) {
      handle.unsubscribe()
      handle.session.dispose()
      this.deps.bridge.detach(sessionId)
    }
    this.sessions.clear()
  }

  // ── Internals ──

  private requireHandle(sessionId: string): SessionHandle {
    const handle = this.sessions.get(sessionId)
    if (!handle) {
      throw new Error(`Session not open: ${sessionId} (open it first)`)
    }
    return handle
  }

  private async instantiate(sessionManager: SessionManager, cwd: string): Promise<AgentSession> {
    const pi = await loadPi()
    const modelRuntime = this.deps.getModelRuntime()

    // Only apply the cached model selection to fresh sessions — an existing
    // session's own persisted model takes precedence (createAgentSession
    // restores it when no explicit model is passed).
    const isFresh = sessionManager.getEntries().length === 0
    const savedRef = isFresh
      ? this.deps.cache.get<ModelRefDto>(SELECTED_MODEL_CACHE_KEY)
      : undefined
    const model = savedRef ? modelRuntime.getModel(savedRef.provider, savedRef.modelId) : undefined

    const { resourceLoader, settingsManager } = await this.deps.getResources(cwd)

    const { session } = await pi.createAgentSession({
      cwd,
      modelRuntime,
      sessionManager,
      resourceLoader,
      settingsManager,
      ...(model ? { model } : {})
    })

    const unsubscribe = session.subscribe((event) => {
      this.deps.bridge.forward(session.sessionId, event)
      if (event.type === 'agent_start') {
        broadcastSessionMeta({ sessionId: session.sessionId, isStreaming: true })
      } else if (event.type === 'agent_settled') {
        broadcastSessionMeta({ sessionId: session.sessionId, isStreaming: false })
        // 会话活动刷新最近时间（驱动列表排序），失败不影响主流程
        void agentSessionStore
          .touchSession(session.sessionId, Date.now())
          .catch((error) => logger.warn('touchSession failed', error))
      } else if (event.type === 'agent_end') {
        this.deps.onAgentEnd?.(session, sessionManager)
      }
    })

    this.sessions.set(session.sessionId, {
      session,
      sessionManager,
      cwd,
      unsubscribe,
      lastActiveAt: Date.now()
    })
    this.evictIfNeeded()
    return session
  }

  /** Dispose least-recently-active idle sessions beyond the soft cap. */
  private evictIfNeeded(): void {
    if (this.sessions.size <= MAX_LIVE_SESSIONS) return
    const idle = [...this.sessions.entries()]
      .filter(([, h]) => !h.session.isStreaming)
      .sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt)
    for (const [sessionId, handle] of idle.slice(0, this.sessions.size - MAX_LIVE_SESSIONS)) {
      handle.unsubscribe()
      handle.session.dispose()
      this.deps.bridge.detach(sessionId)
      this.sessions.delete(sessionId)
    }
  }

  private snapshot(sessionId: string, handle: SessionHandle): SessionSnapshotDto {
    const model = handle.session.model
    const infoName = handle.sessionManager.getSessionName()
    const firstUserText = toMessageDtos(handle.session.messages)
      .filter((m) => m.role === 'user')
      .map((m) => extractUserText(m.content))
      .find((t) => t.length > 0)
    return {
      sessionId,
      cwd: handle.cwd,
      title: infoName || firstUserText?.slice(0, 30) || '新会话',
      updatedAt: Date.now(),
      messages: toMessageDtos(handle.session.messages),
      isStreaming: handle.session.isStreaming,
      model: model ? { provider: model.provider, modelId: model.id } : null
    }
  }
}
