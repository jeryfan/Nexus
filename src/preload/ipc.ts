import { IpcChannel } from '@shared/IpcChannel'
import { ipcRenderer, type IpcRendererEvent } from 'electron'

export const ipcApi = {
  request: (route: string, input?: unknown, meta?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(IpcChannel.IpcApi_Request, route, input, meta),

  on: (event: string, callback: (payload: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, name: string, payload: unknown): void => {
      if (name === event) callback(payload)
    }
    ipcRenderer.on(IpcChannel.IpcApi_Event, listener)
    return () => ipcRenderer.removeListener(IpcChannel.IpcApi_Event, listener)
  }
}
