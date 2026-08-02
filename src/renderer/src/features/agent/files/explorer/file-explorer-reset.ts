/**
 * Decides whether the explorer must reset its caches for the now-visible root.
 * Keyed by root path (orca keyed the same check by worktree path).
 */
export function shouldResetFileExplorerForVisibleRoot(
  lastResetRootPath: string | null,
  visibleRootPath: string | null
): visibleRootPath is string {
  return visibleRootPath !== null && lastResetRootPath !== visibleRootPath
}
