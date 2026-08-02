import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useRef, useState } from 'react'
import type { DirCache, FileExplorerTreeRefreshOutcome } from './file-explorer-types'
import { splitPathSegments } from './path-tree'
import { stat } from '../fsClient'
import { createFileExplorerDirLoadTracker } from './file-explorer-dir-load-tracker'
import {
  fileExplorerEntriesToTreeNodes,
  readFileExplorerDirectory
} from './file-explorer-directory-listing'
import { refreshFileExplorerExpandedDirs } from './file-explorer-expanded-dirs-refresh'
import { collectStaleDirCachePaths } from './file-explorer-stale-dir-cache'
import { fileExplorerRefreshConcurrency } from './file-explorer-refresh-concurrency'

type UseFileExplorerTreeResult = {
  dirCache: Record<string, DirCache>
  setDirCache: Dispatch<SetStateAction<Record<string, DirCache>>>
  rootCache: DirCache | undefined
  rootError: string | null
  loadDir: (
    dirPath: string,
    depth: number,
    options?: { force?: boolean; failOnError?: boolean }
  ) => Promise<boolean>
  statPath: (path: string) => Promise<{ isDirectory: boolean }>
  markPathAsDirectory: (path: string) => void
  refreshTree: () => Promise<FileExplorerTreeRefreshOutcome>
  refreshDir: (dirPath: string) => Promise<void>
  /** True while a dir's cached listing predates the last full refresh that skipped it. */
  isDirStale: (dirPath: string) => boolean
  resetAndLoad: () => void
}

export function useFileExplorerTree(
  rootPath: string | null,
  expanded: Set<string>
): UseFileExplorerTreeResult {
  const [dirCache, setDirCache] = useState<Record<string, DirCache>>({})
  const [rootError, setRootError] = useState<string | null>(null)
  const dirCacheRef = useRef(dirCache)
  dirCacheRef.current = dirCache
  const dirLoadTrackerRef = useRef(createFileExplorerDirLoadTracker())
  // Why: a ref, not state — the expansion effect must read the mark set by a refresh that landed
  // after the effect's render, and a state write would only be visible one render too late.
  const staleDirsRef = useRef(new Set<string>())
  // Why: separates a failed root read from a superseded one — loadDir returns false for both.
  const rootReadFailedRef = useRef(false)

  const loadDir = useCallback(
    async (
      dirPath: string,
      depth: number,
      options?: { force?: boolean; failOnError?: boolean }
    ) => {
      const cache = dirCacheRef.current
      if (!options?.force && (cache[dirPath]?.children.length > 0 || cache[dirPath]?.loading)) {
        return true
      }
      const loadToken = dirLoadTrackerRef.current.begin(dirPath)
      // Why: this read starts after the refresh that marked the dir, so its result is current.
      staleDirsRef.current.delete(dirPath)
      // Why: when force-reloading a directory, keep the previous children visible while the
      // fresh listing loads. Clearing to [] would momentarily shrink the
      // visible projection and make the virtualizer jump to the top.
      setDirCache((prev) => ({
        ...prev,
        [dirPath]: {
          children: prev[dirPath]?.children ?? [],
          loading: true
        }
      }))
      try {
        const entries = await readFileExplorerDirectory(dirPath)
        if (!dirLoadTrackerRef.current.isCurrent(loadToken)) {
          return false
        }
        if (depth === -1) {
          setRootError(null)
        }
        const children = fileExplorerEntriesToTreeNodes(entries, dirPath, depth, rootPath)
        setDirCache((prev) => ({
          ...prev,
          [dirPath]: { children, loading: false }
        }))
        return true
      } catch (error) {
        if (!dirLoadTrackerRef.current.isCurrent(loadToken)) {
          return false
        }
        if (depth === -1) {
          // Why: the old implementation collapsed root read failures into an
          // empty tree, which made authorization/path bugs look like a real
          // empty root. Preserve the message so the UI can distinguish
          // "no files" from "could not read this directory".
          setRootError(error instanceof Error ? error.message : String(error))
          rootReadFailedRef.current = true
        }
        setDirCache((prev) => ({ ...prev, [dirPath]: { children: [], loading: false } }))
        return !options?.failOnError
      }
    },
    [rootPath]
  )

  const markPathAsDirectory = useCallback((path: string) => {
    setDirCache((prev) => {
      let changed = false
      const next: Record<string, DirCache> = {}
      for (const [dirPath, cache] of Object.entries(prev)) {
        let cacheChanged = false
        const children = cache.children.map((child) => {
          if (child.path !== path || child.isDirectory) {
            return child
          }
          changed = true
          cacheChanged = true
          return { ...child, isDirectory: true }
        })
        next[dirPath] = cacheChanged ? { ...cache, children } : cache
      }
      return changed ? next : prev
    })
  }, [])

  const statPath = useCallback(async (path: string) => {
    const result = await stat(path)
    return { isDirectory: result.isDirectory }
  }, [])

  const refreshTree = useCallback(async (): Promise<FileExplorerTreeRefreshOutcome> => {
    if (!rootPath) {
      // Why: not 'root-unreadable' — no read was attempted, and that outcome tells callers to DROP
      // their pending refreshes. Report the refresh as not-done so they keep them instead.
      return 'superseded'
    }
    // Why: clearing the entire dirCache here would momentarily empty the
    // visible projection and jump the virtualizer to the top. Instead we rely
    // on force-reload keeping existing children visible until fresh data lands.
    // Why: mark before the first read, against the live expanded set — a dir expanded after this
    // point loads through the expansion effect, which would otherwise trust a listing this refresh
    // never re-read.
    // Why: union, not replace. This refresh can bail below without re-reading a single expanded
    // dir, so replacing would erase an earlier mark for a dir nothing has verified since. Marks are
    // cleared only where a read actually lands: loadDir, and onDirCommitted per committed wave.
    // Why: prune first — a mark only means anything while the dir still has a cached listing to
    // distrust, and unioning without this would accumulate every path visited in the session.
    for (const dirPath of staleDirsRef.current) {
      if (dirCacheRef.current[dirPath] === undefined) {
        staleDirsRef.current.delete(dirPath)
      }
    }
    // Why: callers use the latest refreshTree identity, so this closure has the live expanded set.
    for (const dirPath of collectStaleDirCachePaths(dirCacheRef.current, rootPath, expanded)) {
      staleDirsRef.current.add(dirPath)
    }
    const refreshSession = dirLoadTrackerRef.current.getSession()
    rootReadFailedRef.current = false
    // Why: failOnError, else a failed read reports a completed root read and we fan out one
    // doomed wave per expanded dir.
    const rootLoadCompleted = await loadDir(rootPath, -1, { force: true, failOnError: true })
    if (!rootLoadCompleted || !dirLoadTrackerRef.current.isSessionCurrent(refreshSession)) {
      // Why: the expanded dirs below were never re-read either way, but the two reasons want
      // opposite handling from callers — see FileExplorerTreeRefreshOutcome.
      return rootReadFailedRef.current ? 'root-unreadable' : 'superseded'
    }
    // Why: root was just force-loaded above; exclude it here so
    // refreshFileExplorerExpandedDirs doesn't queue a duplicate read of root.
    const expandedDirs = Array.from(expanded)
      .filter((dirPath) => dirPath !== rootPath)
      .map((dirPath) => ({
        dirPath,
        depth: splitPathSegments(dirPath.slice(rootPath.length + 1)).length - 1
      }))
    const allDirsCommitted = await refreshFileExplorerExpandedDirs({
      dirs: expandedDirs,
      rootPath,
      dirLoadTracker: dirLoadTrackerRef.current,
      setDirCache,
      readDirectory: (dirPath) => readFileExplorerDirectory(dirPath),
      maxConcurrentReads: fileExplorerRefreshConcurrency(),
      onDirCommitted: (dirPath) => staleDirsRef.current.delete(dirPath)
    })
    return allDirsCommitted ? 'refreshed' : 'superseded'
  }, [expanded, loadDir, rootPath])

  const refreshDir = useCallback(
    async (dirPath: string) => {
      if (!rootPath) {
        return
      }
      const depth =
        dirPath === rootPath ? -1 : splitPathSegments(dirPath.slice(rootPath.length + 1)).length - 1
      await loadDir(dirPath, depth, { force: true })
    },
    [rootPath, loadDir]
  )

  const isDirStale = useCallback((dirPath: string) => staleDirsRef.current.has(dirPath), [])

  const rootCache = rootPath ? dirCache[rootPath] : undefined

  const resetAndLoad = useCallback(() => {
    // Why: stale readDir responses from the previous root/reset session
    // must not repopulate the explorer after the tree has been cleared.
    dirLoadTrackerRef.current.reset()
    staleDirsRef.current.clear()
    setDirCache({})
    setRootError(null)
    if (rootPath) {
      void loadDir(rootPath, -1, { force: true })
    }
  }, [rootPath, loadDir])

  return {
    dirCache,
    setDirCache,
    rootCache,
    rootError,
    loadDir,
    statPath,
    markPathAsDirectory,
    refreshTree,
    refreshDir,
    isDirStale,
    resetAndLoad
  }
}
