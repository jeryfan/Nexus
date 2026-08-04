/**
 * Shell IPC handlers（shell 域）。
 * `openInExternalEditor` 的本地分支：校验绝对路径 + 存在性 →
 * launchExternalEditor（spawn detached + unref）。store/SSH/remote
 * 分支未迁移；结果对象为 z.void()，失败直接抛错（渲染层 toast 错误消息）。
 */
import { stat } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'

import { shell } from 'electron'

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
  },

  // 仅本地分支（远程 runtime / SSH 分支未迁移）。
  'shell.openUrl': async (input) => {
    let parsed: URL
    try {
      parsed = new URL(input.url)
    } catch {
      return
    }
    // Why: 只放行 http(s)，阻止 file://、javascript: 等协议经 openExternal 逃逸。
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return
    }
    await shell.openExternal(parsed.toString())
  },

  'shell.openFilePath': async (input) => {
    const target = normalize(input.path)
    if (!isAbsolute(target) || !(await pathExists(target))) {
      return false
    }
    try {
      const errorMessage = await shell.openPath(target)
      return errorMessage.length === 0
    } catch {
      return false
    }
  },

  'shell.openInFileManager': async (input) => {
    const target = normalize(input.path)
    if (!isAbsolute(target)) {
      return { ok: false as const, reason: 'not-absolute' }
    }
    if (!(await pathExists(target))) {
      return { ok: false as const, reason: 'not-found' }
    }
    try {
      shell.showItemInFolder(target)
      return { ok: true as const }
    } catch {
      return { ok: false as const, reason: 'launch-failed' }
    }
  }
}
