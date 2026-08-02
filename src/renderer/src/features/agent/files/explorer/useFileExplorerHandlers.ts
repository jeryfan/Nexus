import { useCallback } from 'react'
import { toast } from '@renderer/services/toast'
import type { TreeNode } from './file-explorer-types'

type UseFileExplorerHandlersParams = {
  rootPath: string | null
  openFileTab: (filePath: string, options?: { preview?: boolean }) => void
  toggleDir: (root: string, dirPath: string) => void
  loadDir: (
    dirPath: string,
    depth: number,
    options?: { force?: boolean; failOnError?: boolean }
  ) => Promise<boolean>
  statPath: (path: string) => Promise<{ isDirectory: boolean }>
  markPathAsDirectory: (path: string) => void
  setSelectedPath: (path: string) => void
}

type UseFileExplorerHandlersReturn = {
  handleClick: (node: TreeNode) => void
  handleDoubleClick: (node: TreeNode) => void
}

export function useFileExplorerHandlers({
  rootPath,
  openFileTab,
  toggleDir,
  loadDir,
  statPath,
  markPathAsDirectory,
  setSelectedPath
}: UseFileExplorerHandlersParams): UseFileExplorerHandlersReturn {
  const handleClick = useCallback(
    (node: TreeNode) => {
      if (!rootPath) {
        return
      }
      setSelectedPath(node.path)
      if (node.isDirectory) {
        toggleDir(rootPath, node.path)
        return
      }
      if (node.isSymlink) {
        // Why: symlink targets may live in macOS TCC-protected app data. Resolve
        // them only after the user explicitly activates the row.
        void (async () => {
          let targetIsDirectory = false
          try {
            targetIsDirectory = (await statPath(node.path)).isDirectory
          } catch {
            toast.error('无法打开符号链接目标')
            return
          }
          if (targetIsDirectory) {
            const loadedAsDirectory = await loadDir(node.path, node.depth, {
              force: true,
              failOnError: true
            })
            if (loadedAsDirectory) {
              markPathAsDirectory(node.path)
              toggleDir(rootPath, node.path)
            } else {
              toast.error('无法打开符号链接目标')
            }
            return
          }
          openFileTab(node.path, { preview: true })
        })()
        return
      }
      openFileTab(node.path, { preview: true })
    },
    [rootPath, openFileTab, toggleDir, loadDir, statPath, markPathAsDirectory, setSelectedPath]
  )

  const handleDoubleClick = useCallback(
    (node: TreeNode) => {
      if (!rootPath || node.isDirectory) {
        return
      }
      // Why: orca editor.ts openFile semantics — an existing preview tab opened
      // with preview:false becomes permanent (projectPanel.openFileTab clears
      // isPreview for the existing-tab case).
      openFileTab(node.path, { preview: false })
    },
    [rootPath, openFileTab]
  )

  return { handleClick, handleDoubleClick }
}
