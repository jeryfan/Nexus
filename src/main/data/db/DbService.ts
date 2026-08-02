import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

import { application } from '@application'
import { loggerService } from '@logger'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import type { DbOrTx, DbType } from './types'

const logger = loggerService.withContext('DbService')

const USER_SCHEMA = `
CREATE TABLE IF NOT EXISTS user_provider (
  provider_id TEXT PRIMARY KEY NOT NULL,
  preset_provider_id TEXT,
  name TEXT NOT NULL,
  logo_key TEXT,
  endpoint_configs TEXT,
  default_chat_endpoint TEXT,
  api_keys TEXT DEFAULT '[]',
  auth_config TEXT,
  api_features TEXT,
  provider_settings TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  order_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS user_provider_preset_idx
  ON user_provider (preset_provider_id);
CREATE INDEX IF NOT EXISTS user_provider_enabled_idx
  ON user_provider (is_enabled);
CREATE INDEX IF NOT EXISTS user_provider_order_key_idx
  ON user_provider (order_key);

CREATE TABLE IF NOT EXISTS user_model (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  preset_model_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  "group" TEXT,
  capabilities TEXT NOT NULL DEFAULT '[]',
  input_modalities TEXT,
  output_modalities TEXT,
  endpoint_types TEXT,
  custom_endpoint_url TEXT,
  context_window INTEGER,
  max_input_tokens INTEGER,
  max_output_tokens INTEGER,
  supports_streaming INTEGER NOT NULL DEFAULT 1,
  reasoning TEXT,
  parameters TEXT,
  pricing TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_deprecated INTEGER NOT NULL DEFAULT 0,
  order_key TEXT NOT NULL,
  notes TEXT,
  user_overrides TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CONSTRAINT user_model_provider_model_unique UNIQUE (provider_id, model_id),
  FOREIGN KEY (provider_id) REFERENCES user_provider(provider_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_model_preset_idx
  ON user_model (preset_model_id);
CREATE INDEX IF NOT EXISTS user_model_provider_enabled_idx
  ON user_model (provider_id, is_enabled);
CREATE INDEX IF NOT EXISTS user_model_provider_id_order_key_idx
  ON user_model (provider_id, order_key);
`

const AGENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_project (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_project_cwd_idx
  ON agent_project (cwd);
CREATE INDEX IF NOT EXISTS agent_project_updated_idx
  ON agent_project (updated_at);

CREATE TABLE IF NOT EXISTS agent_session (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT,
  cwd TEXT NOT NULL,
  title TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES agent_project(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_session_project_idx
  ON agent_session (project_id, updated_at);
CREATE INDEX IF NOT EXISTS agent_session_updated_idx
  ON agent_session (updated_at);
`

/** 旧版 agent_project 行（cwd 主键时代） */
interface LegacyProjectRow {
  cwd: string
  pinned: number
  removed: number
  created_at: number
  updated_at: number
}

/** 旧版 agent_session 行（project_cwd 外键时代） */
interface LegacySessionRow {
  session_id: string
  project_cwd: string
  title: string
  pinned: number
  archived: number
  created_at: number
  updated_at: number
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * SQLite/Drizzle boundary retained from the old model-service implementation.
 * The original application has a large migration framework; this final app only
 * owns a handful of tables, so their bootstrap schema lives here.
 */
export class DbService {
  private readonly sqlite: Database.Database
  private readonly db: DbType

  constructor() {
    const databasePath = application.getPath('app.database.file')
    mkdirSync(dirname(databasePath), { recursive: true })

    this.sqlite = new Database(databasePath)
    this.sqlite.pragma('journal_mode = WAL')
    this.sqlite.pragma('synchronous = NORMAL')
    this.sqlite.pragma('foreign_keys = ON')
    this.sqlite.pragma('busy_timeout = 5000')
    this.sqlite.exec(USER_SCHEMA)
    this.migrateAgentTables()
    this.migrateAgentSessionCwd()
    this.sqlite.exec(AGENT_SCHEMA)

    this.db = drizzle({ client: this.sqlite, casing: 'snake_case' })
    logger.info('Model service database initialized', { databasePath })
  }

  getDb(): DbType {
    return this.db
  }

  withWriteTx<T>(fn: (tx: DbOrTx) => T): T {
    return this.db.transaction(fn, { behavior: 'immediate' })
  }

  close(): void {
    if (this.sqlite.open) {
      this.sqlite.close()
    }
  }

  /**
   * 一次性迁移：旧版 agent 表（agent_project 以 cwd 为主键、agent_session 以
   * project_cwd 为外键）→ 新模型（UUID 主键 + project_id 外键，对齐服务端
   * Project/Session 模型）。已为新 schema 或全新库时直接返回。
   */
  private migrateAgentTables(): void {
    const tableExists = (name: string): boolean =>
      this.sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(name) !== undefined
    if (!tableExists('agent_project')) return
    const columns = this.sqlite.prepare(`PRAGMA table_info(agent_project)`).all() as {
      name: string
    }[]
    if (columns.some((column) => column.name === 'id')) return

    logger.info('migrating legacy agent tables to UUID model')
    const projects = this.sqlite.prepare(`SELECT * FROM agent_project`).all() as LegacyProjectRow[]
    const sessions = tableExists('agent_session')
      ? (this.sqlite.prepare(`SELECT * FROM agent_session`).all() as LegacySessionRow[])
      : []

    this.sqlite.exec(`DROP TABLE IF EXISTS agent_session; DROP TABLE IF EXISTS agent_project;`)
    this.sqlite.exec(AGENT_SCHEMA)

    const insertProject = this.sqlite.prepare(
      `INSERT INTO agent_project (id, name, cwd, pinned, removed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const insertSession = this.sqlite.prepare(
      `INSERT INTO agent_session (id, project_id, cwd, title, pinned, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const idByCwd = new Map<string, string>()
    const ensureProject = (cwd: string, row?: LegacyProjectRow): string => {
      const existing = idByCwd.get(cwd)
      if (existing) return existing
      const id = randomUUID()
      const now = Date.now()
      insertProject.run(
        id,
        basename(cwd),
        cwd,
        row?.pinned ?? 0,
        row?.removed ?? 0,
        row?.created_at ?? now,
        row?.updated_at ?? now
      )
      idByCwd.set(cwd, id)
      return id
    }

    const migrate = this.sqlite.transaction(() => {
      for (const project of projects) ensureProject(project.cwd, project)
      for (const session of sessions) {
        // 旧外键失常（project 行缺失）时补建项目，保证 session 不丢
        const projectId = ensureProject(session.project_cwd)
        insertSession.run(
          session.session_id,
          projectId,
          session.project_cwd,
          session.title,
          session.pinned,
          session.archived,
          session.created_at,
          session.updated_at
        )
      }
    })
    migrate()
    logger.info('legacy agent tables migrated', {
      projects: projects.length,
      sessions: sessions.length
    })
  }

  /**
   * 一次性迁移：UUID 模型时代的 agent_session（project_id 非空、无 cwd 列）
   * → 对话/项目分设模型（project_id 可空、新增 cwd 列）。SQLite 不能改列
   * 约束，整表重建；cwd 由所属项目回填。已为新 schema 或表不存在时直接返回。
   */
  private migrateAgentSessionCwd(): void {
    const tableExists = this.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_session'`)
      .get()
    if (!tableExists) return
    const columns = this.sqlite.prepare(`PRAGMA table_info(agent_session)`).all() as {
      name: string
    }[]
    if (columns.some((column) => column.name === 'cwd')) return

    logger.info('migrating agent_session to chat/project split model')
    const migrate = this.sqlite.transaction(() => {
      this.sqlite.exec(`
        CREATE TABLE agent_session_new (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT,
          cwd TEXT NOT NULL,
          title TEXT NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES agent_project(id) ON DELETE CASCADE
        );
        INSERT INTO agent_session_new (id, project_id, cwd, title, pinned, archived, created_at, updated_at)
          SELECT s.id, s.project_id, p.cwd, s.title, s.pinned, s.archived, s.created_at, s.updated_at
          FROM agent_session s JOIN agent_project p ON p.id = s.project_id;
        DROP TABLE agent_session;
        ALTER TABLE agent_session_new RENAME TO agent_session;
      `)
    })
    migrate()
    logger.info('agent_session chat/project split migration done')
  }
}
