import type { FsDirEntry } from '../fsClient'

export function shouldIncludeFileExplorerEntry(entry: FsDirEntry): boolean {
  return entry.name !== '.git' && entry.name !== 'node_modules'
}

function isDotfileSegment(segment: string): boolean {
  return segment.length > 1 && segment !== '..' && segment.startsWith('.')
}

export function isDotfileRelativePath(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .some(isDotfileSegment)
}
