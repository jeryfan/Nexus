import React, { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAgentStore, selectActiveCwd } from '../../agentStore'
import { useFileExplorerStore } from '@renderer/stores/fileExplorer'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { shouldResetFileExplorerForVisibleRoot } from './file-explorer-reset'
import { FileExplorerNameFilter } from './FileExplorerNameFilter'
import { FileExplorerQueryStrip } from './FileExplorerQueryStrip'
import { FileExplorerToolbar } from './FileExplorerToolbar'
import { FileExplorerTreeStatus } from './FileExplorerTreeStatus'
import { FileExplorerVirtualRows } from './FileExplorerVirtualRows'
import {
  getNextNameFilterCollapsedPaths,
  isFileExplorerNameFilterQueryTooLarge
} from './file-explorer-name-filter-projection'
import { splitPathSegments } from './path-tree'
import { useFileExplorerFileList } from './useFileExplorerFileList'
import { useFileExplorerHandlers } from './useFileExplorerHandlers'
import { useFileExplorerManualRefresh } from './useFileExplorerManualRefresh'
import { useFileExplorerSelection } from './useFileExplorerSelection'
import { useFileExplorerTree } from './useFileExplorerTree'
import { decideExpandedDirLoad } from './file-explorer-stale-dir-cache'
import type { TreeNode } from './file-explorer-types'
import { useFileExplorerVisibleRowProjection } from './useFileExplorerVisibleRowProjection'

export const FileExplorer: FC = () => {
  const rootPath = useAgentStore(selectActiveCwd)
  const [nameFilterQuery, setNameFilterQuery] = useState('')
  const [nameFilterCollapsedPaths, setNameFilterCollapsedPaths] = useState<Set<string>>(
    () => new Set()
  )

  const expandedDirs = useFileExplorerStore((s) => s.expandedDirs)
  const collapseAll = useFileExplorerStore((s) => s.collapseAll)
  const toggleDir = useFileExplorerStore((s) => s.toggleDir)
  const showDotfiles = useFileExplorerStore((s) =>
    rootPath ? (s.showDotfiles[rootPath] ?? false) : false
  )
  const toggleDotfiles = useFileExplorerStore((s) => s.toggleDotfiles)
  const openFileTab = useProjectPanelStore((s) => s.openFileTab)
  const activeFilePath = useProjectPanelStore((s) => {
    const activeTab = s.tabs.find((tab) => tab.id === s.activeTabId)
    return activeTab?.type === 'file' ? (activeTab.filePath ?? null) : null
  })

  const expanded = useMemo(
    () => (rootPath ? new Set(expandedDirs[rootPath] ?? []) : new Set<string>()),
    [rootPath, expandedDirs]
  )

  const {
    dirCache,
    rootCache,
    rootError,
    loadDir,
    statPath,
    markPathAsDirectory,
    refreshTree,
    isDirStale,
    resetAndLoad
  } = useFileExplorerTree(rootPath, expanded)
  const hasNameFilter = nameFilterQuery.trim().length > 0
  const nameFilterQueryTooLarge = useMemo(
    () => isFileExplorerNameFilterQueryTooLarge(nameFilterQuery),
    [nameFilterQuery]
  )
  useEffect(() => {
    if (!hasNameFilter) {
      setNameFilterCollapsedPaths((current) => (current.size > 0 ? new Set() : current))
    }
  }, [hasNameFilter])
  const nameFilterFiles = useFileExplorerFileList({
    enabled: hasNameFilter && !nameFilterQueryTooLarge,
    rootPath
  })
  const nameFilterSource = useMemo(
    () =>
      hasNameFilter
        ? {
            query: nameFilterQuery,
            relativePaths: nameFilterQueryTooLarge
              ? []
              : nameFilterFiles.loading && nameFilterFiles.files.length === 0
                ? null
                : nameFilterFiles.files
          }
        : null,
    [
      hasNameFilter,
      nameFilterFiles.files,
      nameFilterFiles.loading,
      nameFilterQuery,
      nameFilterQueryTooLarge
    ]
  )
  const { rowProjection, nameFilterExpandedPaths } = useFileExplorerVisibleRowProjection(
    rootPath,
    dirCache,
    expanded,
    showDotfiles,
    nameFilterSource,
    hasNameFilter ? nameFilterCollapsedPaths : null
  )
  const rowExpandedPaths = useMemo(
    () =>
      hasNameFilter
        ? nameFilterExpandedPaths
        : nameFilterExpandedPaths.size > 0
          ? new Set([...expanded, ...nameFilterExpandedPaths])
          : expanded,
    [expanded, hasNameFilter, nameFilterExpandedPaths]
  )
  const visibleRowCount = rowProjection.getVisibleCount()
  const manualRefresh = useFileExplorerManualRefresh(refreshTree)
  const canCollapseAll = !hasNameFilter && expanded.size > 0
  const handleCollapseAll = useCallback(() => {
    if (!rootPath || hasNameFilter) {
      return
    }
    collapseAll(rootPath)
  }, [rootPath, collapseAll, hasNameFilter])
  const handleToggleDotfiles = useCallback(() => {
    if (rootPath) {
      toggleDotfiles(rootPath)
    }
  }, [rootPath, toggleDotfiles])
  const handleClearNameFilter = useCallback(() => {
    setNameFilterQuery('')
  }, [setNameFilterQuery])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isMac = useMemo(() => navigator.userAgent.includes('Mac'), [])
  const { selectedPaths, setSingleSelectedPath, resetSelection, selectRowWithModifiers } =
    useFileExplorerSelection(rowProjection, isMac)

  const lastResetRootPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (!shouldResetFileExplorerForVisibleRoot(lastResetRootPathRef.current, rootPath)) {
      return
    }
    lastResetRootPathRef.current = rootPath
    resetSelection()
    setNameFilterQuery('')
    resetAndLoad()
  }, [rootPath, resetSelection]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rootPath) {
      return
    }
    for (const dirPath of expanded) {
      // Why: a full refresh re-reads only root and the dirs expanded at the time,
      // so a listing cached while collapsed is unverified — re-read it here instead of trusting it.
      const decision = decideExpandedDirLoad(dirCache[dirPath], isDirStale(dirPath))
      if (decision === 'skip') {
        continue
      }
      const depth = splitPathSegments(dirPath.slice(rootPath.length + 1)).length - 1
      void loadDir(dirPath, depth, decision === 'reload' ? { force: true } : undefined)
    }
  }, [expanded, rootPath]) // eslint-disable-line react-hooks/exhaustive-deps

  const virtualizer = useVirtualizer({
    count: visibleRowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 20,
    getItemKey: (index) => rowProjection.getRowAtIndex(index)?.path ?? `__fallback_${index}`
  })

  const handleToggleNameFilterDir = useCallback(
    (_root: string, dirPath: string) => {
      setNameFilterCollapsedPaths((current) =>
        getNextNameFilterCollapsedPaths(current, dirPath, rowExpandedPaths.has(dirPath))
      )
    },
    [rowExpandedPaths]
  )
  const { handleClick, handleDoubleClick } = useFileExplorerHandlers({
    rootPath,
    openFileTab,
    toggleDir: hasNameFilter ? handleToggleNameFilterDir : toggleDir,
    loadDir,
    statPath,
    markPathAsDirectory,
    setSelectedPath: setSingleSelectedPath
  })

  const handleRowClick = useCallback(
    (node: TreeNode, event: React.MouseEvent<HTMLButtonElement>) => {
      selectRowWithModifiers(node, event, (target) => handleClick(target))
    },
    [handleClick, selectRowWithModifiers]
  )

  if (!rootPath) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground px-4 text-center">
        选择一个项目以浏览文件
      </div>
    )
  }

  const isEmptyState = visibleRowCount === 0
  const isNameFilterLoading = nameFilterSource?.relativePaths === null
  const isLoading =
    isEmptyState && (hasNameFilter ? isNameFilterLoading : (rootCache?.loading ?? true))
  const treeError = hasNameFilter ? nameFilterFiles.loadError : rootError
  const hasError = isEmptyState && !isLoading && !!treeError
  const showTree = !isEmptyState
  const emptyMessage =
    hasNameFilter && !nameFilterFiles.loadError ? '没有匹配此筛选的文件' : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileExplorerToolbar
        refresh={manualRefresh}
        canCollapseAll={canCollapseAll}
        onCollapseAll={handleCollapseAll}
        showDotfiles={showDotfiles}
        onToggleDotfiles={handleToggleDotfiles}
      />
      <FileExplorerQueryStrip>
        <FileExplorerNameFilter
          query={nameFilterQuery}
          loading={nameFilterFiles.loading}
          onQueryChange={setNameFilterQuery}
          onClear={handleClearNameFilter}
        />
      </FileExplorerQueryStrip>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} tabIndex={-1} className="h-full min-h-0 overflow-auto py-2">
          {!showTree && (
            <FileExplorerTreeStatus
              isLoading={isLoading}
              error={hasError ? treeError : null}
              isEmpty={isEmptyState && !isLoading && !hasError}
              emptyMessage={emptyMessage}
            />
          )}
          {showTree && (
            <FileExplorerVirtualRows
              virtualizer={virtualizer}
              rowProjection={rowProjection}
              expanded={rowExpandedPaths}
              dirCache={dirCache}
              selectedPaths={selectedPaths}
              activeFilePath={activeFilePath}
              onClick={handleRowClick}
              onDoubleClick={handleDoubleClick}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(FileExplorer)
