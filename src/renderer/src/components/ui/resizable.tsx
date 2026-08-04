import { cn } from '@renderer/lib/utils'
import type { FC } from 'react'
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

/** 拖拽分隔条：8px 热区 + 居中 1px 线（hover 高亮）。库自带键盘调整与双击复位。 */
export function ResizableSeparator({
  className,
  onPointerDown,
  ...props
}: SeparatorProps): React.JSX.Element {
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
      <div className="bg-border h-full w-px transition-colors group-hover:bg-primary/25" />
    </Separator>
  )
}
