import { TooltipIconButton } from '@renderer/components/assistant-ui/tooltip-icon-button'
import { cn } from '@renderer/lib/utils'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { FolderIcon, FolderOpenIcon } from 'lucide-react'
import { useState, type FC } from 'react'

import { FileExplorer } from './FileExplorer'

/**
 * 文件树显隐开关（文件夹图标，选中态 = 树展示中）。
 * 位于文件标签的面包屑行右侧（「打开」按钮左侧），不在标签栏。
 */
export const TreeToggleButton: FC = () => {
  const treeVisible = useProjectPanelStore((s) => s.treeVisible)
  const toggleTreeVisible = useProjectPanelStore((s) => s.toggleTreeVisible)
  return (
    <TooltipIconButton
      variant="ghost"
      size="icon"
      tooltip="文件树"
      side="bottom"
      onClick={toggleTreeVisible}
      className={cn('size-6 shrink-0', treeVisible && 'bg-muted')}
    >
      {treeVisible ? (
        <FolderOpenIcon className="size-3.5" />
      ) : (
        <FolderIcon className="size-3.5" />
      )}
    </TooltipIconButton>
  )
}

/** 停靠在文件标签内容区右侧的文件树：左缘拖拽调宽（向左拖变宽） */
export const FileTreeDock: FC = () => {
  const treeWidth = useProjectPanelStore((s) => s.treeWidth)
  const setTreeWidth = useProjectPanelStore((s) => s.setTreeWidth)
  const [dragging, setDragging] = useState(false)

  const startResize = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = treeWidth
    setDragging(true)
    document.body.style.cursor = 'col-resize'

    const handleMove = (e: MouseEvent): void => {
      setTreeWidth(startWidth + (startX - e.clientX))
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
    <div
      className="border-border relative flex shrink-0 flex-col border-l"
      style={{ width: treeWidth }}
    >
      <FileExplorer />
      {/* 左缘拖拽手柄：5px 热区 + 1px 高亮线（边框起点在面包屑行之下） */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startResize}
        className="group absolute inset-y-0 left-0 z-10 w-[5px] cursor-col-resize"
      >
        <div
          className={cn(
            'mx-auto h-full w-px transition-colors',
            dragging ? 'bg-primary/40' : 'group-hover:bg-primary/25'
          )}
        />
      </div>
    </div>
  )
}
