/**
 * Agent IPC route schemas + event payload registration.
 *
 * Route inputs are untrusted renderer data and are always parsed (IpcRouter).
 * Output schemas exist for type inference; complex nested DTOs (messages,
 * events) use `z.custom` pass-throughs because main is the TCB that constructs
 * them — see ipcSchemas.ts, "renderer trusts events and never re-parses".
 *
 * Renderer code MUST `import type` from this module so zod never enters the
 * renderer bundle.
 */
import * as z from 'zod'

import { defineRoute } from '../ipc/define'
import { AGENT_THINKING_LEVELS, type SessionListsDto } from './api/AgentDataApi'
import type {
  AgentMcpChangedPayload,
  AgentMessageDto,
  AgentPackageChangedPayload,
  AgentPackageProgressPayload,
  AgentPackageUpdateDto,
  AgentSessionEventPayload,
  AgentSessionMetaPayload,
  AgentSkillChangedPayload,
  AgentSkillDto,
  McpServerDto,
  ModelInfoDto,
  ModelRefDto,
  SessionSnapshotDto,
  SessionSummaryDto
} from './types'

const sessionId = z.string().min(1)

const modelRefSchema = z.strictObject({
  provider: z.string().min(1),
  modelId: z.string().min(1)
})

const sessionSummarySchema = z.strictObject({
  sessionId: z.string(),
  cwd: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional()
})

const projectTreeNodeSchema = z.strictObject({
  id: z.string(),
  cwd: z.string(),
  name: z.string(),
  pinned: z.boolean(),
  latestAt: z.number(),
  sessions: z.array(sessionSummarySchema)
})

const modelInfoSchema = z.strictObject({
  provider: z.string(),
  modelId: z.string(),
  name: z.string(),
  reasoning: z.boolean(),
  contextWindow: z.number()
})

const imageInputSchema = z.strictObject({
  data: z.string().min(1),
  mimeType: z.string().regex(/^image\//)
})

/**
 * 包 source 白名单：npm:/git:/协议 URL/本地绝对路径（含 ~）。
 * 与 pi 的 source 规则对齐，防止渲染层传入任意字符串被当作 shell 参数。
 */
const packageSourceSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(
    /^(npm:\S+|git:\S+|https?:\/\/\S+|ssh:\/\/\S+|git:\/\/\S+|\/\S+|~\/\S+|[a-zA-Z]:[\\/]\S+)$/,
    '不支持的包来源格式（支持 npm: / git: / URL / 本地绝对路径）'
  )

const packageDtoSchema = z.strictObject({
  source: z.string(),
  scope: z.union([z.literal('user'), z.literal('project')]),
  type: z.union([z.literal('npm'), z.literal('git'), z.literal('local')]),
  name: z.string(),
  version: z.string().nullable(),
  description: z.string().nullable(),
  installed: z.boolean(),
  pinned: z.boolean(),
  isBuiltin: z.boolean(),
  enabled: z.boolean(),
  builtinStatus: z
    .union([z.literal('ok'), z.literal('installing'), z.literal('failed')])
    .nullable(),
  builtinError: z.string().nullable()
})

const mcpServerSchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, '名称仅支持字母、数字、- _ .'),
  type: z.union([z.literal('stdio'), z.literal('http')]),
  command: z.string().max(500),
  args: z.array(z.string().max(500)).max(64),
  env: z.record(z.string().max(128), z.string().max(2000)),
  cwd: z.string().max(500),
  url: z.string().max(2000),
  headers: z.record(z.string().max(128), z.string().max(2000)),
  disabled: z.boolean()
})

const skillDtoSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  filePath: z.string(),
  sourceLabel: z.string(),
  enabled: z.boolean()
})

export const agentRequestSchemas = {
  'agent.workspace.pick': defineRoute({
    input: z.strictObject({ defaultPath: z.string().optional() }),
    output: z.strictObject({ path: z.string() }).nullable()
  }),
  'agent.workspace.getRecent': defineRoute({
    input: z.void(),
    output: z.strictObject({ path: z.string() }).nullable()
  }),
  'agent.workspace.reveal': defineRoute({
    input: z.strictObject({ path: z.string().min(1) }),
    output: z.void()
  }),
  'agent.sessionLists.get': defineRoute({
    input: z.void(),
    output: z.strictObject({
      projects: z.array(projectTreeNodeSchema),
      chats: z.array(sessionSummarySchema)
    })
  }),
  'agent.session.create': defineRoute({
    input: z.strictObject({ cwd: z.string().min(1).optional() }),
    output: z.strictObject({ sessionId: z.string().min(1), cwd: z.string().min(1) })
  }),
  'agent.session.open': defineRoute({
    input: z.strictObject({ sessionId }),
    output: z.custom<SessionSnapshotDto>(() => true)
  }),
  'agent.session.delete': defineRoute({
    input: z.strictObject({ sessionId }),
    output: z.void()
  }),
  'agent.session.setPinned': defineRoute({
    input: z.strictObject({ sessionId, pinned: z.boolean() }),
    output: z.void()
  }),
  'agent.session.setArchived': defineRoute({
    input: z.strictObject({ sessionId, archived: z.boolean() }),
    output: z.void()
  }),
  'agent.project.setPinned': defineRoute({
    input: z.strictObject({ cwd: z.string().min(1), pinned: z.boolean() }),
    output: z.void()
  }),
  'agent.project.setRemoved': defineRoute({
    input: z.strictObject({ cwd: z.string().min(1), removed: z.boolean() }),
    output: z.void()
  }),
  'agent.project.archiveSessions': defineRoute({
    input: z.strictObject({ cwd: z.string().min(1) }),
    output: z.void()
  }),
  'agent.session.prompt': defineRoute({
    input: z.strictObject({
      sessionId,
      text: z.string().min(1),
      images: z.array(imageInputSchema).max(8).optional(),
      thinkingLevel: z.enum(AGENT_THINKING_LEVELS).optional()
    }),
    output: z.void()
  }),
  'agent.session.edit': defineRoute({
    input: z.strictObject({
      sessionId,
      /** 目标用户消息的时间戳（定位会话树条目） */
      timestamp: z.number(),
      text: z.string().min(1)
    }),
    output: z.void()
  }),
  'agent.session.abort': defineRoute({
    input: z.strictObject({ sessionId }),
    output: z.void()
  }),
  'agent.model.listAvailable': defineRoute({
    input: z.void(),
    output: z.array(modelInfoSchema)
  }),
  'agent.model.set': defineRoute({
    input: z.strictObject({ sessionId, ...modelRefSchema.shape }),
    output: z.void()
  }),
  'agent.artifact.open': defineRoute({
    input: z.strictObject({ sessionId, path: z.string().min(1) }),
    output: z.void()
  }),
  'agent.package.list': defineRoute({
    input: z.void(),
    output: z.array(packageDtoSchema)
  }),
  'agent.package.checkUpdates': defineRoute({
    input: z.void(),
    output: z.array(z.custom<AgentPackageUpdateDto>(() => true))
  }),
  'agent.package.install': defineRoute({
    input: z.strictObject({ source: packageSourceSchema }),
    output: z.void()
  }),
  'agent.package.remove': defineRoute({
    input: z.strictObject({ source: z.string().min(1) }),
    output: z.void()
  }),
  'agent.package.update': defineRoute({
    input: z.strictObject({ source: z.string().min(1).optional() }),
    output: z.void()
  }),
  'agent.package.setEnabled': defineRoute({
    input: z.strictObject({ source: z.string().min(1), enabled: z.boolean() }),
    output: z.void()
  }),
  'agent.package.retryBuiltin': defineRoute({
    input: z.void(),
    output: z.void()
  }),
  'agent.package.pickLocalDir': defineRoute({
    input: z.void(),
    output: z.strictObject({ path: z.string() }).nullable()
  }),
  'agent.mcp.list': defineRoute({
    input: z.void(),
    output: z.array(z.custom<McpServerDto>(() => true))
  }),
  'agent.mcp.save': defineRoute({
    input: z.strictObject({
      /** 编辑已有服务器时传原名（允许改名）；新建不传 */
      originalName: z.string().min(1).optional(),
      server: mcpServerSchema
    }),
    output: z.void()
  }),
  'agent.mcp.setDisabled': defineRoute({
    input: z.strictObject({ name: z.string().min(1), disabled: z.boolean() }),
    output: z.void()
  }),
  'agent.mcp.remove': defineRoute({
    input: z.strictObject({ name: z.string().min(1) }),
    output: z.void()
  }),
  'agent.skill.list': defineRoute({
    input: z.void(),
    output: z.array(skillDtoSchema)
  }),
  'agent.skill.setEnabled': defineRoute({
    input: z.strictObject({ filePath: z.string().min(1), enabled: z.boolean() }),
    output: z.void()
  }),
  'agent.skill.reveal': defineRoute({
    input: z.strictObject({ filePath: z.string().min(1) }),
    output: z.void()
  })
}

/** Agent event payloads, intersected into the global IpcEventSchemas registry. */
export interface AgentEventSchemas {
  'agent.session.event': AgentSessionEventPayload
  'agent.session.meta': AgentSessionMetaPayload
  'agent.sessionLists.changed': SessionListsDto
  'agent.package.progress': AgentPackageProgressPayload
  'agent.package.changed': AgentPackageChangedPayload
  'agent.mcp.changed': AgentMcpChangedPayload
  'agent.skill.changed': AgentSkillChangedPayload
}

// Type-only re-exports referenced by z.custom generic parameters above and by
// consumers of the route map (kept here so handler files import from one place).
export type {
  AgentMessageDto,
  AgentSkillDto,
  McpServerDto,
  ModelInfoDto,
  ModelRefDto,
  SessionSnapshotDto,
  SessionSummaryDto
}
