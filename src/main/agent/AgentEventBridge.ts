import { IpcChannel } from '@shared/IpcChannel'
import type {
  AgentEventDto,
  AgentSessionEventPayload,
  AgentSessionMetaPayload
} from '@shared/agent/types'
import type { SessionListsDto } from '@shared/agent/api/AgentDataApi'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { BrowserWindow } from 'electron'

/**
 * pi event types forwarded to the renderer. Events outside this list
 * (entry_appended, session_info_changed, thinking_level_changed,
 * summarization_retry_*) carry no UI value in phase 1 and are dropped here
 * rather than leaked into the wire protocol.
 */
const FORWARDED_EVENT_TYPES: ReadonlySet<string> = new Set([
  'agent_start',
  'agent_end',
  'agent_settled',
  'turn_start',
  'turn_end',
  'message_start',
  'message_update',
  'message_end',
  'tool_execution_start',
  'tool_execution_update',
  'tool_execution_end',
  'queue_update',
  'compaction_start',
  'compaction_end',
  'auto_retry_start',
  'auto_retry_end'
])

const COALESCE_WINDOW_MS = 50

interface SessionBuffer {
  /** Pending events, with coalescing keys for replaceable delta events. */
  events: AgentEventDto[]
  /** Coalescing key → index into `events` (delta events replace in place). */
  keys: Map<string, number>
  timer: ReturnType<typeof setTimeout> | undefined
}

/**
 * Forwards pi session events to all windows over the generic IpcApi event
 * channel. Delta-heavy events (message_update, tool_execution_update) are
 * coalesced per key and flushed on a 50ms window — each carries the full
 * latest partial, so dropping superseded ones loses nothing. Boundary events
 * flush pending deltas first, preserving on-wire order.
 */
export class AgentEventBridge {
  private readonly buffers = new Map<string, SessionBuffer>()

  /** Feed one raw pi event (from the session subscription). */
  forward(sessionId: string, event: AgentSessionEvent): void {
    if (!FORWARDED_EVENT_TYPES.has(event.type)) return
    // Structural mirror: the whitelisted pi events match AgentEventDto field
    // for field (messages are JSON-safe), so the cast is sound by construction.
    const dto = event as unknown as AgentEventDto

    const key = this.coalescingKey(dto)
    if (key === undefined) {
      this.flush(sessionId)
      this.send(sessionId, [dto])
      return
    }
    this.coalesce(sessionId, key, dto)
  }

  /** Flush and forget a session's buffer (session disposed/deleted). */
  detach(sessionId: string): void {
    const buffer = this.buffers.get(sessionId)
    if (!buffer) return
    if (buffer.timer) clearTimeout(buffer.timer)
    if (buffer.events.length > 0) this.send(sessionId, buffer.events)
    this.buffers.delete(sessionId)
  }

  detachAll(): void {
    for (const sessionId of [...this.buffers.keys()]) this.detach(sessionId)
  }

  private coalescingKey(dto: AgentEventDto): string | undefined {
    if (dto.type === 'message_update') {
      return `msg:${dto.message.timestamp}`
    }
    if (dto.type === 'tool_execution_update') {
      return `tool:${dto.toolCallId}`
    }
    return undefined
  }

  private coalesce(sessionId: string, key: string, dto: AgentEventDto): void {
    let buffer = this.buffers.get(sessionId)
    if (!buffer) {
      buffer = { events: [], keys: new Map(), timer: undefined }
      this.buffers.set(sessionId, buffer)
    }

    const existing = buffer.keys.get(key)
    if (existing !== undefined) {
      buffer.events[existing] = dto
    } else {
      buffer.keys.set(key, buffer.events.length)
      buffer.events.push(dto)
    }

    buffer.timer ??= setTimeout(() => this.flush(sessionId), COALESCE_WINDOW_MS)
  }

  private flush(sessionId: string): void {
    const buffer = this.buffers.get(sessionId)
    if (!buffer) return
    if (buffer.timer) {
      clearTimeout(buffer.timer)
      buffer.timer = undefined
    }
    if (buffer.events.length > 0) {
      this.send(sessionId, buffer.events)
      buffer.events = []
      buffer.keys.clear()
    }
  }

  private send(sessionId: string, events: AgentEventDto[]): void {
    const payload: AgentSessionEventPayload = { sessionId, events }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannel.IpcApi_Event, 'agent.session.event', payload)
      }
    }
  }
}

/** Broadcast an `agent.session.meta` payload to all windows. */
export function broadcastSessionMeta(payload: AgentSessionMetaPayload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.IpcApi_Event, 'agent.session.meta', payload)
    }
  }
}

/** Broadcast `agent.sessionLists.changed`（会话列表全量，由 AgentSessionStore.onChanged 触发）. */
export function broadcastSessionListsChanged(lists: SessionListsDto): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.IpcApi_Event, 'agent.sessionLists.changed', lists)
    }
  }
}
