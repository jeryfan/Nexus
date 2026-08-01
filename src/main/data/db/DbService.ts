import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { application } from '@application'
import { loggerService } from '@logger'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import type { DbOrTx, DbType } from './types'

const logger = loggerService.withContext('DbService')

const MODEL_SERVICE_SCHEMA = `
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

/**
 * SQLite/Drizzle boundary retained from the old model-service implementation.
 * The original application has a large migration framework; this final app only
 * owns the two model-service tables, so their bootstrap schema lives here.
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
    this.sqlite.exec(MODEL_SERVICE_SCHEMA)

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
}
