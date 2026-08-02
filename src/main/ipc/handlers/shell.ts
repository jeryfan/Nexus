/**
 * Shell IPC handlers（shell 域）。Ported from orca src/main/ipc/shell.ts:73
 * `openInExternalEditor` 的本地分支：校验绝对路径 + 存在性 →
 * launchExternalEditor（spawn detached + unref）。orca 的 store/SSH/remote
 * 分支未迁移；结果对象改为 z.void()，失败直接抛错（渲染层 toast 错误消息）。
 */
import { stat } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'

import type { shellRequestSchemas } from '@shared/shell/schemas'
import type { IpcHandlersFor } from '@shared/ipc/types'

import {
  EXTERNAL_EDITOR_CLI_COMMAND,
  launchExternalEditor,
  resolveExternalEditorLaunchSpec
} from '@main/external-editor-launch'

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue)
    return true
  } catch {
    return false
  }
}

export const shellHandlers: IpcHandlersFor<typeof shellRequestSchemas> = {
  'shell.openInExternalEditor': async (input) => {
    const target = normalize(input.path)
    if (!isAbsolute(target)) {
      throw new Error(`路径不是绝对路径: ${input.path}`)
    }
    if (!(await pathExists(target))) {
      throw new Error(`路径不存在: ${target}`)
    }
    try {
      // command 缺省时 resolveExternalEditorLaunchSpec 内部回退到 'code'
      await launchExternalEditor(
        resolveExternalEditorLaunchSpec(input.command ?? EXTERNAL_EDITOR_CLI_COMMAND, target)
      )
    } catch (error) {
      throw new Error(
        `启动外部编辑器失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
