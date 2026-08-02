import { Button } from '@nexus/ui'
import { SettingDivider, SettingGroup } from '@renderer/components/SettingsPrimitives'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { useAgentPackagesStore } from '@renderer/stores/agentPackages'
import { Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { AddPackageDialog } from './AddPackageDialog'
import { BuiltinPackageRow } from './BuiltinPackageRow'
import { UserPackageRow } from './UserPackageRow'

/**
 * 插件 tab：pi packages 管理。
 * 内置区：Nexus 随版本分发的包（不可删除，可禁用，失败可重试）；
 * 用户区：自行安装的 npm/git/本地包（可更新、删除）。变更均在新会话生效。
 */
export function PackagesPanel({ query }: { query: string }): React.JSX.Element {
  const packages = useAgentPackagesStore((state) => state.packages)
  const updates = useAgentPackagesStore((state) => state.updates)
  const loading = useAgentPackagesStore((state) => state.loading)
  const updateAllBusy = useAgentPackagesStore((state) => Boolean(state.busy.__all__))
  const update = useAgentPackagesStore((state) => state.update)

  const [dialogOpen, setDialogOpen] = useState(false)

  if (loading) {
    return (
      <SettingGroup>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="mt-2 h-10 w-full" />
      </SettingGroup>
    )
  }

  const normalizedQuery = query.trim().toLowerCase()
  const matches = (text: string): boolean =>
    !normalizedQuery || text.toLowerCase().includes(normalizedQuery)
  const builtins = packages.filter((pkg) => pkg.isBuiltin && matches(pkg.name))
  const userPackages = packages.filter(
    (pkg) => !pkg.isBuiltin && (matches(pkg.name) || matches(pkg.source))
  )

  return (
    <>
      {builtins.length > 0 && (
        <SettingGroup>
          {builtins.map((pkg, index) => (
            <div key={pkg.source}>
              {index > 0 && <SettingDivider className="my-1" />}
              <BuiltinPackageRow pkg={pkg} />
            </div>
          ))}
        </SettingGroup>
      )}

      <div className="mt-6 mb-2 flex items-center justify-between">
        <div className="select-none font-semibold text-foreground text-sm">已安装的扩展包</div>
        <div className="flex items-center gap-2">
          {updates.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void update()}
              disabled={updateAllBusy}
            >
              <RefreshCw className="size-3" />
              全部更新（{updates.length}）
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="size-3.5" />
            添加
          </Button>
        </div>
      </div>

      <AddPackageDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <SettingGroup>
        {userPackages.length === 0 ? (
          <div className="py-3 text-center text-foreground-muted text-xs">
            {normalizedQuery
              ? '没有匹配的扩展包'
              : '尚未安装扩展包。点击右上角「添加」安装 npm / Git / 本地扩展包。'}
          </div>
        ) : (
          userPackages.map((pkg, index) => (
            <div key={pkg.source}>
              {index > 0 && <SettingDivider className="my-1" />}
              <UserPackageRow pkg={pkg} />
            </div>
          ))
        )}
      </SettingGroup>
    </>
  )
}
