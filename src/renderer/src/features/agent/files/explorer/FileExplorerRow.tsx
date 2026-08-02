import React from 'react'
import { ChevronRight, Folder, FolderOpen, Link, Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { getFileTypeIcon } from '../lib/file-type-icons'
import type { TreeNode } from './file-explorer-types'

type FileExplorerRowProps = {
  node: TreeNode
  isExpanded: boolean
  isLoading: boolean
  isSelected: boolean
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  onDoubleClick: () => void
}

export function FileExplorerRow({
  node,
  isExpanded,
  isLoading,
  isSelected,
  onClick,
  onDoubleClick
}: FileExplorerRowProps): React.JSX.Element {
  const FileIcon = getFileTypeIcon(node.relativePath || node.name)

  return (
    <button
      data-file-explorer-row=""
      data-selected={isSelected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left text-xs transition-colors',
        !isSelected && 'hover:bg-accent hover:text-foreground',
        isSelected && 'text-accent-foreground'
      )}
      style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
      onClick={(e) => onClick(e)}
      onDoubleClick={onDoubleClick}
    >
      {node.isDirectory ? (
        <>
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
          {isLoading ? (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-3 shrink-0 text-muted-foreground" />
          )}
        </>
      ) : (
        <>
          <span className="size-3 shrink-0" />
          {node.isSymlink ? (
            <Link className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <FileIcon className="size-3 shrink-0 text-muted-foreground" />
          )}
        </>
      )}
      <span className={cn('truncate', isSelected && 'text-accent-foreground')}>{node.name}</span>
    </button>
  )
}
