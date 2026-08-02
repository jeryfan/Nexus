/**
 * Agent Session table schema
 *
 * 会话元数据索引（标题、时间、置顶/归档）。消息内容不进本表——
 * pi jsonl 是内容的事实源，本表仅服务于列表/项目树的快速查询。
 * 会话/项目的存在性以本库记录为准，不从 jsonl 文件反推。
 *
 * 会话分两类：
 * - 项目会话：project_id 非空，cwd = 项目工作区目录（用户显式选择）
 * - 对话：project_id 为空，cwd = 应用托管的独立目录（~/Documents/.nexus/chats/<uuid>），
 *   删除会话时连同目录回收
 *
 * 不变量：每个会话必须有独立 cwd；归属项目是可选的。
 */

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps } from './_columnHelpers'
import { agentProjectTable } from './agentProject'

export const agentSessionTable = sqliteTable(
  'agent_session',
  {
    /** 会话 id（pi 会话 UUID，与 jsonl 文件名对应） */
    id: text().primaryKey(),

    /** 所属项目；空 = 对话（无项目的独立工作区会话） */
    projectId: text('project_id').references(() => agentProjectTable.id, { onDelete: 'cascade' }),

    /** 会话工作目录（创建时定，不可变）：项目目录或对话独立目录 */
    cwd: text().notNull(),

    /** 展示标题（LLM 摘要或首条消息截断） */
    title: text().notNull(),

    pinned: integer({ mode: 'boolean' }).notNull().default(false),
    archived: integer({ mode: 'boolean' }).notNull().default(false),

    ...createUpdateTimestamps
  },
  (table) => [
    index('agent_session_project_idx').on(table.projectId, table.updatedAt),
    index('agent_session_updated_idx').on(table.updatedAt)
  ]
)

export type AgentSessionRow = typeof agentSessionTable.$inferSelect
export type InsertAgentSessionRow = typeof agentSessionTable.$inferInsert
