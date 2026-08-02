import type { AgentMcpChangedPayload, McpServerDto } from '@shared/agent/types'
import { loggerService } from '@logger'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'

import { broadcastIpcEvent } from './broadcast'

const logger = loggerService.withContext('McpConfigService')

/**
 * mcp.json 根结构（pi-mcp-adapter McpConfig 的管理面子集）。
 * 未知字段（imports/settings 及条目内高级字段）读写时原样保留。
 */
interface McpConfigFile {
  mcpServers?: Record<string, Record<string, unknown>>
  [key: string]: unknown
}

/** stdio 与 http 互斥的字段，保存时按类型清理另一侧。 */
const STDIO_ONLY_FIELDS = ['command', 'args', 'env', 'cwd', 'socket'] as const
const HTTP_ONLY_FIELDS = [
  'url',
  'headers',
  'auth',
  'bearerToken',
  'bearerTokenEnv',
  'oauth'
] as const

/**
 * MCP 服务器配置管理：对 `<agentDir>/mcp.json`（pi-mcp-adapter 的 pi-global
 * 写路径，经 PI_CODING_AGENT_DIR 对齐）做 CRUD。
 *
 * 注意：adapter 还会读 ~/.config/mcp/mcp.json、~/.agents/mcp.json、项目 .mcp.json
 * 等其他来源 —— 本服务只管理 Nexus 自有的这一份（其他来源的服务器不在列表中）。
 * 写入后广播 agent.mcp.changed；adapter 在 session_start 读配置，故新会话生效。
 */
export class McpConfigService {
  constructor(private readonly getAgentDir: () => string) {}

  list(): McpServerDto[] {
    const config = this.read()
    return Object.entries(config.mcpServers ?? {})
      .map(([name, entry]) => toDto(name, entry))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  save(originalName: string | undefined, server: McpServerDto): void {
    const config = this.read()
    const servers = { ...(config.mcpServers ?? {}) }
    // 保留条目上的高级字段（lifecycle/oauth/includeTools 等），覆盖管理面字段；
    // 必须在 delete 之前取，否则改名场景会丢
    const previous = servers[originalName ?? server.name]

    if (originalName && originalName !== server.name) {
      if (!(originalName in servers)) throw new Error(`服务器不存在: ${originalName}`)
      if (server.name in servers) throw new Error(`名称已被占用: ${server.name}`)
      delete servers[originalName]
    } else if (!originalName && server.name in servers) {
      throw new Error(`服务器已存在: ${server.name}`)
    }

    const entry: Record<string, unknown> = { ...(previous ?? {}) }
    if (server.type === 'stdio') {
      for (const key of HTTP_ONLY_FIELDS) delete entry[key]
      entry.command = server.command
      if (server.args.length > 0) entry.args = server.args
      else delete entry.args
      if (Object.keys(server.env).length > 0) entry.env = server.env
      else delete entry.env
      if (server.cwd) entry.cwd = server.cwd
      else delete entry.cwd
    } else {
      for (const key of STDIO_ONLY_FIELDS) delete entry[key]
      entry.url = server.url
      if (Object.keys(server.headers).length > 0) entry.headers = server.headers
      else delete entry.headers
    }
    if (server.disabled) entry.disabled = true
    else delete entry.disabled

    servers[server.name] = entry
    config.mcpServers = servers
    this.write(config)
    this.broadcastChanged('save')
  }

  setDisabled(name: string, disabled: boolean): void {
    const config = this.read()
    const entry = config.mcpServers?.[name]
    if (!entry) throw new Error(`服务器不存在: ${name}`)
    if (disabled) entry.disabled = true
    else delete entry.disabled
    this.write(config)
    this.broadcastChanged('toggle')
  }

  remove(name: string): void {
    const config = this.read()
    if (!config.mcpServers?.[name]) throw new Error(`服务器不存在: ${name}`)
    delete config.mcpServers[name]
    this.write(config)
    this.broadcastChanged('remove')
  }

  // ── Internals ──

  private configPath(): string {
    return join(this.getAgentDir(), 'mcp.json')
  }

  private read(): McpConfigFile {
    const file = this.configPath()
    if (!existsSync(file)) return {}
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as McpConfigFile
    } catch (error) {
      // 手改坏的文件不作为崩溃理由；保存动作会先备份再覆盖
      logger.error(`mcp.json 解析失败，按空配置处理: ${file}`, error)
      return {}
    }
  }

  private write(config: McpConfigFile): void {
    const file = this.configPath()
    mkdirSync(dirname(file), { recursive: true })
    // 写入前备份一次（防止覆盖手改内容后无法找回）
    if (existsSync(file)) {
      try {
        copyFileSync(file, `${file}.bak`)
      } catch {
        // 备份失败不阻断保存
      }
    }
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n')
    renameSync(tmp, file)
  }

  private broadcastChanged(reason: AgentMcpChangedPayload['reason']): void {
    broadcastIpcEvent('agent.mcp.changed', { reason })
  }
}

function toDto(name: string, entry: Record<string, unknown>): McpServerDto {
  const url = asString(entry.url)
  return {
    name,
    type: url ? 'http' : 'stdio',
    command: asString(entry.command),
    args: asStringArray(entry.args),
    env: asStringRecord(entry.env),
    cwd: asString(entry.cwd),
    url,
    headers: asStringRecord(entry.headers),
    disabled: entry.disabled === true
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => typeof v === 'string')
  ) as Record<string, string>
}
