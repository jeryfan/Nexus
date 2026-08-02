/**
 * Renderer client for the fs IPC domain (file-explorer, ported from orca).
 *
 * Mirrors the LOCAL branch of orca's `runtime/runtime-file-client.ts`
 * (`readRuntimeDirectory` / `readRuntimeFileContent` / `statRuntimePath` /
 * `listRuntimeFiles`): single-path arguments, no connectionId / runtime
 * target / SSH context — later component ports can drop their context
 * threading and call these directly.
 */
import { ipcApi } from '@renderer/ipc/ipcApi'
import type { OutputFor } from '@shared/ipc/types'

export type FsDirEntry = OutputFor<'fs.readDir'>[number]
export type FsReadFileResult = OutputFor<'fs.readFile'>
export type FsStatResult = OutputFor<'fs.stat'>

/** orca: readRuntimeDirectory — directories first, then localeCompare by name. */
export async function readDir(dirPath: string): Promise<FsDirEntry[]> {
  return ipcApi.request('fs.readDir', { dirPath })
}

/**
 * orca: readRuntimeFileContent / readRuntimeFilePreview — text files return
 * utf-8 content; previewable binaries (images/PDF) return base64 with
 * `isImage`/`mimeType`; other binaries return empty content with `isBinary`.
 */
export async function readFile(filePath: string): Promise<FsReadFileResult> {
  return ipcApi.request('fs.readFile', { filePath })
}

/** orca: statRuntimePath. */
export async function stat(targetPath: string): Promise<FsStatResult> {
  return ipcApi.request('fs.stat', { targetPath })
}

/** orca: listRuntimeFiles — recursive root-relative paths (rg → git → readdir fallback). */
export async function listFiles(dirPath: string): Promise<string[]> {
  return ipcApi.request('fs.listFiles', { dirPath })
}

/** orca: `fs:writeFile` local branch — full-text utf-8 write. */
export async function writeFile(filePath: string, content: string): Promise<void> {
  return ipcApi.request('fs.writeFile', { filePath, content })
}
