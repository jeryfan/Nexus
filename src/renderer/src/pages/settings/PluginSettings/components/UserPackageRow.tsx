import { Badge, Tooltip } from '@nexus/ui'
import { SettingRow, SettingRowTitle } from '@renderer/components/SettingsPrimitives'
import { useAgentPackagesStore } from '@renderer/stores/agentPackages'
import type { AgentPackageDto } from '@shared/agent/types'
import { Loader2, RefreshCw, Trash2 } from 'lucide-react'

const TYPE_LABELS: Record<AgentPackageDto['type'], string> = {
  npm: 'npm',
  git: 'git',
  local: '本地'
}

/** 用户包行：类型/版本/钉版徽标 + 可更新提示 + 更新/删除操作。 */
export function UserPackageRow({ pkg }: { pkg: AgentPackageDto }): React.JSX.Element {
  const busy = useAgentPackagesStore((state) => state.busy[pkg.source])
  const hasUpdate = useAgentPackagesStore((state) =>
    state.updates.some((update) => update.source === pkg.source)
  )
  const update = useAgentPackagesStore((state) => state.update)
  const remove = useAgentPackagesStore((state) => state.remove)

  return (
    <SettingRow className="py-2">
      <div className="min-w-0 flex-1">
        <SettingRowTitle>
          <span className="truncate font-medium">{pkg.name}</span>
          <Badge variant="secondary" className="ml-2">
            {TYPE_LABELS[pkg.type]}
          </Badge>
          {pkg.pinned && (
            <Badge variant="outline" className="ml-1.5">
              已钉住
            </Badge>
          )}
          {pkg.version && (
            <span className="ml-2 text-foreground-muted text-xs">v{pkg.version}</span>
          )}
          {!pkg.installed && (
            <Badge variant="destructive" className="ml-1.5">
              未安装
            </Badge>
          )}
        </SettingRowTitle>
        <div className="mt-0.5 truncate text-foreground-muted text-xs">
          {pkg.description ?? pkg.source}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <>
            {hasUpdate && (
              <Tooltip content="更新到最新版本">
                <button
                  type="button"
                  onClick={() => void update(pkg.source)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-primary text-xs hover:bg-accent"
                >
                  <RefreshCw className="size-3" />
                  更新
                </button>
              </Tooltip>
            )}
            <Tooltip content="删除">
              <button
                type="button"
                onClick={() => void remove(pkg.source)}
                className="rounded-md p-1.5 text-foreground-muted hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </SettingRow>
  )
}
