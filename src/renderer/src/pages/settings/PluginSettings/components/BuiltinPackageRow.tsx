import { Switch, Tooltip } from '@nexus/ui'
import { SettingRow, SettingRowTitle } from '@renderer/components/SettingsPrimitives'
import { useAgentPackagesStore } from '@renderer/stores/agentPackages'
import type { AgentPackageDto } from '@shared/agent/types'
import { Loader2, RotateCcw } from 'lucide-react'

const BUILTIN_FALLBACK_DESCRIPTIONS: Record<string, string> = {
  'pi-mcp-adapter': 'MCP（Model Context Protocol）适配器，为 Agent 接入 MCP 服务器提供的工具'
}

/** 内置包行：版本/状态徽标 + 启用开关（不可删除），安装失败可重试。 */
export function BuiltinPackageRow({ pkg }: { pkg: AgentPackageDto }): React.JSX.Element {
  const busy = useAgentPackagesStore((state) => state.busy[pkg.source])
  const builtinBusy = useAgentPackagesStore((state) => state.busy.__builtin__)
  const setEnabled = useAgentPackagesStore((state) => state.setEnabled)
  const retryBuiltin = useAgentPackagesStore((state) => state.retryBuiltin)

  const installing = pkg.builtinStatus === 'installing'
  const failed = pkg.builtinStatus === 'failed'

  return (
    <SettingRow className="py-2">
      <div className="min-w-0 flex-1">
        <SettingRowTitle>
          <span className="truncate font-medium">{pkg.name}</span>
          {pkg.version && (
            <span className="ml-2 text-foreground-muted text-xs">v{pkg.version}</span>
          )}
        </SettingRowTitle>
        <div className="mt-0.5 truncate text-foreground-muted text-xs">
          {failed
            ? `安装失败：${pkg.builtinError ?? '未知错误'}`
            : (pkg.description ?? BUILTIN_FALLBACK_DESCRIPTIONS[pkg.name] ?? pkg.source)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {installing && (
          <span className="flex items-center gap-1.5 text-foreground-muted text-xs">
            <Loader2 className="size-3 animate-spin" />
            安装中…
          </span>
        )}
        {failed && (
          <Tooltip content="重试安装">
            <button
              type="button"
              onClick={() => void retryBuiltin()}
              disabled={Boolean(builtinBusy)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-primary text-xs hover:bg-accent disabled:opacity-40"
            >
              <RotateCcw className="size-3" />
              重试
            </button>
          </Tooltip>
        )}
        <Switch
          size="xs"
          checked={pkg.enabled}
          disabled={installing || Boolean(busy)}
          onCheckedChange={(checked) => void setEnabled(pkg.source, checked)}
        />
      </div>
    </SettingRow>
  )
}
