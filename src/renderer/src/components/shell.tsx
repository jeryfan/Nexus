import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { WindowControls } from '@renderer/components/window-controls'
import { useSidebarStore } from '@renderer/stores/sidebar'

interface ShellProps {
  /** 边栏内容（顶栏控制按钮之下） */
  sidebar?: React.ReactNode
  /** 右侧内容区 */
  children?: React.ReactNode
}

/** 应用外壳：左侧边栏（可折叠 / 拖拽调宽）+ 右侧内容区，首页与设置页共用 */
function Shell({ sidebar, children }: ShellProps): React.JSX.Element {
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
    // nexus index.css 将 #root 设为 flex-row，Shell 作为其 flex item 需 flex-1 撑满宽度
    <div className="flex h-screen min-w-0 flex-1 overflow-hidden">
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

          <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>

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

      {/* 右侧内容区：折叠后在顶部显示控制按钮 */}
      {/* flex-col + 内容包裹层 min-h-0 flex-1：避免控制条(h-12)与 h-full 子内容叠加溢出 48px */}
      <main className="app-drag relative flex h-full min-w-0 flex-1 flex-col bg-background">
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
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  )
}

export { Shell }
