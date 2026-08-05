import { cn } from '@renderer/lib/utils'
import { useLayoutEffect, useRef, type FC } from 'react'
import { Separator, type SeparatorProps } from 'react-resizable-panels'
import { create } from 'zustand'

// v4 的 Group/Panel/useDefaultLayout/usePanelRef 直接透传复用，不额外包装
export {
  Group as ResizableGroup,
  Panel as ResizablePanel,
  useDefaultLayout,
  usePanelRef
} from 'react-resizable-panels'

/**
 * 拖拽状态：任一分隔条 pointerdown 起、窗口 pointerup/pointercancel 止。
 * 用于挂全屏透明遮罩，防止内置浏览器 <webview>（独立渲染进程）
 * 吞掉指针事件导致拖拽断连。键盘调宽不经 pointerdown，不触发遮罩。
 */
interface ResizeDragState {
  dragging: boolean
  begin: () => void
  end: () => void
}

export const useResizeDragStore = create<ResizeDragState>((set) => ({
  dragging: false,
  begin: () => set({ dragging: true }),
  end: () => set({ dragging: false })
}))

/** 全屏透明拖拽遮罩：App 根部挂载一次，仅拖拽期间渲染（z-index 压过 webview 与弹层） */
export const ResizeDragOverlay: FC = () => {
  const dragging = useResizeDragStore((s) => s.dragging)
  if (!dragging) return null
  return <div aria-hidden className="fixed inset-0 z-[9999]" />
}

/**
 * 像素对齐：flex-grow 百分比布局下面板边界常落在小数像素，1px 线经抗锯齿
 * 会在右侧出现一条浅色虚影。把线平移到最近的设备像素（位移 < 0.5px，肉眼不可见）
 * 即恢复单条清晰线。拖拽时库改写相邻 Panel 的 flexGrow 内联样式、窗口缩放也会
 * 移动边界，二者都触发重新对齐。
 */
function usePixelSnapLine(): React.RefObject<HTMLDivElement | null> {
  const lineRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const line = lineRef.current
    if (!line) return
    const snap = (): void => {
      line.style.transform = ''
      const dpr = window.devicePixelRatio || 1
      const x = line.getBoundingClientRect().left
      const aligned = Math.round(x * dpr) / dpr
      if (aligned !== x) line.style.transform = `translateX(${aligned - x}px)`
    }
    snap()
    const neighbor = line.closest('[data-separator]')?.previousElementSibling
    const observer = new MutationObserver(snap)
    if (neighbor) observer.observe(neighbor, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', snap)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', snap)
    }
  }, [])
  return lineRef
}

/** 拖拽分隔条：8px 热区 + 1px 线（hover/拖拽中高亮，像素对齐消除虚影）。
 *  库自带键盘调整与双击复位。 */
export function ResizableSeparator({
  className,
  onPointerDown,
  ...props
}: SeparatorProps): React.JSX.Element {
  // 拖拽时全屏遮罩盖住分隔条、hover 丢失，改用全局 dragging 标志保持高亮反馈
  const dragging = useResizeDragStore((s) => s.dragging)
  const lineRef = usePixelSnapLine()
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    useResizeDragStore.getState().begin()
    const end = (): void => {
      useResizeDragStore.getState().end()
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    onPointerDown?.(event)
  }
  return (
    <Separator
      {...props}
      onPointerDown={handlePointerDown}
      className={cn(
        'group relative flex w-2 shrink-0 items-center justify-center outline-none select-none',
        className
      )}
    >
      {/* -ml-px：线左叠 1px 盖住左侧面板边界（旧 border 语义），
          避免线与面板边缘之间露出亚像素亮缝显得「又浅又粗」 */}
      <div
        ref={lineRef}
        className={cn(
          '-ml-px h-full w-px transition-colors',
          dragging ? 'bg-primary/40' : 'bg-border group-hover:bg-primary/25'
        )}
      />
    </Separator>
  )
}
