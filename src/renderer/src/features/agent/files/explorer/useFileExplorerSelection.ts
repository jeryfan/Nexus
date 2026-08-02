import { useCallback, useRef, useState } from 'react'
import type React from 'react'
import type { TreeNode } from './file-explorer-types'
import type { FileExplorerRowProjection } from './file-explorer-row-projection'
import {
  createEmptyFileExplorerSelection,
  createSingleFileExplorerSelection,
  getFileExplorerSelectionMode,
  updateFileExplorerSelection,
  updateFileExplorerSelectionPaths
} from './file-explorer-selection'

type UseFileExplorerSelectionResult = {
  selectedPath: string | null
  selectedPaths: Set<string>
  setSingleSelectedPath: React.Dispatch<React.SetStateAction<string | null>>
  resetSelection: () => void
  selectRowWithModifiers: (
    node: TreeNode,
    event: React.MouseEvent<HTMLButtonElement>,
    onReplaceClick: (node: TreeNode) => void
  ) => void
}

export function useFileExplorerSelection(
  rowProjection: FileExplorerRowProjection,
  isMac: boolean
): UseFileExplorerSelectionResult {
  const [selectionState, setSelectionState] = useState(createEmptyFileExplorerSelection)
  const rowProjectionRef = useRef(rowProjection)
  rowProjectionRef.current = rowProjection

  const setSingleSelectedPath = useCallback((value: React.SetStateAction<string | null>) => {
    setSelectionState((prev) => {
      if (typeof value === 'function') {
        // Why: legacy cleanup still speaks in single-path updater terms;
        // apply it across the whole selected set so stale multi-selections converge.
        return updateFileExplorerSelectionPaths(prev, value)
      }
      const nextPath = value
      return createSingleFileExplorerSelection(nextPath)
    })
  }, [])

  const resetSelection = useCallback(() => {
    setSelectionState(createEmptyFileExplorerSelection())
  }, [])

  const selectRowWithModifiers = useCallback(
    (
      node: TreeNode,
      event: React.MouseEvent<HTMLButtonElement>,
      onReplaceClick: (node: TreeNode) => void
    ) => {
      const selectionMode = getFileExplorerSelectionMode(
        {
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey
        },
        isMac
      )

      if (selectionMode === 'replace') {
        onReplaceClick(node)
        return
      }

      // Why: tree refreshes are much more common than range/toggle selections
      // in large repos. Build order only for the modifier path that needs it.
      const orderedPaths = rowProjectionRef.current.getOrderedPaths()
      setSelectionState((prev) =>
        updateFileExplorerSelection(prev, orderedPaths, node.path, selectionMode)
      )
    },
    [isMac]
  )

  return {
    selectedPath: selectionState.activePath,
    selectedPaths: selectionState.selectedPaths,
    setSingleSelectedPath,
    resetSelection,
    selectRowWithModifiers
  }
}
