import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { WindowControls } from '@renderer/components/window-controls'
import { useSidebarStore } from '@renderer/stores/sidebar'

function AppShell(): React.JSX.Element {
  const collapsed = useSidebarStore((state) => state.collapsed)
  const width = useSidebarStore((state) => state.width)
  const setWidth = useSidebarStore((state) => state.setWidth)
  const [dragging, setDragging] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // macOS 全屏时红绿灯隐藏，顶栏不再预留左侧间距
  useEffect(() => {
    window.api.isFullscreen().then(setIsFullscreen)
    return window.api.onFullscreenChange(setIsFullscreen)
  }, [])

  // 拖拽右缘调整边栏宽度（区间限制在 store 的 setWidth 中处理）
  const startResize = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    setDragging(true)
    document.body.style.cursor = 'col-resize'

    const handleMove = (e: MouseEvent): void => {
      setWidth(startWidth + e.clientX - startX)
    }
    const handleUp = (): void => {
      setDragging(false)
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左侧边栏：折叠时宽度归零，内容随过渡动画滑出 */}
      <aside
        className="h-full shrink-0 overflow-hidden"
        style={{
          width: collapsed ? 0 : width,
          transition: dragging ? 'none' : 'width 200ms ease-in-out'
        }}
      >
        <div
          className="relative flex h-full flex-col border-r border-sidebar-border bg-sidebar"
          style={{ width }}
        >
          {/* 顶部拖拽区：窗口化时避让左侧红绿灯，全屏时贴到最左 */}
          <div
            className={cn(
              'app-drag flex h-12 shrink-0 items-center transition-[padding]',
              isFullscreen ? 'pl-3' : 'pl-[84px]'
            )}
          >
            <WindowControls />
          </div>

          {/* 菜单区域：暂为空 */}
          <div className="flex-1" />

          {/* 右缘拖拽手柄：5px 热区 + 1px 高亮线（折叠时随容器溢出隐藏） */}
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startResize}
            className="group app-no-drag absolute inset-y-0 right-0 z-10 w-[5px] cursor-col-resize"
          >
            <div
              className={cn(
                'mx-auto h-full w-px transition-colors',
                dragging ? 'bg-primary/40' : 'group-hover:bg-primary/25'
              )}
            />
          </div>
        </div>
      </aside>

      {/* 右侧内容区：暂为空；折叠后在顶部显示控制按钮 */}
      <main className="app-drag relative h-full min-w-0 flex-1 bg-background">
        {collapsed && (
          <div
            className={cn(
              'flex h-12 items-center transition-[padding]',
              isFullscreen ? 'pl-3' : 'pl-[84px]'
            )}
          >
            <WindowControls />
          </div>
        )}
      </main>
    </div>
  )
}

export { AppShell }
