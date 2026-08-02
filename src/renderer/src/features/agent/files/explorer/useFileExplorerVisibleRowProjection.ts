import { useMemo } from 'react'
import { isDotfileRelativePath } from './file-explorer-entries'
import type { DirCache, TreeNode } from './file-explorer-types'
import {
  createFileExplorerRowProjectionFromParts,
  type FileExplorerRowProjection
} from './file-explorer-row-projection'
import {
  createNameFilteredFileExplorerProjection,
  getFileExplorerNameFilterExpandedPaths,
  type FileExplorerNameFilterProjectionSource
} from './file-explorer-name-filter-projection'

type VisibleFileExplorerRowProjectionOptions = {
  nameFilter?: FileExplorerNameFilterProjectionSource | null
  nameFilterCollapsedPaths?: ReadonlySet<string> | null
  showDotfiles: boolean
}

type VisibleFileExplorerRowProjectionInput = {
  dirCache: Record<string, DirCache>
  expanded: Set<string>
  rootPath: string | null
}

export function createVisibleFileExplorerRowProjection(
  input: VisibleFileExplorerRowProjectionInput,
  options: VisibleFileExplorerRowProjectionOptions
): FileExplorerRowProjection {
  const { dirCache, expanded, rootPath } = input
  const visibleFlatRows: TreeNode[] = []
  const rowsByPath = new Map<string, TreeNode>()
  if (!rootPath) {
    return createFileExplorerRowProjectionFromParts(visibleFlatRows, rowsByPath)
  }
  if (options.nameFilter) {
    return createNameFilteredFileExplorerProjection({
      collapsedPaths: options.nameFilterCollapsedPaths ?? undefined,
      nameFilter: options.nameFilter,
      showDotfiles: options.showDotfiles,
      rootPath
    })
  }

  const visitChildren = (parentPath: string): void => {
    const cached = dirCache[parentPath]
    if (!cached?.children) {
      return
    }
    for (const row of cached.children) {
      if (!options.showDotfiles && isDotfileRelativePath(row.relativePath)) {
        continue
      }
      visibleFlatRows.push(row)
      rowsByPath.set(row.path, row)
      if (row.isDirectory && expanded.has(row.path)) {
        visitChildren(row.path)
      }
    }
  }
  visitChildren(rootPath)

  return createFileExplorerRowProjectionFromParts(visibleFlatRows, rowsByPath)
}

export function useFileExplorerVisibleRowProjection(
  rootPath: string | null,
  dirCache: Record<string, DirCache>,
  expanded: Set<string>,
  showDotfiles: boolean,
  nameFilter: FileExplorerNameFilterProjectionSource | null,
  nameFilterCollapsedPaths: ReadonlySet<string> | null = null
): {
  rowProjection: FileExplorerRowProjection
  nameFilterExpandedPaths: Set<string>
} {
  const rowProjection = useMemo(
    () =>
      createVisibleFileExplorerRowProjection(
        { dirCache, expanded, rootPath },
        { nameFilter, nameFilterCollapsedPaths, showDotfiles }
      ),
    [dirCache, expanded, nameFilter, nameFilterCollapsedPaths, showDotfiles, rootPath]
  )
  const nameFilterExpandedPaths = useMemo(
    () => getFileExplorerNameFilterExpandedPaths(rowProjection, nameFilter?.query ?? ''),
    [nameFilter?.query, rowProjection]
  )

  return { rowProjection, nameFilterExpandedPaths }
}
