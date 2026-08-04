import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ExecutionHostId } from '@shared/browser/execution-host'
import type {
  BrowserCaptureSelectionScreenshotResult,
  BrowserExtractHoverResult,
  BrowserGrabResult,
  BrowserSetGrabModeResult
} from '@shared/browser/browser-grab-types'
import type {
  BrowserViewportOverride,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '@shared/browser/types'
import type { DataApiDataChangeEffect, DataRequest } from '@shared/data/api/types'
import type { CacheEntry, CacheSyncMessage } from '@shared/data/cache/cacheTypes'
import { IpcChannel } from '@shared/IpcChannel'
import type { MenuAnchor, NativePopupMenuModel, NativePopupMenuResult } from '@shared/types/command'
import type { CommandId } from '@shared/utils/command'

import { createBrowserFindSubscriptions } from './browser-find-subscriptions'
import { ipcApi } from './ipc'

const browserFindSubscriptions = createBrowserFindSubscriptions()

ipcRenderer.on('ui:findInBrowserPage', (_event, source: unknown) => {
  browserFindSubscriptions.dispatch(source)
})

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
  browser: {
    registerGuest: (args: {
      browserPageId: string
      workspaceId: string
      worktreeId: string
      sessionProfileId?: string | null
      webContentsId: number
    }): Promise<boolean> => ipcRenderer.invoke('browser:registerGuest', args),

    unregisterGuest: (args: { browserPageId: string }): Promise<void> =>
      ipcRenderer.invoke('browser:unregisterGuest', args),

    openDevTools: (args: { browserPageId: string }): Promise<boolean> =>
      ipcRenderer.invoke('browser:openDevTools', args),

    setViewportOverride: (args: {
      browserPageId: string
      override: BrowserViewportOverride | null
    }): Promise<boolean> => ipcRenderer.invoke('browser:setViewportOverride', args),

    setAnnotationViewportBridge: (args) =>
      ipcRenderer.invoke('browser:setAnnotationViewportBridge', args),

    onGuestLoadFailed: (
      callback: (args: {
        browserPageId: string
        loadError: { code: number; description: string; validatedUrl: string }
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          browserPageId: string
          loadError: { code: number; description: string; validatedUrl: string }
        }
      ): void => callback(data)
      ipcRenderer.on('browser:guest-load-failed', listener)
      return () => ipcRenderer.removeListener('browser:guest-load-failed', listener)
    },

    onCertificateFailureChanged: (callback): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: Parameters<typeof callback>[0]): void =>
        callback(data)
      ipcRenderer.on('browser:certificate-failure-changed', listener)
      return () => ipcRenderer.removeListener('browser:certificate-failure-changed', listener)
    },

    proceedCertificate: (args) => ipcRenderer.invoke('browser:proceedCertificate', args),

    onPermissionDenied: (
      callback: (event: { browserPageId: string; permission: string; origin: string }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { browserPageId: string; permission: string; origin: string }
      ): void => callback(data)
      ipcRenderer.on('browser:permission-denied', listener)
      return () => ipcRenderer.removeListener('browser:permission-denied', listener)
    },

    onPopup: (
      callback: (event: {
        browserPageId: string
        origin: string
        action: 'opened-in-nexus' | 'opened-external' | 'blocked'
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          browserPageId: string
          origin: string
          action: 'opened-in-nexus' | 'opened-external' | 'blocked'
        }
      ): void => callback(data)
      ipcRenderer.on('browser:popup', listener)
      return () => ipcRenderer.removeListener('browser:popup', listener)
    },

    onDownloadRequested: (
      callback: (event: {
        browserPageId: string
        downloadId: string
        origin: string
        filename: string
        totalBytes: number | null
        mimeType: string | null
        savePath: string
        status: 'downloading'
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          browserPageId: string
          downloadId: string
          origin: string
          filename: string
          totalBytes: number | null
          mimeType: string | null
          savePath: string
          status: 'downloading'
        }
      ): void => callback(data)
      ipcRenderer.on('browser:download-requested', listener)
      return () => ipcRenderer.removeListener('browser:download-requested', listener)
    },

    onDownloadProgress: (
      callback: (event: {
        browserPageId?: string
        downloadId: string
        receivedBytes: number
        totalBytes: number | null
        state: 'progressing' | 'interrupted' | null
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          browserPageId?: string
          downloadId: string
          receivedBytes: number
          totalBytes: number | null
          state: 'progressing' | 'interrupted' | null
        }
      ): void => callback(data)
      ipcRenderer.on('browser:download-progress', listener)
      return () => ipcRenderer.removeListener('browser:download-progress', listener)
    },

    onDownloadFinished: (
      callback: (event: {
        browserPageId?: string
        downloadId: string
        status: 'completed' | 'canceled' | 'failed'
        savePath: string | null
        error: string | null
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          browserPageId?: string
          downloadId: string
          status: 'completed' | 'canceled' | 'failed'
          savePath: string | null
          error: string | null
        }
      ): void => callback(data)
      ipcRenderer.on('browser:download-finished', listener)
      return () => ipcRenderer.removeListener('browser:download-finished', listener)
    },

    onContextMenuRequested: (
      callback: (event: {
        browserPageId: string
        x: number
        y: number
        screenX: number
        screenY: number
        pageUrl: string
        linkUrl: string | null
        selectionText: string
        canGoBack: boolean
        canGoForward: boolean
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          browserPageId: string
          x: number
          y: number
          screenX: number
          screenY: number
          pageUrl: string
          linkUrl: string | null
          selectionText: string
          canGoBack: boolean
          canGoForward: boolean
        }
      ): void => callback(data)
      ipcRenderer.on('browser:context-menu-requested', listener)
      return () => ipcRenderer.removeListener('browser:context-menu-requested', listener)
    },

    onContextMenuDismissed: (
      callback: (event: { browserPageId: string }) => void
    ): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: { browserPageId: string }): void =>
        callback(data)
      ipcRenderer.on('browser:context-menu-dismissed', listener)
      return () => ipcRenderer.removeListener('browser:context-menu-dismissed', listener)
    },

    onNavigationUpdate: (
      callback: (event: { browserPageId: string; url: string; title: string }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { browserPageId: string; url: string; title: string }
      ): void => callback(data)
      ipcRenderer.on('browser:navigation-update', listener)
      return () => ipcRenderer.removeListener('browser:navigation-update', listener)
    },

    onActivateView: (
      callback: (data: { worktreeId?: string; browserPageId?: string }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { worktreeId?: string; browserPageId?: string }
      ): void => callback(data)
      ipcRenderer.on('browser:activateView', listener)
      return () => ipcRenderer.removeListener('browser:activateView', listener)
    },

    onPaneFocus: (
      callback: (data: { worktreeId: string | null; browserPageId: string }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { worktreeId: string | null; browserPageId: string }
      ): void => callback(data)
      ipcRenderer.on('browser:pane-focus', listener)
      return () => ipcRenderer.removeListener('browser:pane-focus', listener)
    },

    onOpenLinkInNexusTab: (
      callback: (event: { browserPageId: string; url: string }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { browserPageId: string; url: string }
      ): void => callback(data)
      ipcRenderer.on('browser:open-link-in-nexus-tab', listener)
      return () => ipcRenderer.removeListener('browser:open-link-in-nexus-tab', listener)
    },

    cancelDownload: (args: { downloadId: string }): Promise<boolean> =>
      ipcRenderer.invoke('browser:cancelDownload', args),

    setGrabMode: (args: {
      browserPageId: string
      enabled: boolean
    }): Promise<BrowserSetGrabModeResult> => ipcRenderer.invoke('browser:setGrabMode', args),

    awaitGrabSelection: (args: {
      browserPageId: string
      opId: string
    }): Promise<BrowserGrabResult> => ipcRenderer.invoke('browser:awaitGrabSelection', args),

    cancelGrab: (args: { browserPageId: string }): Promise<boolean> =>
      ipcRenderer.invoke('browser:cancelGrab', args),

    captureSelectionScreenshot: (args: {
      browserPageId: string
      rect: { x: number; y: number; width: number; height: number }
    }): Promise<BrowserCaptureSelectionScreenshotResult> =>
      ipcRenderer.invoke('browser:captureSelectionScreenshot', args),

    extractHoverPayload: (args: { browserPageId: string }): Promise<BrowserExtractHoverResult> =>
      ipcRenderer.invoke('browser:extractHoverPayload', args),

    onGrabModeToggle: (callback: (browserPageId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, browserPageId: string): void =>
        callback(browserPageId)
      ipcRenderer.on('browser:grabModeToggle', listener)
      return () => ipcRenderer.removeListener('browser:grabModeToggle', listener)
    },

    onGrabActionShortcut: (
      callback: (args: { browserPageId: string; key: 'c' | 's' }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { browserPageId: string; key: 'c' | 's' }
      ): void => callback(data)
      ipcRenderer.on('browser:grabActionShortcut', listener)
      return () => ipcRenderer.removeListener('browser:grabActionShortcut', listener)
    },

    sessionListProfiles: (): Promise<unknown[]> =>
      ipcRenderer.invoke('browser:session:listProfiles'),

    sessionCreateProfile: (args: {
      scope: 'default' | 'isolated' | 'imported'
      label: string
    }): Promise<unknown> => ipcRenderer.invoke('browser:session:createProfile', args),

    sessionDeleteProfile: (args: { profileId: string }): Promise<boolean> =>
      ipcRenderer.invoke('browser:session:deleteProfile', args),

    sessionImportCookies: (args: {
      profileId: string
    }): Promise<
      { ok: true; profileId: string; summary: unknown } | { ok: false; reason: string }
    > => ipcRenderer.invoke('browser:session:importCookies', args),

    sessionResolvePartition: (args: { profileId: string | null }): Promise<string | null> =>
      ipcRenderer.invoke('browser:session:resolvePartition', args),

    sessionDetectBrowsers: (): Promise<unknown[]> =>
      ipcRenderer.invoke('browser:session:detectBrowsers'),

    sessionImportFromBrowser: (args: {
      profileId: string
      browserFamily: string
      browserProfile?: string
    }): Promise<
      { ok: true; profileId: string; summary: unknown } | { ok: false; reason: string }
    > => ipcRenderer.invoke('browser:session:importFromBrowser', args),

    sessionClearDefaultCookies: (): Promise<boolean> =>
      ipcRenderer.invoke('browser:session:clearDefaultCookies'),

    notifyActiveTabChanged: (args: { browserPageId: string }): Promise<boolean> =>
      ipcRenderer.invoke('browser:activeTabChanged', args)
  },
  session: {
    // hostId is optional; main defaults it to 'local' so existing omitting call sites keep the local session partition.
    get: (hostId?: ExecutionHostId): Promise<WorkspaceSessionState> =>
      ipcRenderer.invoke('session:get', hostId),
    set: (args: WorkspaceSessionState, hostId?: ExecutionHostId): Promise<void> =>
      ipcRenderer.invoke('session:set', args, hostId),
    patch: (args: WorkspaceSessionPatch, hostId?: ExecutionHostId): Promise<void> =>
      ipcRenderer.invoke('session:patch', args, hostId),
    flush: (): Promise<void> => ipcRenderer.invoke('session:flush'),
    /** Synchronous session save for beforeunload — blocks until flushed to disk. */
    setSync: (args: WorkspaceSessionState, hostId?: ExecutionHostId): void => {
      ipcRenderer.sendSync('session:set-sync', args, hostId)
    }
  },
  // 内置浏览器相关的 UI 事件订阅（浏览器子集；其余 ui 事件不属于浏览器域）
  ui: {
    onNewBrowserTab: (callback: () => void): (() => void) => {
      const listener = (_event: IpcRendererEvent): void => callback()
      ipcRenderer.on('ui:newBrowserTab', listener)
      return () => ipcRenderer.removeListener('ui:newBrowserTab', listener)
    },
    onFocusBrowserAddressBar: (callback: () => void): (() => void) => {
      const listener = (_event: IpcRendererEvent): void => callback()
      ipcRenderer.on('ui:focusBrowserAddressBar', listener)
      return () => ipcRenderer.removeListener('ui:focusBrowserAddressBar', listener)
    },
    onFindInBrowserPage: browserFindSubscriptions.subscribe,
    onReloadBrowserPage: (callback: () => void): (() => void) => {
      const listener = (_event: IpcRendererEvent): void => callback()
      ipcRenderer.on('ui:reloadBrowserPage', listener)
      return () => ipcRenderer.removeListener('ui:reloadBrowserPage', listener)
    },
    onHardReloadBrowserPage: (callback: () => void): (() => void) => {
      const listener = (_event: IpcRendererEvent): void => callback()
      ipcRenderer.on('ui:hardReloadBrowserPage', listener)
      return () => ipcRenderer.removeListener('ui:hardReloadBrowserPage', listener)
    },
    onBrowserHistoryNavigate: (callback: (direction: 'back' | 'forward') => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, direction: 'back' | 'forward'): void =>
        callback(direction)
      ipcRenderer.on('ui:browserHistoryNavigate', listener)
      return () => ipcRenderer.removeListener('ui:browserHistoryNavigate', listener)
    },
    onZoomBrowserPage: (callback: (direction: 'in' | 'out' | 'reset') => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, direction: 'in' | 'out' | 'reset'): void =>
        callback(direction)
      ipcRenderer.on('ui:zoomBrowserPage', listener)
      return () => ipcRenderer.removeListener('ui:zoomBrowserPage', listener)
    },
    onRequestTabCreate: (
      callback: (data: {
        requestId: string
        url: string
        worktreeId?: string
        sessionProfileId?: string | null
        sessionPartition?: string
        activate?: boolean
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          requestId: string
          url: string
          worktreeId?: string
          sessionProfileId?: string | null
          sessionPartition?: string
          activate?: boolean
        }
      ): void => callback(data)
      ipcRenderer.on('browser:requestTabCreate', listener)
      return () => ipcRenderer.removeListener('browser:requestTabCreate', listener)
    },
    replyTabCreate: (reply: {
      requestId: string
      browserPageId?: string
      error?: string
    }): void => {
      ipcRenderer.send('browser:tabCreateReply', reply)
    },
    onRequestTabSetProfile: (
      callback: (data: {
        requestId: string
        browserPageId: string
        profileId: string
        sessionPartition?: string
      }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          requestId: string
          browserPageId: string
          profileId: string
          sessionPartition?: string
        }
      ): void => callback(data)
      ipcRenderer.on('browser:requestTabSetProfile', listener)
      return () => ipcRenderer.removeListener('browser:requestTabSetProfile', listener)
    },
    replyTabSetProfile: (reply: { requestId: string; error?: string }): void => {
      ipcRenderer.send('browser:tabSetProfileReply', reply)
    },
    onRequestTabClose: (
      callback: (data: { requestId: string; tabId: string | null; worktreeId?: string }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { requestId: string; tabId: string | null; worktreeId?: string }
      ): void => callback(data)
      ipcRenderer.on('browser:requestTabClose', listener)
      return () => ipcRenderer.removeListener('browser:requestTabClose', listener)
    },
    replyTabClose: (reply: { requestId: string; error?: string }): void => {
      ipcRenderer.send('browser:tabCloseReply', reply)
    },
    // 浏览器右键菜单坐标换算用 ui.getZoomLevel（webFrame）。
    // 渲染层无 Node integration，经 preload webFrame 暴露。
    getZoomLevel: (): number => webFrame.getZoomLevel()
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
