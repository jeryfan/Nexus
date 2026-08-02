import {
  SimpleImageAttachmentAdapter,
  useExternalStoreRuntime,
  type AppendMessage,
  type AssistantRuntime
} from '@assistant-ui/react'
import type { AgentMessageDto, ImageInputDto } from '@shared/agent/types'
import { useCallback, useMemo } from 'react'

import { useAgentStore } from './agentStore'
import { convertAgentMessage, indexToolResults } from './converters'

function parseImageDataUrl(url: string): ImageInputDto | null {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

function extractPrompt(message: AppendMessage): { text: string; images: ImageInputDto[] } {
  const text = message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
  const images = message.content
    .filter((part) => part.type === 'image')
    .map((part) => parseImageDataUrl(part.image))
    .filter((img) => img !== null)
  return { text, images }
}

/**
 * Bridges the agent store (pi sessions over IPC) to assistant-ui's
 * ExternalStoreRuntime。pi 原始消息作为泛型 T 直接喂入，
 * convertMessage 只做展示转换，保证后续 fork 对接无损往返。
 */
export function usePiRuntime(): AssistantRuntime {
  const projects = useAgentStore((s) => s.projects)
  const chats = useAgentStore((s) => s.chats)
  const draft = useAgentStore((s) => s.draft)
  const activeSessionId = useAgentStore((s) => s.activeSessionId)
  const sessionState = useAgentStore((s) =>
    s.activeSessionId ? s.sessionStates[s.activeSessionId] : undefined
  )
  const createSession = useAgentStore((s) => s.createSession)
  const activateDraft = useAgentStore((s) => s.activateDraft)
  const discardDraft = useAgentStore((s) => s.discardDraft)
  const openSession = useAgentStore((s) => s.openSession)
  const deleteSession = useAgentStore((s) => s.deleteSession)
  const sendPrompt = useAgentStore((s) => s.sendPrompt)
  const editMessage = useAgentStore((s) => s.editMessage)
  const abort = useAgentStore((s) => s.abort)

  const allMessages = useMemo(() => sessionState?.messages ?? [], [sessionState?.messages])
  const toolJoin = useMemo(() => sessionState?.toolJoin ?? {}, [sessionState?.toolJoin])
  const isRunning = sessionState?.isStreaming ?? false

  // toolResult 消息并入 tool-call part 展示，不作为独立消息喂给 runtime
  const displayMessages = useMemo(
    () => allMessages.filter((m) => m.role !== 'toolResult'),
    [allMessages]
  )
  const toolResults = useMemo(() => indexToolResults(allMessages), [allMessages])

  const convertMessage = useCallback(
    (message: AgentMessageDto, index: number) =>
      convertAgentMessage(message, {
        toolResults,
        toolJoin,
        isStreaming: isRunning,
        isLast: index === displayMessages.length - 1
      })!,
    [toolResults, toolJoin, isRunning, displayMessages.length]
  )

  return useExternalStoreRuntime<AgentMessageDto>({
    messages: displayMessages,
    isRunning,
    convertMessage,
    onNew: async (message) => {
      const { text, images } = extractPrompt(message)
      if (!text && images.length === 0) return
      await sendPrompt(text, images)
    },
    onEdit: async (message) => {
      // sourceId 为 convertMessage 写入的稳定 id（`user:<timestamp>`）
      const timestamp = message.sourceId?.startsWith('user:')
        ? Number(message.sourceId.slice(5))
        : NaN
      const text = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
      if (!Number.isFinite(timestamp) || !text) return
      await editMessage(timestamp, text)
    },
    onCancel: async () => {
      await abort()
    },
    adapters: {
      attachments: new SimpleImageAttachmentAdapter(),
      threadList: {
        threadId: activeSessionId ?? undefined,
        threads: [
          // 草稿（新会话）置顶，对话随后，项目会话按项目顺序
          ...(draft ? [{ status: 'regular' as const, id: draft.id, title: '新会话' }] : []),
          ...chats.map((s) => ({
            status: 'regular' as const,
            id: s.sessionId,
            title: s.title
          })),
          ...projects.flatMap((project) =>
            project.sessions.map((s) => ({
              status: 'regular' as const,
              id: s.sessionId,
              title: s.title
            }))
          )
        ],
        onSwitchToNewThread: () => createSession(),
        onSwitchToThread: (threadId) =>
          threadId === draft?.id ? activateDraft() : openSession(threadId),
        onDelete: (threadId) => (threadId === draft?.id ? discardDraft() : deleteSession(threadId))
      }
    }
  })
}
