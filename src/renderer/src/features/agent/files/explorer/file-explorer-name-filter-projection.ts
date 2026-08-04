import { joinPath, normalizeRelativePath } from '../lib/path'
import type { TreeNode } from './file-explorer-types'
import {
  createFileExplorerRowProjectionFromParts,
  type FileExplorerRowProjection
} from './file-explorer-row-projection'
import { isDotfileRelativePath } from './file-explorer-entries'
import { splitPathSegments } from './path-tree'

export type FileExplorerNameFilterProjectionSource = {
  query: string
  relativePaths: readonly string[] | null
}

export const FILE_EXPLORER_NAME_FILTER_QUERY_MAX_BYTES = 2 * 1024

export function getNextNameFilterCollapsedPaths(
  collapsedPaths: ReadonlySet<string>,
  dirPath: string,
  isExpanded: boolean
): Set<string> {
  const next = new Set(collapsedPaths)
  if (isExpanded) {
    next.add(dirPath)
  } else {
    next.delete(dirPath)
  }
  return next
}

export function getNameFilterCollapsedPathsAfterExpand(
  collapsedPaths: ReadonlySet<string>,
  dirPath: string
): Set<string> {
  if (!collapsedPaths.has(dirPath)) {
    return new Set(collapsedPaths)
  }
  const next = new Set(collapsedPaths)
  next.delete(dirPath)
  return next
}

export function isFileExplorerNameFilterQueryTooLarge(
  query: string | undefined,
  maxBytes = FILE_EXPLORER_NAME_FILTER_QUERY_MAX_BYTES
): boolean {
  const value = query ?? ''
  return value.length > maxBytes || measureUtf8ByteLength(value, maxBytes) > maxBytes
}

// Why: byte-length measurement with a stop-after-bytes early exit, the form
// the name-filter size guard needs.
function measureUtf8ByteLength(text: string, stopAfterBytes: number): number {
  let byteLength = 0
  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.codePointAt(index) ?? 0
    if (codePoint <= 0x7f) {
      byteLength += 1
    } else if (codePoint <= 0x7ff) {
      byteLength += 2
    } else if (codePoint <= 0xffff) {
      byteLength += 3
    } else {
      byteLength += 4
      index += 1
    }
    if (byteLength > stopAfterBytes) {
      return byteLength
    }
  }
  return byteLength
}

export function getFileExplorerNameFilterTokens(query: string | undefined): string[] {
  if (isFileExplorerNameFilterQueryTooLarge(query)) {
    return []
  }
  return splitFileExplorerNameFilterTokens(query ?? '')
}

// Why: accepted pasted file-filter queries are still on a renderer hot path;
// tokenize whitespace directly instead of allocating a regex split array.
function splitFileExplorerNameFilterTokens(query: string): string[] {
  const tokens: string[] = []
  let tokenStart = -1
  for (let index = 0; index <= query.length; index += 1) {
    const isEnd = index === query.length
    if (!isEnd && !isFileExplorerNameFilterWhitespace(query.charCodeAt(index))) {
      if (tokenStart === -1) {
        tokenStart = index
      }
      continue
    }
    if (tokenStart !== -1) {
      tokens.push(query.slice(tokenStart, index).toLocaleLowerCase())
      tokenStart = -1
    }
  }
  return tokens
}

function isFileExplorerNameFilterWhitespace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 160 ||
    code === 5760 ||
    (code >= 8192 && code <= 8202) ||
    code === 8232 ||
    code === 8233 ||
    code === 8239 ||
    code === 8287 ||
    code === 12288 ||
    code === 65279
  )
}

function relativePathMatchesNameFilter(relativePath: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) {
    return true
  }
  const haystack = normalizeRelativePath(relativePath).toLocaleLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

type SyntheticTreeEntry = {
  node: TreeNode
  children: Map<string, SyntheticTreeEntry>
}

function createSyntheticNode(
  rootPath: string,
  relativePath: string,
  name: string,
  depth: number,
  isDirectory: boolean
): TreeNode {
  return {
    name,
    path: joinPath(rootPath, relativePath),
    relativePath,
    isDirectory,
    depth
  }
}

export function createNameFilteredFileExplorerProjection({
  collapsedPaths,
  nameFilter,
  showDotfiles,
  rootPath
}: {
  collapsedPaths?: ReadonlySet<string>
  nameFilter: FileExplorerNameFilterProjectionSource
  showDotfiles: boolean
  rootPath: string
}): FileExplorerRowProjection {
  const visibleFlatRows: TreeNode[] = []
  const rowsByPath = new Map<string, TreeNode>()
  if (isFileExplorerNameFilterQueryTooLarge(nameFilter.query)) {
    return createFileExplorerRowProjectionFromParts(visibleFlatRows, rowsByPath)
  }
  const nameFilterTokens = getFileExplorerNameFilterTokens(nameFilter.query)
  if (nameFilterTokens.length === 0 || nameFilter.relativePaths === null) {
    // Why: empty queries use the normal explorer projection, and loading filters must not
    // fall back to a partial cached path list.
    return createFileExplorerRowProjectionFromParts(visibleFlatRows, rowsByPath)
  }

  const rootChildren = new Map<string, SyntheticTreeEntry>()
  for (const rawRelativePath of nameFilter.relativePaths) {
    const relativePath = normalizeRelativePath(rawRelativePath)
    if (!relativePath) {
      continue
    }
    if (!showDotfiles && isDotfileRelativePath(relativePath)) {
      continue
    }
    if (!relativePathMatchesNameFilter(relativePath, nameFilterTokens)) {
      continue
    }

    const segments = splitPathSegments(relativePath)
    let currentChildren = rootChildren
    let currentRelativePath = ''
    for (let index = 0; index < segments.length; index += 1) {
      const name = segments[index]
      currentRelativePath = currentRelativePath ? joinPath(currentRelativePath, name) : name
      const isDirectory = index < segments.length - 1
      let entry = currentChildren.get(name)
      if (!entry) {
        entry = {
          node: createSyntheticNode(rootPath, currentRelativePath, name, index, isDirectory),
          children: new Map()
        }
        currentChildren.set(name, entry)
      } else if (isDirectory && !entry.node.isDirectory) {
        entry.node = { ...entry.node, isDirectory: true }
      }
      currentChildren = entry.children
    }
  }

  appendNameFilteredEntries(rootChildren.values(), visibleFlatRows, rowsByPath, collapsedPaths)
  return createFileExplorerRowProjectionFromParts(visibleFlatRows, rowsByPath)
}

function appendNameFilteredEntries(
  entries: Iterable<SyntheticTreeEntry>,
  visibleFlatRows: TreeNode[],
  rowsByPath: Map<string, TreeNode>,
  collapsedPaths?: ReadonlySet<string>
): void {
  const sortedEntries = Array.from(entries).sort((a, b) => {
    if (a.node.isDirectory !== b.node.isDirectory) {
      return a.node.isDirectory ? -1 : 1
    }
    return a.node.name.localeCompare(b.node.name)
  })
  for (const entry of sortedEntries) {
    visibleFlatRows.push(entry.node)
    rowsByPath.set(entry.node.path, entry.node)
    if (entry.children.size > 0 && !collapsedPaths?.has(entry.node.path)) {
      appendNameFilteredEntries(
        entry.children.values(),
        visibleFlatRows,
        rowsByPath,
        collapsedPaths
      )
    }
  }
}

export function getFileExplorerNameFilterExpandedPaths(
  rowProjection: FileExplorerRowProjection,
  nameFilterQuery: string
): Set<string> {
  if (
    isFileExplorerNameFilterQueryTooLarge(nameFilterQuery) ||
    getFileExplorerNameFilterTokens(nameFilterQuery).length === 0
  ) {
    return new Set()
  }

  const expandedPaths = new Set<string>()
  const count = rowProjection.getVisibleCount()
  for (let index = 0; index < count - 1; index += 1) {
    const row = rowProjection.getRowAtIndex(index)
    const nextRow = rowProjection.getRowAtIndex(index + 1)
    if (row?.isDirectory && nextRow && nextRow.depth > row.depth) {
      expandedPaths.add(row.path)
    }
  }
  return expandedPaths
}
