import { TooltipIconButton } from '@renderer/components/assistant-ui/tooltip-icon-button'
import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
  useDefaultLayout
} from '@renderer/components/ui/resizable'
import { cn } from '@renderer/lib/utils'
import {
  TREE_DEFAULT_WIDTH,
  TREE_MAX_WIDTH,
  TREE_MIN_WIDTH,
  useProjectPanelStore
} from '@renderer/stores/projectPanel'
import { FolderIcon, FolderOpenIcon } from 'lucide-react'
import type { FC, ReactNode } from 'react'

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
      {treeVisible ? <FolderOpenIcon className="size-3.5" /> : <FolderIcon className="size-3.5" />}
    </TooltipIconButton>
  )
}

/** 停靠在内容区右侧的文件树：宽度由 FileTreeLayout 的分隔条调整 */
export const FileTreeDock: FC = () => {
  return (
    // 分隔线由 ResizableSeparator 提供，这里不再画 border-l，避免双线
    <div className="flex h-full w-full flex-col">
      <FileExplorer />
    </div>
  )
}

/**
 * 内容区 + 文件树的可拉伸布局（react-resizable-panels，宽度 localStorage 记忆）。
 * 供「打开文件」页与文件预览标签使用；两者同一时刻只挂载其一，共享 group id。
 */
export const FileTreeLayout: FC<{ children: ReactNode }> = ({ children }) => {
  const treeVisible = useProjectPanelStore((s) => s.treeVisible)
  const layout = useDefaultLayout({
    id: 'nexus-project-panel',
    onlySaveAfterUserInteractions: true
  })
  return (
    <ResizableGroup
      id="nexus-project-panel"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <ResizablePanel id="content" groupResizeBehavior="preserve-pixel-size">
        {children}
      </ResizablePanel>
      {treeVisible && (
        <>
          {/* 同 Shell：分隔条收为线宽（旧 border-l 位置），不留色带 */}
          <ResizableSeparator className="w-px" />
          <ResizablePanel
            id="tree"
            defaultSize={TREE_DEFAULT_WIDTH}
            minSize={TREE_MIN_WIDTH}
            maxSize={TREE_MAX_WIDTH}
            groupResizeBehavior="preserve-pixel-size"
          >
            <FileTreeDock />
          </ResizablePanel>
        </>
      )}
    </ResizableGroup>
  )
}
