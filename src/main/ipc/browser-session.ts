// 浏览器会话 IPC（session 域的浏览器字段切片）。
// 差异：hostId 第二参数按 Nexus 单 host 忽略（仍容忍旧渲染层携带该参数调用）；
// read-terminal-scrollback-sync 属于未迁移的终端滚动缓冲领域，不注册。
import type { WorkspaceSessionPatch, WorkspaceSessionState } from '@shared/browser/types'
import { getBrowserSessionStore } from '@main/browser/browser-session-store'
import { ipcMain } from 'electron'

let registered = false

export function registerBrowserSessionHandlers(): void {
  if (registered) {
    return
  }
  registered = true

  ipcMain.handle('session:get', () => getBrowserSessionStore().getWorkspaceSession())

  ipcMain.handle('session:set', (_event, state: WorkspaceSessionState) => {
    getBrowserSessionStore().setWorkspaceSession(state)
  })

  ipcMain.handle('session:patch', (_event, patch: WorkspaceSessionPatch) => {
    getBrowserSessionStore().patchWorkspaceSession(patch)
  })

  ipcMain.handle('session:flush', () => {
    // Why: durable 生命周期 RPC 必须传播磁盘失败，而非走仅记录日志的 flush()。
    getBrowserSessionStore().flushOrThrow()
  })

  // 渲染层 beforeunload 用 sendSync 保证落盘：同步阻塞渲染层直到返回，
  // 无论 before-quit 顺序如何数据都已写盘；失败仅记录日志，不能抛进 unload 路径。
  ipcMain.on('session:set-sync', (event, state: WorkspaceSessionState) => {
    getBrowserSessionStore().setWorkspaceSession(state)
    getBrowserSessionStore().flush()
    event.returnValue = true
  })
}
