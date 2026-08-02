/**
 * Shell IPC route schemas（shell 域，ported from orca src/main/ipc/shell.ts 的
 * openInExternalEditor 本地分支）。
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
  })
}
