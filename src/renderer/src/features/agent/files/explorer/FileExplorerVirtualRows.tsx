import React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { FileExplorerRow } from './FileExplorerRow'
import type { DirCache, TreeNode } from './file-explorer-types'
import type { FileExplorerRowProjection } from './file-explorer-row-projection'

type FileExplorerVirtualRowsProps = {
  virtualizer: Virtualizer<HTMLDivElement, Element>
  rowProjection: FileExplorerRowProjection
  expanded: Set<string>
  dirCache: Record<string, DirCache>
  selectedPaths: Set<string>
  activeFilePath: string | null
  onClick: (node: TreeNode, event: React.MouseEvent<HTMLButtonElement>) => void
  onDoubleClick: (node: TreeNode) => void
}

export function FileExplorerVirtualRows({
  virtualizer,
  rowProjection,
  expanded,
  dirCache,
  selectedPaths,
  activeFilePath,
  onClick,
  onDoubleClick
}: FileExplorerVirtualRowsProps): React.JSX.Element {
  return (
    <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualizer.getVirtualItems().map((vItem) => {
        const node = rowProjection.getRowAtIndex(vItem.index)
        if (!node) {
          return null
        }

        return (
          <div
            key={vItem.key}
            data-index={vItem.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 right-0"
            style={{ transform: `translateY(${vItem.start}px)` }}
          >
            <FileExplorerRow
              node={node}
              isExpanded={expanded.has(node.path)}
              isLoading={node.isDirectory && Boolean(dirCache[node.path]?.loading)}
              isSelected={selectedPaths.has(node.path) || activeFilePath === node.path}
              onClick={(event) => onClick(node, event)}
              onDoubleClick={() => onDoubleClick(node)}
            />
          </div>
        )
      })}
    </div>
  )
}
