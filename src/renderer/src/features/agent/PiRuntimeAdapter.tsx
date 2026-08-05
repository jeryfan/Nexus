import {
  SimpleImageAttachmentAdapter,
  useExternalStoreRuntime,
  type AppendMessage,
  type AssistantRuntime
} from '@assistant-ui/react'
import type {
  AgentMessageDto,
  ImageInputDto,
  ToolResultMessageDto,
  UserMessageDto
} from '@shared/agent/types'
import { useCallback, useMemo, useRef } from 'react'

import { useAgentStore } from './agentStore'
import { convertAgentMessage, type ToolContext } from './converters'
import type { ToolJoinEntry } from './eventReducer'

const EMPTY_TOOL_RESULTS: ReadonlyMap<string, ToolResultMessageDto> = new Map()
const EMPTY_TOOL_JOIN: Record<string, ToolJoinEntry> = {}

// 模块单例：此前每次 render new 一个（流式期间 20 次/秒的分配 churn）
const attachmentAdapter = new SimpleImageAttachmentAdapter()

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

function extractUserMessageText(message: UserMessageDto): string {
  if (typeof message.content === 'string') return message.content
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
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
  const toolJoin = sessionState?.toolJoin ?? EMPTY_TOOL_JOIN
  const toolResults = sessionState?.toolResults ?? EMPTY_TOOL_RESULTS
  const isRunning = sessionState?.isStreaming ?? false

  // toolResult 消息并入 tool-call part 展示，不作为独立消息喂给 runtime
  const displayMessages = useMemo(
    () => allMessages.filter((m) => m.role !== 'toolResult'),
    [allMessages]
  )

  // 工具上下文经 ref 读取，convertMessage 身份恒定：assistant-ui 的 WeakMap
  // 转换缓存在流式批次间存活，只有被 reducer 替换的消息对象会重转换
  //（此前依赖含每批必变的 toolResults，身份每批失效 → 全量消息重转换，O(n²)）。
  // 工具状态终态由 reducer 替换对应 assistant 消息身份精确失效缓存；
  // 流式起止的状态显示交给 runtime 的 auto status 派生（见 converters.ts）。
  const toolCtxRef = useRef<ToolContext>({ toolResults, toolJoin })
  toolCtxRef.current = { toolResults, toolJoin }

  const convertMessage = useCallback(
    (message: AgentMessageDto) => convertAgentMessage(message, toolCtxRef.current)!,
    []
  )

  // 线程列表仅在会话集合变化时重建（此前每次 render flatMap 全量重建）
  const threads = useMemo(
    () => [
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
    [draft, chats, projects]
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
    onReload: async (parentId) => {
      // 重新生成 = 以原文重发父用户消息（edit-and-resend 同一通道，在分支点
      // 生成新回复）。parentId 为被重载 assistant 回复的父消息 id。
      const timestamp = parentId?.startsWith('user:') ? Number(parentId.slice(5)) : NaN
      if (!Number.isFinite(timestamp)) return
      const userMessage = allMessages.find(
        (m): m is UserMessageDto => m.role === 'user' && m.timestamp === timestamp
      )
      if (!userMessage) return
      const text = extractUserMessageText(userMessage)
      if (!text) return
      await editMessage(timestamp, text)
    },
    onCancel: async () => {
      await abort()
    },
    adapters: {
      attachments: attachmentAdapter,
      threadList: {
        threadId: activeSessionId ?? undefined,
        threads,
        onSwitchToNewThread: () => createSession(),
        onSwitchToThread: (threadId) =>
          threadId === draft?.id ? activateDraft() : openSession(threadId),
        onDelete: (threadId) => (threadId === draft?.id ? discardDraft() : deleteSession(threadId))
      }
    }
  })
}
