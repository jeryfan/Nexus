/**
 * AgentDataApi — agent 数据面接口（PORT）。
 *
 * 渲染层只依赖本接口获取/变更数据，不关心数据来自本地数据库还是团队云端：
 * - LocalAgentApiService：IPC → 主进程 → SQLite（本地个人客户端）
 * - CloudAgentApiService：HTTP → 团队后端（未来实现同一接口）
 *
 * 约定：
 * - 所有方法返回统一信封 {@link ApiResult}；流式事件走 subscribe* 通道，不进信封
 * - 查询类方法返回的数据已由服务端完成分组/排序/标志位合并，调用方薄渲染
 * - 本地专属能力（目录选择、访达显示等）不在本接口内
 */
import type {
  AgentEventDto,
  AgentSessionEventPayload,
  AgentSessionMetaPayload,
  ImageInputDto,
  ModelInfoDto,
  ModelRefDto,
  SessionSnapshotDto,
  SessionSummaryDto
} from '../types'
import type { ApiResult } from './result'

/** 项目树节点（服务端组装完毕：排序、标志位合并、归档过滤均已完成） */
export interface ProjectTreeNode {
  /** 项目 id（UUID，客户端生成） */
  id: string
  cwd: string
  name: string
  pinned: boolean
  latestAt: number
  sessions: SessionSummaryDto[]
}

/** 项目标志位（置顶/移除） */
export interface ProjectFlagsDto {
  pinned?: boolean
  removed?: boolean
}

/** 会话列表全貌：项目树（工作区会话）+ 对话列表（独立工作区会话） */
export interface SessionListsDto {
  projects: ProjectTreeNode[]
  chats: SessionSummaryDto[]
}

export interface CreateSessionInput {
  /** 项目工作区目录；缺省时创建对话（应用托管的独立工作区） */
  cwd?: string
}

export interface PromptInput {
  sessionId: string
  text: string
  images?: ImageInputDto[]
  /** 思考程度（pi ThinkingLevel 子集）；缺省 = 不改动会话当前级别。 */
  thinkingLevel?: AgentThinkingLevel
}

/** 与 pi `ThinkingLevel` 对齐的可选思考程度。 */
export const AGENT_THINKING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
] as const
export type AgentThinkingLevel = (typeof AGENT_THINKING_LEVELS)[number]

export interface EditMessageInput {
  sessionId: string
  /** 目标用户消息时间戳（定位会话树条目） */
  timestamp: number
  text: string
}

export type Unsubscribe = () => void

export interface AgentDataApi {
  // ── 会话列表（项目树 + 对话） ──
  getSessionLists(): Promise<ApiResult<SessionListsDto>>
  subscribeListsChanged(handler: (lists: SessionListsDto) => void): Unsubscribe

  // ── 会话 ──
  createSession(input: CreateSessionInput): Promise<ApiResult<{ sessionId: string; cwd: string }>>
  openSession(sessionId: string): Promise<ApiResult<SessionSnapshotDto>>
  deleteSession(sessionId: string): Promise<ApiResult<void>>
  setPinned(sessionId: string, pinned: boolean): Promise<ApiResult<void>>
  setArchived(sessionId: string, archived: boolean): Promise<ApiResult<void>>
  prompt(input: PromptInput): Promise<ApiResult<void>>
  editMessage(input: EditMessageInput): Promise<ApiResult<void>>
  abort(sessionId: string): Promise<ApiResult<void>>

  // ── 项目 ──
  setProjectPinned(cwd: string, pinned: boolean): Promise<ApiResult<void>>
  setProjectRemoved(cwd: string, removed: boolean): Promise<ApiResult<void>>
  archiveProjectSessions(cwd: string): Promise<ApiResult<void>>

  // ── 事件流（不进信封） ──
  subscribeSessionEvents(handler: (payload: AgentSessionEventPayload) => void): Unsubscribe
  subscribeSessionMeta(handler: (payload: AgentSessionMetaPayload) => void): Unsubscribe

  // ── 模型 ──
  listAvailableModels(): Promise<ApiResult<ModelInfoDto[]>>
  setModel(sessionId: string, ref: ModelRefDto): Promise<ApiResult<void>>
}

/**
 * 本地专属能力（不进 AgentDataApi）：目录选择、访达显示、默认工作区解析。
 * 云端实现的语义不同（云端 agent 在服务端运行，无本地文件系统概念）。
 */
export interface LocalCapabilitiesApi {
  pickWorkspace(defaultPath?: string): Promise<ApiResult<{ path: string } | null>>
  getRecentWorkspace(): Promise<ApiResult<{ path: string } | null>>
  revealInFinder(path: string): Promise<ApiResult<void>>
  openArtifact(sessionId: string, path: string): Promise<ApiResult<void>>
}

// 事件 DTO 复用（订阅通道负载）
export type { AgentEventDto }
