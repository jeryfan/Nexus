import type { AgentEventDto, AgentMessageDto, ToolResultMessageDto } from '@shared/agent/types'

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
  /** toolCallId → toolResult 索引；reducer 增量维护，纯文本 delta 批次保持身份稳定。 */
  toolResults: ReadonlyMap<string, ToolResultMessageDto>
}

const EMPTY_TOOL_RESULTS: ReadonlyMap<string, ToolResultMessageDto> = new Map()

export const EMPTY_SESSION_STATE: SessionState = {
  messages: [],
  isStreaming: false,
  toolJoin: {},
  toolResults: EMPTY_TOOL_RESULTS
}

function isSameMessage(a: AgentMessageDto, b: AgentMessageDto): boolean {
  return a.role === b.role && a.timestamp === b.timestamp
}

/**
 * Upsert one message. Streaming deltas always update the tail message, so the
 * tail is checked first — the common path is O(1) compare + one array copy
 * instead of a full scan.
 */
function upsertMessage(messages: AgentMessageDto[], message: AgentMessageDto): AgentMessageDto[] {
  const lastIndex = messages.length - 1
  if (lastIndex >= 0 && isSameMessage(messages[lastIndex], message)) {
    const next = messages.slice()
    next[lastIndex] = message
    return next
  }
  const index = messages.findIndex((m) => isSameMessage(m, message))
  if (index === -1) return [...messages, message]
  const next = messages.slice()
  next[index] = message
  return next
}

/** Copy-on-write add; identity preserved when the entry is unchanged. */
function addToToolResults(
  toolResults: ReadonlyMap<string, ToolResultMessageDto>,
  result: ToolResultMessageDto
): ReadonlyMap<string, ToolResultMessageDto> {
  if (toolResults.get(result.toolCallId) === result) return toolResults
  const next = new Map(toolResults)
  next.set(result.toolCallId, result)
  return next
}

/**
 * Replace (new object identity, same content) the assistant message carrying
 * the given toolCall. assistant-ui's converter caches by message object
 * identity (WeakMap), so this invalidates exactly that message's cached
 * conversion — its tool-call part status/result refreshes without discarding
 * the cache for the rest of the thread.
 */
function bumpAssistantWithToolCall(
  messages: AgentMessageDto[],
  toolCallId: string
): AgentMessageDto[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    if (!m.content.some((part) => part.type === 'toolCall' && part.id === toolCallId)) continue
    const next = messages.slice()
    next[i] = { ...m }
    return next
  }
  return messages
}

/**
 * Applies one batch of session events (AgentEventBridge's 50ms coalesced
 * payload) to the renderer-side session state. Delta events carry the full
 * latest partial, so replacement (not append) is the rule for updates.
 */
export function applyAgentEvents(state: SessionState, events: AgentEventDto[]): SessionState {
  let { messages, isStreaming, toolJoin, toolResults } = state

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
      case 'message_update':
        // partial 全量替换流式消息（key 为消息 timestamp，见 bridge 合并键）
        messages = upsertMessage(messages, event.message)
        if (event.message.role === 'toolResult') {
          toolResults = addToToolResults(toolResults, event.message)
        }
        break
      case 'turn_end':
        messages = upsertMessage(messages, event.message)
        for (const result of event.toolResults) {
          messages = upsertMessage(messages, result)
          toolResults = addToToolResults(toolResults, result)
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
        // 携带该 toolCall 的 assistant 消息换身份 → 其 tool-call part 用新
        // toolJoin 重转换（start/update 不改变转换输出，无需失效）
        messages = bumpAssistantWithToolCall(messages, event.toolCallId)
        break
      default:
        // queue_update / compaction_* / auto_retry_*：第一阶段 UI 不消费
        break
    }
  }

  return { messages, isStreaming, toolJoin, toolResults }
}
