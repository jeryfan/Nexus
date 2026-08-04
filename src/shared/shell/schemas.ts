/**
 * Shell IPC route schemas（shell 域的 openInExternalEditor 本地分支）。
 *
 * Renderer code MUST `import type` from this module so zod never enters the
 * renderer bundle.
 */
import * as z from 'zod'

import { defineRoute } from '../ipc/define'

export const shellRequestSchemas = {
  /** 在外部编辑器中打开本地文件（默认命令 `code`，即 VS Code）。 */
  'shell.openInExternalEditor': defineRoute({
    input: z.strictObject({ path: z.string().min(1), command: z.string().min(1).optional() }),
    output: z.void()
  }),
  /** 在系统默认浏览器中打开外部 URL（shell.openUrl 本地分支）。 */
  'shell.openUrl': defineRoute({
    input: z.strictObject({ url: z.string().min(1) }),
    output: z.void()
  }),
  /** 用系统默认应用打开本地文件；返回是否成功（shell.openFilePath 本地分支）。 */
  'shell.openFilePath': defineRoute({
    input: z.strictObject({ path: z.string().min(1) }),
    output: z.boolean()
  }),
  /** 在文件管理器中定位本地文件（shell.openInFileManager 本地分支）。 */
  'shell.openInFileManager': defineRoute({
    input: z.strictObject({ path: z.string().min(1) }),
    output: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true) }),
      z.strictObject({ ok: z.literal(false), reason: z.string() })
    ])
  })
}
