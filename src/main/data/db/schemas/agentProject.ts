/**
 * Agent Project table schema
 *
 * 项目（agent 工作区目录）为一等实体：会话元数据按项目归属，
 * 项目级标志位（置顶/移除）持久化于此。与 pi jsonl 的关系：
 * 本表只存索引元数据，消息内容永远在 pi 会话文件中。
 *
 * 模型对齐服务端 Project（去 owner_id）：UUID 主键，cwd 唯一——
 * cwd 是宿主机路径，可改（目录移动/重命名）而项目身份不变。
 */

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps, uuidPrimaryKey } from './_columnHelpers'

export const agentProjectTable = sqliteTable(
  'agent_project',
  {
    /** 项目 id（UUID，客户端生成） */
    id: uuidPrimaryKey(),

    /** 展示名（默认 cwd basename） */
    name: text().notNull(),

    /** 工作区绝对路径（宿主机本地目录，唯一） */
    cwd: text().notNull(),

    /** 置顶（项目排序优先） */
    pinned: integer({ mode: 'boolean' }).notNull().default(false),

    /** 从列表移除（会话文件保留在磁盘） */
    removed: integer({ mode: 'boolean' }).notNull().default(false),

    ...createUpdateTimestamps
  },
  (table) => [
    uniqueIndex('agent_project_cwd_idx').on(table.cwd),
    index('agent_project_updated_idx').on(table.updatedAt)
  ]
)

export type AgentProjectRow = typeof agentProjectTable.$inferSelect
export type InsertAgentProjectRow = typeof agentProjectTable.$inferInsert
