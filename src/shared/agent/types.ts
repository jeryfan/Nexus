/**
 * Agent protocol DTOs — the wire contract between main and renderer.
 *
 * Structurally mirrors pi-coding-agent's message/event shapes (fields preserved,
 * JSON-serializable), but deliberately decoupled: the renderer never imports pi
 * types (not even `import type`), so a future kernel swap only touches the
 * main-process mapper. This module is pure types — no zod, no runtime code —
 * so it is safe to import from any bundle.
 */

// ── Content parts ────────────────────────────────────────────────────────────

export interface TextPartDto {
  type: 'text'
  text: string
  textSignature?: string
}

export interface ThinkingPartDto {
  type: 'thinking'
  thinking: string
  thinkingSignature?: string
  /** True when the provider redacted the thinking payload. */
  redacted?: boolean
}

export interface ImagePartDto {
  type: 'image'
  data: string
  mimeType: string
}

export interface ToolCallPartDto {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, unknown>
  thoughtSignature?: string
}

export type ContentPartDto = TextPartDto | ThinkingPartDto | ImagePartDto | ToolCallPartDto

// ── Usage ────────────────────────────────────────────────────────────────────

export interface UsageDto {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning?: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

// ── Messages (mirror pi LLM Message) ─────────────────────────────────────────

export interface UserMessageDto {
  role: 'user'
  content: string | (TextPartDto | ImagePartDto)[]
  timestamp: number
}

export type StopReasonDto = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'

export interface AssistantMessageDto {
  role: 'assistant'
  content: ContentPartDto[]
  api: string
  provider: string
  model: string
  usage: UsageDto
  stopReason: StopReasonDto
  errorMessage?: string
  timestamp: number
}

export interface ToolResultMessageDto {
  role: 'toolResult'
  toolCallId: string
  toolName: string
  content: (TextPartDto | ImagePartDto)[]
  isError: boolean
  timestamp: number
}

export type AgentMessageDto = UserMessageDto | AssistantMessageDto | ToolResultMessageDto

// ── Streaming events (mirror pi AssistantMessageEvent) ───────────────────────

export type AssistantMessageEventDto =
  | { type: 'start'; partial: AssistantMessageDto }
  | { type: 'text_start'; contentIndex: number; partial: AssistantMessageDto }
  | { type: 'text_delta'; contentIndex: number; delta: string; partial: AssistantMessageDto }
  | { type: 'text_end'; contentIndex: number; content: string; partial: AssistantMessageDto }
  | { type: 'thinking_start'; contentIndex: number; partial: AssistantMessageDto }
  | { type: 'thinking_delta'; contentIndex: number; delta: string; partial: AssistantMessageDto }
  | { type: 'thinking_end'; contentIndex: number; content: string; partial: AssistantMessageDto }
  | { type: 'toolcall_start'; contentIndex: number; partial: AssistantMessageDto }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string; partial: AssistantMessageDto }
  | {
      type: 'toolcall_end'
      contentIndex: number
      toolCall: ToolCallPartDto
      partial: AssistantMessageDto
    }
  | { type: 'done'; reason: 'stop' | 'length' | 'toolUse'; message: AssistantMessageDto }
  | { type: 'error'; reason: 'aborted' | 'error'; error: AssistantMessageDto }

// ── Session events (mirror pi AgentSessionEvent, UI-relevant subset) ─────────

export type AgentEventDto =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: AgentMessageDto[]; willRetry: boolean }
  | { type: 'agent_settled' }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AgentMessageDto; toolResults: ToolResultMessageDto[] }
  | { type: 'message_start'; message: AgentMessageDto }
  | {
      type: 'message_update'
      message: AgentMessageDto
      assistantMessageEvent: AssistantMessageEventDto
    }
  | { type: 'message_end'; message: AgentMessageDto }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | {
      type: 'tool_execution_update'
      toolCallId: string
      toolName: string
      args: unknown
      partialResult: unknown
    }
  | {
      type: 'tool_execution_end'
      toolCallId: string
      toolName: string
      result: unknown
      isError: boolean
    }
  | { type: 'queue_update'; steering: readonly string[]; followUp: readonly string[] }
  | { type: 'compaction_start'; reason: 'manual' | 'threshold' | 'overflow' }
  | {
      type: 'compaction_end'
      reason: 'manual' | 'threshold' | 'overflow'
      aborted: boolean
      willRetry: boolean
      errorMessage?: string
    }
  | {
      type: 'auto_retry_start'
      attempt: number
      maxAttempts: number
      delayMs: number
      errorMessage: string
    }
  | { type: 'auto_retry_end'; success: boolean; attempt: number; finalError?: string }

// ── Session / model surface ──────────────────────────────────────────────────

export interface ModelRefDto {
  provider: string
  modelId: string
}

export interface ModelInfoDto extends ModelRefDto {
  name: string
  reasoning: boolean
  contextWindow: number
}

export interface SessionSummaryDto {
  sessionId: string
  cwd: string
  title: string
  updatedAt: number
  /** 置顶（项目内优先排序） */
  pinned?: boolean
  /** 归档（默认从列表隐藏） */
  archived?: boolean
}

export interface SessionSnapshotDto extends SessionSummaryDto {
  messages: AgentMessageDto[]
  isStreaming: boolean
  model: ModelRefDto | null
}

export interface ImageInputDto {
  /** base64-encoded image data */
  data: string
  mimeType: string
}

// ── IPC event payloads ───────────────────────────────────────────────────────

/** `agent.session.event`: one batch of session events (50ms coalescing window). */
export interface AgentSessionEventPayload {
  sessionId: string
  events: AgentEventDto[]
}

/** `agent.session.meta`: out-of-band session metadata changes (title/model/state). */
export interface AgentSessionMetaPayload {
  sessionId: string
  title?: string
  model?: ModelRefDto | null
  isStreaming?: boolean
}

// ── Package management (pi packages) ────────────────────────────────────────

export type AgentPackageScope = 'user' | 'project'

export type AgentPackageType = 'npm' | 'git' | 'local'

/** 内置包 reconcile 状态（仅内置包有意义）。 */
export type AgentPackageBuiltinStatus = 'ok' | 'installing' | 'failed'

export interface AgentPackageDto {
  /** settings.json 中登记的 source（npm:/git:/URL/本地路径） */
  source: string
  scope: AgentPackageScope
  type: AgentPackageType
  /** 包名：已安装时读 package.json，否则从 source 推断 */
  name: string
  version: string | null
  description: string | null
  /** 已安装到磁盘（npm/git 源未安装时仅登记在 settings） */
  installed: boolean
  /** npm 带版本 / git 带 ref：钉版，不参与 update */
  pinned: boolean
  /** Nexus 内置包：reconcile 保障存在，不可删除，可禁用 */
  isBuiltin: boolean
  /** 内置包为 false 时其扩展被过滤不加载；用户包恒为 true */
  enabled: boolean
  builtinStatus: AgentPackageBuiltinStatus | null
  builtinError: string | null
}

/** `agent.package.checkUpdates` 的单条结果（可更新的 npm/git 包）。 */
export interface AgentPackageUpdateDto {
  source: string
  displayName: string
  type: 'npm' | 'git'
}

/** `agent.package.progress`：pi DefaultPackageManager ProgressEvent 的结构镜像。 */
export interface AgentPackageProgressPayload {
  type: 'start' | 'progress' | 'complete' | 'error'
  action: 'install' | 'remove' | 'update' | 'clone' | 'pull'
  source: string
  message?: string
}

export type AgentPackageChangedReason = 'install' | 'remove' | 'update' | 'reconcile' | 'toggle'

/** `agent.package.changed`：包集合或启用状态变化（loader 已 reload，UI 应刷新）。 */
export interface AgentPackageChangedPayload {
  reason: AgentPackageChangedReason
}

// ── MCP servers（pi-mcp-adapter 的 ~/.nexus/agent/mcp.json）─────────────────

export type McpServerType = 'stdio' | 'http'

/**
 * MCP 服务器配置（管理面 DTO）。只暴露 Nexus 表单管理的字段；mcp.json 中条目的
 * 其他高级字段（lifecycle/oauth/includeTools 等）保存时原样保留。
 */
export interface McpServerDto {
  name: string
  type: McpServerType
  /** stdio：启动命令（如 npx） */
  command: string
  /** stdio：命令参数 */
  args: string[]
  /** stdio：环境变量（合并进宿主环境） */
  env: Record<string, string>
  /** stdio：工作目录 */
  cwd: string
  /** http：服务地址 */
  url: string
  /** http：请求头 */
  headers: Record<string, string>
  /** 停用（保留配置但不连接） */
  disabled: boolean
}

/** `agent.mcp.changed`：mcp.json 已写入，新会话生效。 */
export interface AgentMcpChangedPayload {
  reason: 'save' | 'remove' | 'toggle'
}

// ── Skills ──────────────────────────────────────────────────────────────────

export interface AgentSkillDto {
  name: string
  description: string
  /** SKILL.md（或单文件 .md）路径，启用状态的稳定键 */
  filePath: string
  /** 来源标签：个人（全局）/ 项目 / 插件（包） */
  sourceLabel: string
  enabled: boolean
}

/** `agent.skill.changed`：技能启用状态变化（loader 已 reload，新会话生效）。 */
export interface AgentSkillChangedPayload {
  reason: 'toggle'
}
