export const FILE_EXPLORER_LOCAL_REFRESH_CONCURRENCY = 16

/**
 * In-flight directory-read cap for one File Explorer refresh.
 *
 * Single local tier: only the local filesystem is read here (no SSH/remote
 * operation-owner tiers).
 */
export function fileExplorerRefreshConcurrency(): number {
  return FILE_EXPLORER_LOCAL_REFRESH_CONCURRENCY
}
