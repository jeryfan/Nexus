// 浏览器会话持久化（workspace session 的浏览器字段切片）。
// 通道语义：get / set / patch（浅合并顶层字段）/ flush / set-sync。
// 裁剪: hostId 多 host 分区（Nexus 单 host）、终端领域归一化
// （sanitizeWorkspaceSessionTerminalRetirements / normalizeWorkspaceSessionPaneIdentities /
// pruneLocalTerminalScrollbackBuffers，依赖未迁移的终端持久化领域）均不保留；
// patch 含 browserUrlHistory 时保留 pruneWorkspaceSessionBrowserHistory 调用。
import { app } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { getDefaultWorkspaceSession } from '../../shared/browser/constants'
import type { WorkspaceSessionPatch, WorkspaceSessionState } from '../../shared/browser/types'
import { pruneWorkspaceSessionBrowserHistory } from '../../shared/browser/workspace-session-browser-history'
import { parseWorkspaceSession } from '../../shared/browser/workspace-session-schema'
import { loggerService } from '../core/logger/LoggerService'

const logger = loggerService.withContext('BrowserSessionStore')

const FLUSH_DEBOUNCE_MS = 150
// Why 150ms trailing + 5s max-wait：合并渲染层
// 高频 patch；max-wait 保证持续 patch 流下落盘不被无限推迟，把崩溃丢失窗口钉在 5s 内。
const SAVE_MAX_WAIT_MS = 5_000
const BACKUP_COUNT = 2

export class BrowserSessionStore {
  private readonly dataFile: string
  private state: WorkspaceSessionState
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private firstPendingFlushAt: number | null = null

  constructor(dataFile?: string) {
    this.dataFile = dataFile ?? join(app.getPath('userData'), 'nexus-browser-session.json')
    this.state = this.load()
  }

  private load(): WorkspaceSessionState {
    const primary = this.readJson(this.dataFile)
    if (primary !== null) {
      const parsed = parseWorkspaceSession(primary)
      if (parsed.ok) {
        return parsed.value
      }
      logger.error('Corrupt session file, trying backups:', parsed.error)
    }
    for (let i = 0; i < BACKUP_COUNT; i++) {
      const backup = this.readJson(`${this.dataFile}.bak.${i}`)
      if (backup === null) {
        continue
      }
      const reparsed = parseWorkspaceSession(backup)
      if (reparsed.ok) {
        return reparsed.value
      }
    }
    return getDefaultWorkspaceSession()
  }

  private readJson(file: string): unknown | null {
    try {
      if (!existsSync(file)) {
        return null
      }
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  getWorkspaceSession(): WorkspaceSessionState {
    return this.state
  }

  setWorkspaceSession(state: WorkspaceSessionState): void {
    this.state = pruneWorkspaceSessionBrowserHistory(state)
    this.scheduleFlush()
  }

  /** 浅合并顶层字段（渲染层 session-write-subscriber 只发变化切片） */
  patchWorkspaceSession(patch: WorkspaceSessionPatch): void {
    let next: WorkspaceSessionState = { ...this.state, ...patch }
    if (Object.hasOwn(patch, 'browserUrlHistory')) {
      next = pruneWorkspaceSessionBrowserHistory(next)
    }
    this.state = next
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    const now = Date.now()
    this.firstPendingFlushAt ??= now
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }
    const untilMaxWait = Math.max(0, this.firstPendingFlushAt + SAVE_MAX_WAIT_MS - now)
    const delay = Math.min(FLUSH_DEBOUNCE_MS, untilMaxWait)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.firstPendingFlushAt = null
      this.flush()
    }, delay)
  }

  /** 失败仅记录日志，用于 set-sync / will-quit 等不能抛错的路径。 */
  flush(): void {
    try {
      this.flushOrThrow()
    } catch (error) {
      logger.error('flush failed', error)
    }
  }

  /** durable 生命周期 RPC（session:flush）用：磁盘失败必须向调用方传播。 */
  flushOrThrow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.firstPendingFlushAt = null
    mkdirSync(dirname(this.dataFile), { recursive: true })
    // Why: 先完成主文件 durable write（tmp+rename），再轮换备份——
    // 轮换抛错不得阻断主写，否则备份盘满/权限问题会表现为 session 保存失败。
    const tmp = `${this.dataFile}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state), 'utf8')
    renameSync(tmp, this.dataFile)
    this.rotateBackups()
  }

  /** 逐槽位平移 .bak，任何一步失败仅记录日志不中断后续步骤。 */
  private rotateBackups(): void {
    if (!existsSync(this.dataFile)) {
      return
    }
    try {
      unlinkSync(`${this.dataFile}.bak.${BACKUP_COUNT - 1}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to remove oldest backup:', error)
      }
    }
    for (let i = BACKUP_COUNT - 2; i >= 0; i--) {
      const src = `${this.dataFile}.bak.${i}`
      const dst = `${this.dataFile}.bak.${i + 1}`
      if (existsSync(src)) {
        try {
          renameSync(src, dst)
        } catch (error) {
          logger.error('Failed to rotate backup', src, '->', dst, error)
        }
      }
    }
    try {
      copyFileSync(this.dataFile, `${this.dataFile}.bak.0`)
    } catch (error) {
      logger.error('Failed to snapshot current file to .bak.0:', error)
    }
  }
}

// Why: 模块 import 发生在 app ready 之前，而构造需要 app.getPath('userData')，
// 单例必须懒初始化到首个 IPC 调用。
let instance: BrowserSessionStore | null = null

export function getBrowserSessionStore(): BrowserSessionStore {
  if (!instance) {
    instance = new BrowserSessionStore()
  }
  return instance
}

/** will-quit 路径用：仅在渲染层曾触碰过 session 时落盘，避免为从未使用浏览器的装机写出空文件。 */
export function flushLoadedBrowserSessionStore(): void {
  instance?.flush()
}
