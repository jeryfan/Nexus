import type { AgentEventDto, AgentMessageDto } from '@shared/agent/types'

/** Per-toolCallId execution join table entry. */
export interface ToolJoinEntry {
  status: 'running' | 'complete' | 'error'
  result?: unknown
  partialResult?: unknown
}

export interface SessionState {
  messages: AgentMessageDto[]
  isStreaming: boolean
  toolJoin: Record<string, ToolJoinEntry>
}

export const EMPTY_SESSION_STATE: SessionState = {
  messages: [],
  isStreaming: false,
  toolJoin: {}
}

function isSameMessage(a: AgentMessageDto, b: AgentMessageDto): boolean {
  return a.role === b.role && a.timestamp === b.timestamp
}

function upsertMessage(messages: AgentMessageDto[], message: AgentMessageDto): AgentMessageDto[] {
  const index = messages.findIndex((m) => isSameMessage(m, message))
  if (index === -1) return [...messages, message]
  const next = [...messages]
  next[index] = message
  return next
}

/**
 * Applies one batch of session events (AgentEventBridge's 50ms coalesced
 * payload) to the renderer-side session state. Delta events carry the full
 * latest partial, so replacement (not append) is the rule for updates.
 */
export function applyAgentEvents(state: SessionState, events: AgentEventDto[]): SessionState {
  let { messages, isStreaming, toolJoin } = state

  for (const event of events) {
    switch (event.type) {
      case 'agent_start':
        isStreaming = true
        break
      case 'agent_settled':
        isStreaming = false
        break
      case 'agent_end':
        if (!event.willRetry) isStreaming = false
        break
      case 'message_start':
      case 'message_end':
        messages = upsertMessage(messages, event.message)
        break
      case 'message_update':
        // partial 全量替换流式消息（key 为消息 timestamp，见 bridge 合并键）
        messages = upsertMessage(messages, event.message)
        break
      case 'turn_end':
        messages = upsertMessage(messages, event.message)
        for (const result of event.toolResults) {
          messages = upsertMessage(messages, result)
        }
        break
      case 'tool_execution_start':
        toolJoin = { ...toolJoin, [event.toolCallId]: { status: 'running' } }
        break
      case 'tool_execution_update':
        toolJoin = {
          ...toolJoin,
          [event.toolCallId]: {
            ...toolJoin[event.toolCallId],
            status: 'running',
            partialResult: event.partialResult
          }
        }
        break
      case 'tool_execution_end':
        toolJoin = {
          ...toolJoin,
          [event.toolCallId]: {
            status: event.isError ? 'error' : 'complete',
            result: event.result
          }
        }
        break
      default:
        // queue_update / compaction_* / auto_retry_*：第一阶段 UI 不消费
        break
    }
  }

  return { messages, isStreaming, toolJoin }
}
