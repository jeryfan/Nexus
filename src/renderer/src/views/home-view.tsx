import { Shell } from '@renderer/components/shell'
import { AccountMenu } from '@renderer/components/account-menu'

/** 首页视图：边栏菜单暂为空，底部为账户/设置入口 */
function HomeView(): React.JSX.Element {
  return (
    <Shell
      sidebar={
        <>
          {/* 菜单区域：暂为空 */}
          <div className="flex-1" />
          <div className="p-2">
            <AccountMenu />
          </div>
        </>
      }
    />
  )
}

export { HomeView }
