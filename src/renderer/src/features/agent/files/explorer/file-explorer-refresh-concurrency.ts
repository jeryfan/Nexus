export const FILE_EXPLORER_LOCAL_REFRESH_CONCURRENCY = 16

/**
 * In-flight directory-read cap for one File Explorer refresh.
 *
 * orca tiers this by operation owner (local/SSH/runtime); Nexus only reads the
 * local filesystem, so a single local tier remains.
 */
export function fileExplorerRefreshConcurrency(): number {
  return FILE_EXPLORER_LOCAL_REFRESH_CONCURRENCY
}
