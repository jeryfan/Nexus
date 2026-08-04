import { joinPath, normalizeRelativePath } from '../lib/path'
import { readDir, type FsDirEntry } from '../fsClient'
import type { TreeNode } from './file-explorer-types'
import { shouldIncludeFileExplorerEntry } from './file-explorer-entries'

export function fileExplorerEntriesToTreeNodes(
  entries: FsDirEntry[],
  dirPath: string,
  depth: number,
  rootPath: string | null
): TreeNode[] {
  return entries.filter(shouldIncludeFileExplorerEntry).map((entry) => {
    const path = joinPath(dirPath, entry.name)
    return {
      name: entry.name,
      path,
      relativePath: rootPath ? normalizeRelativePath(path.slice(rootPath.length + 1)) : entry.name,
      isDirectory: entry.isDirectory,
      isSymlink: entry.isSymlink,
      depth: depth + 1
    }
  })
}

/** readFileExplorerDirectory — local-only here, no operation-owner routing. */
export async function readFileExplorerDirectory(dirPath: string): Promise<FsDirEntry[]> {
  return readDir(dirPath)
}
