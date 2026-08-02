import type { ThreadMessageLike } from '@assistant-ui/react'
import type {
  AgentMessageDto,
  AssistantMessageDto,
  ContentPartDto,
  ToolResultMessageDto
} from '@shared/agent/types'

import type { ToolJoinEntry } from './eventReducer'

type MessageStatus = NonNullable<ThreadMessageLike['status']>
type ThreadMessagePart = Exclude<ThreadMessageLike['content'], string>[number]

function assistantStatus(message: AssistantMessageDto, isStreaming: boolean): MessageStatus {
  if (message.stopReason === 'error') return { type: 'incomplete', reason: 'error' }
  if (message.stopReason === 'aborted') return { type: 'incomplete', reason: 'cancelled' }
  if (isStreaming) return { type: 'running' }
  return { type: 'complete', reason: 'stop' }
}

function toolPartStatus(join: ToolJoinEntry | undefined): MessageStatus {
  if (!join || join.status === 'running') return { type: 'running' }
  if (join.status === 'error') return { type: 'incomplete', reason: 'error' }
  return { type: 'complete', reason: 'stop' }
}

function convertContentPart(
  part: ContentPartDto,
  ctx: {
    toolResults: ReadonlyMap<string, ToolResultMessageDto>
    toolJoin: Record<string, ToolJoinEntry>
  }
): ThreadMessagePart | null {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text }
    case 'thinking':
      return { type: 'reasoning', text: part.thinking }
    case 'image':
      return { type: 'image', image: `data:${part.mimeType};base64,${part.data}` }
    case 'toolCall': {
      const result = ctx.toolResults.get(part.id)
      const join = ctx.toolJoin[part.id]
      const resultText = result
        ? result.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('')
        : typeof join?.result === 'string'
          ? join.result
          : join?.result !== undefined
            ? JSON.stringify(join.result)
            : undefined
      return {
        type: 'tool-call',
        toolCallId: part.id,
        toolName: part.name,
        args: part.arguments,
        ...(resultText !== undefined ? { result: resultText } : {}),
        ...(result?.isError ? { isError: true } : {}),
        status: toolPartStatus(join)
      } as ThreadMessagePart
    }
    default:
      return null
  }
}

/**
 * DTO → assistant-ui ThreadMessageLike. pi 原始消息保持在 store（无损往返），
 * 这里只做展示转换：toolResult 消息不单独展示，其结果并入对应
 * tool-call part。
 */
export function convertAgentMessage(
  message: AgentMessageDto,
  ctx: {
    toolResults: ReadonlyMap<string, ToolResultMessageDto>
    toolJoin: Record<string, ToolJoinEntry>
    isStreaming: boolean
    isLast: boolean
  }
): ThreadMessageLike | null {
  if (message.role === 'user') {
    return {
      // 稳定 id：编辑重发时经 AppendMessage.sourceId 回传，用于定位原消息
      id: `user:${message.timestamp}`,
      role: 'user',
      content:
        typeof message.content === 'string'
          ? [{ type: 'text' as const, text: message.content }]
          : message.content.map((part) => convertContentPart(part, ctx)).filter((p) => p !== null),
      createdAt: new Date(message.timestamp),
      attachments: []
    }
  }

  if (message.role === 'assistant') {
    const running = ctx.isStreaming && ctx.isLast
    return {
      id: `assistant:${message.timestamp}`,
      role: 'assistant',
      content: message.content
        .map((part) => convertContentPart(part, ctx))
        .filter((p) => p !== null),
      status: assistantStatus(message, running),
      createdAt: new Date(message.timestamp),
      ...(message.errorMessage ? { metadata: { error: message.errorMessage } } : {})
    } as ThreadMessageLike
  }

  // toolResult 并入 tool-call part，不作为独立消息
  return null
}

/** Build the toolCallId → toolResult index for one message list. */
export function indexToolResults(
  messages: AgentMessageDto[]
): ReadonlyMap<string, ToolResultMessageDto> {
  const map = new Map<string, ToolResultMessageDto>()
  for (const message of messages) {
    if (message.role === 'toolResult') {
      map.set(message.toolCallId, message)
    }
  }
  return map
}
