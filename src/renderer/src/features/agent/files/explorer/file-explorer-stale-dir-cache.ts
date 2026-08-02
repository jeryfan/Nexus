import type { DirCache } from './file-explorer-types'

/**
 * Cached directories a full tree refresh does not re-read.
 *
 * Why: `refreshTree` reads the root plus the currently expanded dirs, but `toggleDir` drops a dir
 * from `expandedDirs` without purging `dirCache`. Those collapsed-but-cached listings are
 * unverified and must be re-read on re-expansion — otherwise a file deleted while the dir was
 * collapsed stays visible forever, since the expansion effect skips any dir that already has
 * children.
 */
export function collectStaleDirCachePaths(
  cache: Record<string, DirCache>,
  rootPath: string,
  expanded: Set<string>
): string[] {
  return Object.keys(cache).filter((dirPath) => dirPath !== rootPath && !expanded.has(dirPath))
}

export type ExpandedDirLoadDecision = 'skip' | 'load' | 'reload'

/** What the expansion effect owes a newly expanded dir: nothing, a first read, or a forced re-read. */
export function decideExpandedDirLoad(
  cached: DirCache | undefined,
  stale: boolean
): ExpandedDirLoadDecision {
  if (cached?.loading) {
    return 'skip'
  }
  if (!cached?.children.length) {
    return 'load'
  }
  return stale ? 'reload' : 'skip'
}
