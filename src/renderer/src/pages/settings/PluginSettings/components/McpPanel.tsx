import { Button, Switch } from '@nexus/ui'
import { SettingDivider, SettingGroup } from '@renderer/components/SettingsPrimitives'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { useAgentMcpStore } from '@renderer/stores/agentMcp'
import { useAgentPackagesStore } from '@renderer/stores/agentPackages'
import { Plus, Settings } from 'lucide-react'
import { useState } from 'react'

import { McpServerDetail } from './McpServerDetail'

interface EditingTarget {
  /** 编辑已有服务器时传原名；新建为 undefined */
  originalName?: string
}

/**
 * MCP tab：服务器列表（开关启停 + 齿轮进详情）。
 * 数据落盘于 ~/.nexus/agent/mcp.json（pi-mcp-adapter 读取，新会话生效）。
 */
export function McpPanel({ query }: { query: string }): React.JSX.Element {
  const servers = useAgentMcpStore((state) => state.servers)
  const loading = useAgentMcpStore((state) => state.loading)
  const busy = useAgentMcpStore((state) => state.busy)
  const setDisabled = useAgentMcpStore((state) => state.setDisabled)
  const builtinAdapter = useAgentPackagesStore((state) =>
    state.packages.find((pkg) => pkg.isBuiltin && pkg.name === 'pi-mcp-adapter')
  )

  const [editing, setEditing] = useState<EditingTarget | null>(null)

  if (editing) {
    return <McpServerDetail originalName={editing.originalName} onBack={() => setEditing(null)} />
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = servers.filter(
    (server) => !normalizedQuery || server.name.toLowerCase().includes(normalizedQuery)
  )

  const adapterNotice = (() => {
    if (!builtinAdapter) return null
    if (builtinAdapter.builtinStatus === 'installing')
      return 'MCP 适配器安装中，完成后服务器才能连接。'
    if (builtinAdapter.builtinStatus === 'failed')
      return 'MCP 适配器安装失败，请前往「插件」页重试。'
    if (!builtinAdapter.enabled) return 'MCP 适配器已禁用，服务器不会连接。可在「插件」页启用。'
    return null
  })()

  return (
    <>
      {adapterNotice && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {adapterNotice}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div className="select-none font-semibold text-foreground text-sm">服务器</div>
        <Button size="sm" variant="outline" onClick={() => setEditing({})}>
          <Plus className="size-3.5" />
          添加服务器
        </Button>
      </div>

      {loading ? (
        <SettingGroup>
          <Skeleton className="h-10 w-full" />
        </SettingGroup>
      ) : filtered.length === 0 ? (
        <SettingGroup>
          <div className="py-6 text-center text-foreground-muted text-xs">
            {normalizedQuery ? '没有匹配的服务器' : '尚未配置 MCP 服务器，点击右上角添加。'}
          </div>
        </SettingGroup>
      ) : (
        <SettingGroup>
          {filtered.map((server, index) => (
            <div key={server.name}>
              {index > 0 && <SettingDivider className="my-1" />}
              <div className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground text-sm font-medium">{server.name}</div>
                  <div className="mt-0.5 truncate text-foreground-muted text-xs">
                    {server.type === 'stdio'
                      ? [server.command, ...server.args].join(' ')
                      : server.url}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ originalName: server.name })}
                    className="rounded-md p-1.5 text-foreground-muted hover:bg-accent hover:text-foreground"
                  >
                    <Settings className="size-4" />
                  </button>
                  <Switch
                    size="xs"
                    checked={!server.disabled}
                    disabled={Boolean(busy[server.name])}
                    onCheckedChange={(checked) => void setDisabled(server.name, !checked)}
                  />
                </div>
              </div>
            </div>
          ))}
        </SettingGroup>
      )}
    </>
  )
}
