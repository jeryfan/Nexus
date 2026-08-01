import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { DataApiDataChangeEffect, DataRequest } from '@shared/data/api/types'
import type { CacheEntry, CacheSyncMessage } from '@shared/data/cache/cacheTypes'
import { IpcChannel } from '@shared/IpcChannel'
import type { MenuAnchor, NativePopupMenuModel, NativePopupMenuResult } from '@shared/types/command'
import type { CommandId } from '@shared/utils/command'

import { ipcApi } from './ipc'

// Custom APIs for renderer
const api = {
  // 查询窗口当前是否处于全屏（macOS 全屏时红绿灯隐藏）
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
  // 订阅全屏状态变化，返回取消订阅函数
  onFullscreenChange: (callback: (isFullscreen: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, isFullscreen: boolean): void =>
      callback(isFullscreen)
    ipcRenderer.on('window:fullscreen-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:fullscreen-changed', listener)
    }
  },
  command: {
    showNativePopupMenu: (
      model: NativePopupMenuModel<CommandId>,
      anchor?: MenuAnchor
    ): Promise<NativePopupMenuResult<CommandId> | undefined> =>
      ipcRenderer.invoke(IpcChannel.NativeCommandPopupMenu_Show, model, anchor)
  },
  cache: {
    broadcastSync: (message: CacheSyncMessage): void =>
      ipcRenderer.send(IpcChannel.Cache_Sync, message),
    onSync: (callback: (message: CacheSyncMessage) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, message: CacheSyncMessage): void =>
        callback(message)
      ipcRenderer.on(IpcChannel.Cache_Sync, listener)
      return () => ipcRenderer.removeListener(IpcChannel.Cache_Sync, listener)
    },
    getAllShared: (): Promise<Record<string, CacheEntry>> =>
      ipcRenderer.invoke(IpcChannel.Cache_GetAllShared)
  },
  dataApi: {
    request: (request: DataRequest) => ipcRenderer.invoke(IpcChannel.DataApi_Request, request),
    onDataChanged: (callback: (effects: DataApiDataChangeEffect[]) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, effects: DataApiDataChangeEffect[]): void =>
        callback(effects)
      ipcRenderer.on(IpcChannel.DataApi_DataChanged, listener)
      return () => ipcRenderer.removeListener(IpcChannel.DataApi_DataChanged, listener)
    }
  },
  ipcApi
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type WindowApiType = typeof api
