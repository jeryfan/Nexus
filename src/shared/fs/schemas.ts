/**
 * Filesystem IPC route schemas (file-explorer domain, ported from orca).
 *
 * Route inputs are untrusted renderer data and are always parsed (IpcRouter).
 * Paths arrive unscoped (no connectionId/authorization layer like orca's);
 * the main-process handlers `resolve()` them and let fs errors propagate.
 *
 * Renderer code MUST `import type` from this module so zod never enters the
 * renderer bundle.
 */
import * as z from 'zod'

import { defineRoute } from '../ipc/define'

const dirEntrySchema = z.strictObject({
  name: z.string(),
  isDirectory: z.boolean(),
  isSymlink: z.boolean()
})

const readFileResultSchema = z.strictObject({
  /** utf-8 text, or base64 when `isImage` is true; empty string for non-previewable binaries */
  content: z.string(),
  isBinary: z.boolean(),
  isImage: z.boolean().optional(),
  mimeType: z.string().optional()
})

const statResultSchema = z.strictObject({
  isFile: z.boolean(),
  isDirectory: z.boolean(),
  size: z.number(),
  mtimeMs: z.number()
})

export const fsRequestSchemas = {
  'fs.readDir': defineRoute({
    input: z.strictObject({ dirPath: z.string().min(1) }),
    output: z.array(dirEntrySchema)
  }),
  'fs.readFile': defineRoute({
    input: z.strictObject({ filePath: z.string().min(1) }),
    output: readFileResultSchema
  }),
  'fs.stat': defineRoute({
    input: z.strictObject({ targetPath: z.string().min(1) }),
    output: statResultSchema
  }),
  /** Recursive root-relative (`/`-separated) file paths, for the name filter / Quick Open. */
  'fs.listFiles': defineRoute({
    input: z.strictObject({ dirPath: z.string().min(1) }),
    output: z.array(z.string())
  }),
  /** Full-text utf-8 write (file preview editing). */
  'fs.writeFile': defineRoute({
    input: z.strictObject({ filePath: z.string().min(1), content: z.string() }),
    output: z.void()
  })
}

export type FsDirEntry = z.infer<typeof dirEntrySchema>
export type FsReadFileResult = z.infer<typeof readFileResultSchema>
export type FsStatResult = z.infer<typeof statResultSchema>
