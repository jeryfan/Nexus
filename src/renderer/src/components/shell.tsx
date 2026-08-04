import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { WindowControls } from '@renderer/components/window-controls'
import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
  useDefaultLayout,
  usePanelRef
} from '@renderer/components/ui/resizable'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarStore
} from '@renderer/stores/sidebar'

interface ShellProps {
  /** 边栏内容（顶栏控制按钮之下） */
  sidebar?: React.ReactNode
  /** 右侧内容区 */
  children?: React.ReactNode
}

/** 应用外壳：左侧边栏（可折叠 / react-resizable-panels 拖拽调宽，宽度 localStorage 记忆）
 *  + 右侧内容区，首页与设置页共用 */
function Shell({ sidebar, children }: ShellProps): React.JSX.Element {
  const collapsed = useSidebarStore((state) => state.collapsed)
  const setCollapsed = useSidebarStore((state) => state.setCollapsed)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const sidebarPanelRef = usePanelRef()
  const layout = useDefaultLayout({ id: 'nexus-shell', onlySaveAfterUserInteractions: true })

  // macOS 全屏时红绿灯隐藏，顶栏不再预留左侧间距
  useEffect(() => {
    window.api.isFullscreen().then(setIsFullscreen)
    return window.api.onFullscreenChange(setIsFullscreen)
  }, [])

  // 折叠开关（WindowControls）写 store，这里命令式驱动 panel；
  // 拖拽越过最小宽度时库自动折叠，经 onResize 反向同步 store
  useEffect(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    if (collapsed) panel.collapse()
    else panel.expand()
  }, [collapsed, sidebarPanelRef])

  return (
    // nexus index.css 将 #root 设为 flex-row，Group 作为其 flex item 需 flex-1 撑满宽度
    <ResizableGroup
      id="nexus-shell"
      className="min-w-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      {/* 左侧边栏：可折叠，拖拽调宽（区间为像素约束） */}
      <ResizablePanel
        id="sidebar"
        defaultSize={SIDEBAR_DEFAULT_WIDTH}
        minSize={SIDEBAR_MIN_WIDTH}
        maxSize={SIDEBAR_MAX_WIDTH}
        collapsible
        groupResizeBehavior="preserve-pixel-size"
        panelRef={sidebarPanelRef}
        onResize={() => setCollapsed(sidebarPanelRef.current?.isCollapsed() ?? false)}
      >
        <div className="bg-sidebar border-sidebar-border relative flex h-full flex-col border-r">
          {/* 顶部拖拽区：窗口化时避让左侧红绿灯，全屏时贴到最左 */}
          <div
            className={cn(
              'app-drag flex h-12 shrink-0 items-center transition-[padding]',
              isFullscreen ? 'pl-3' : 'pl-[84px]'
            )}
          >
            <WindowControls />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
        </div>
      </ResizablePanel>

      <ResizableSeparator className="w-1.5" />

      {/* 右侧内容区：折叠后在顶部显示控制按钮 */}
      <ResizablePanel id="main" groupResizeBehavior="preserve-pixel-size">
        <main className="app-drag relative flex h-full min-w-0 flex-col bg-background">
          {collapsed && (
            <div
              className={cn(
                'flex h-12 shrink-0 items-center transition-[padding]',
                isFullscreen ? 'pl-3' : 'pl-[84px]'
              )}
            >
              <WindowControls />
            </div>
          )}
          {/* flex 链说明同旧实现：控制条(h-12)与内容区需 min-h-0 flex-1 避免 48px 溢出 */}
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </ResizablePanel>
    </ResizableGroup>
  )
}

export { Shell }
