export type TreeNode = {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  isSymlink?: boolean
  depth: number
}

export type DirCache = {
  children: TreeNode[]
  loading: boolean
}

/**
 * How a full tree refresh ended.
 *
 * Why three states, not a boolean: a caller that dropped its own pending dir refreshes because the
 * tree refresh covered them must re-issue on `superseded` (someone newer owns those reads) but NOT
 * on `root-unreadable` — there the read failed, and re-issuing buys one dead round trip per dir.
 */
export type FileExplorerTreeRefreshOutcome = 'refreshed' | 'superseded' | 'root-unreadable'
