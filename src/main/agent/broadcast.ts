import { IpcChannel } from '@shared/IpcChannel'
import type { IpcEventName } from '@shared/ipc/schemas/ipcSchemas'
import type { EventPayload } from '@shared/ipc/types'
import { BrowserWindow } from 'electron'

/** 向所有窗口广播一个类型安全的 IpcApi 事件（agent 域通用）。 */
export function broadcastIpcEvent<E extends IpcEventName>(
  event: E,
  payload: EventPayload<E>
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.IpcApi_Event, event, payload)
    }
  }
}
