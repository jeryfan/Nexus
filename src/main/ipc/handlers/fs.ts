/**
 * Filesystem IPC handlers (file-explorer domain, ported from orca
 * src/main/ipc/filesystem.ts). Local-only: orca's resolveAuthorizedPath /
 * connectionId / SSH-provider layer is dropped — paths are `resolve()`d and
 * fs errors propagate to the renderer via the router's error envelope.
 */
import { open, readdir, readFile as fsReadFile, lstat, stat, writeFile as fsWriteFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

import type { fsRequestSchemas } from '@shared/fs/schemas'
import type { IpcHandlersFor } from '@shared/ipc/types'
import { isBinaryBuffer } from '@shared/fs/binary-buffer'

import { listLocalFiles } from '@main/fs/list-files'

// Why: Monaco degrades features on large files like VS Code, so a 5MB block would needlessly lock out ordinary JSON/log files.
const MAX_TEXT_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const BINARY_PROBE_BYTES = 8192
// Why: previewable binaries are base64 blobs (not parsed as text), and local IPC has no frame limit, so 50MB is safe.
const MAX_PREVIEWABLE_BINARY_SIZE = 50 * 1024 * 1024 // 50MB
const PREVIEWABLE_BINARY_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
}

async function isBinaryFilePrefix(filePath: string): Promise<boolean> {
  const handle = await open(filePath, 'r')
  try {
    const probe = Buffer.alloc(BINARY_PROBE_BYTES)
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0)
    return isBinaryBuffer(probe.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

// Why: following a symlink in readDir can touch macOS TCC-protected containers;
// treat links as file-like until explicitly opened (orca isDirectoryEntry).
function isDirectoryEntry(entry: {
  isDirectory(): boolean
  isSymbolicLink(): boolean
}): boolean {
  if (entry.isSymbolicLink()) {
    return false
  }
  return entry.isDirectory()
}

export const fsHandlers: IpcHandlersFor<typeof fsRequestSchemas> = {
  'fs.readDir': async (input) => {
    const dirPath = resolve(input.dirPath)
    const entries = await readdir(dirPath, { withFileTypes: true })
    const mapped = entries.map((entry) => ({
      name: entry.name,
      isDirectory: isDirectoryEntry(entry),
      isSymlink: entry.isSymbolicLink()
    }))
    return mapped.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  },

  'fs.readFile': async (input) => {
    const filePath = resolve(input.filePath)
    const stats = await stat(filePath)
    const mimeType = PREVIEWABLE_BINARY_MIME_TYPES[extname(filePath).toLowerCase()]
    const sizeLimit = mimeType ? MAX_PREVIEWABLE_BINARY_SIZE : MAX_TEXT_FILE_SIZE
    if (stats.size > sizeLimit) {
      throw new Error(
        `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds ${sizeLimit / 1024 / 1024}MB limit`
      )
    }

    if (mimeType) {
      const buffer = await fsReadFile(filePath)
      return {
        content: buffer.toString('base64'),
        isBinary: true,
        // Why: the renderer keys previewable-binary rendering off `isImage`, so set it for PDFs too to stay compatible.
        isImage: true,
        mimeType
      }
    }

    // Why: probe large unknown files first so archives aren't fully buffered only to discover they aren't editable text.
    if (stats.size > BINARY_PROBE_BYTES && (await isBinaryFilePrefix(filePath))) {
      return { content: '', isBinary: true }
    }

    const buffer = await fsReadFile(filePath)
    if (isBinaryBuffer(buffer)) {
      return { content: '', isBinary: true }
    }

    return { content: buffer.toString('utf-8'), isBinary: false }
  },

  'fs.stat': async (input) => {
    const stats = await stat(resolve(input.targetPath))
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtimeMs: stats.mtimeMs
    }
  },

  'fs.listFiles': async (input) => listLocalFiles(resolve(input.dirPath)),

  'fs.writeFile': async (input) => {
    const filePath = resolve(input.filePath)
    // orca fs:writeFile 本地分支（filesystem.ts:816-844）：目录拒写；
    // ENOENT（目标尚不存在的新文件）放行，由 writeFile 创建。
    try {
      const fileStats = await lstat(filePath)
      if (fileStats.isDirectory()) {
        throw new Error('Cannot write to a directory')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    await fsWriteFile(filePath, input.content, 'utf-8')
  }
}
