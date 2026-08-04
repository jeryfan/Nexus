/* eslint-disable max-lines -- Why: browser RPC surface binds ~80 methods to one host adapter; keeps the mapping auditable in one file. */
// NexusRuntimeService：runtime RPC 的浏览器方法宿主适配（宿主接口按 Nexus 窗口/会话模型实现）。
// 结构：
// - RuntimeBrowserCommands 以宿主回调解耦，Nexus 在此提供窗口/会话实现
// - 其余 browser 方法薄委托（bind）到 browserCommands
// - browserScreencast 非薄委托：连接/页级生命周期编排
// 逐项裁剪点：
// - RuntimeBrowserCommandHost 第 6 回调 markHeadlessBrowserSessionTabActive 省略
//   （可选项；Nexus 无 headless serve / 会话标签页快照域）
// - getOffscreenBrowserBackend 恒返回 null（Nexus 无离屏后端，始终有渲染窗口路径）
// - setBrowserDriver 去掉 notifier?.browserDriverChanged 通知（mobile 配对客户端 UI 域）
// - 订阅基建未迁移 retrySubscriptionCleanupAfter（terminal.subscribe 重试域）、
//   cleanupSubscriptionsByPrefix / cleanupSubscriptionsForConnection
//   （WebSocket/mobile 断连清扫域；本地 socket 无 connectionId）
// - reclaimBrowserForDesktop / getAllBrowserDrivers 未迁移（mobile screencast 抢占 UI 域）
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { AgentBrowserBridge } from '@main/browser/agent-browser-bridge'
import { BrowserError } from '@main/browser/cdp-bridge'
import type {
  BrowserScreencastResult,
  RuntimeBrowserDriverState
} from '@shared/browser/runtime-types'
import { RuntimeBrowserCommands } from './nexus-runtime-browser'

export class NexusRuntimeService {
  private readonly runtimeId = randomUUID()
  private readonly startedAt = Date.now()
  private agentBrowserBridge: AgentBrowserBridge | null = null
  private mainWindow: BrowserWindow | null = null

  private readonly browserCommands = new RuntimeBrowserCommands({
    getAgentBrowserBridge: () => this.agentBrowserBridge,
    // worktree selector 在 Nexus 映射为 session id；CLI --worktree 直接传 session id。
    // selector 为空时 RuntimeBrowserCommands.resolveBrowserWorktreeId 提前返回 undefined，
    // 根本不会调用本回调（走 bridge 全局活跃 tab），这里只需处理显式 selector。
    resolveWorktreeSelector: async (selector: string) => {
      const id = selector.trim()
      if (!id) {
        throw new Error('无法解析空的会话选择器')
      }
      return { id }
    },
    getAuthoritativeWindow: () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        throw new Error('主窗口不可用')
      }
      return this.mainWindow
    },
    // Why: 已销毁窗口按不可用处理（getAvailableAuthoritativeWindow 语义）。
    getAvailableAuthoritativeWindow: () =>
      this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null,
    getOffscreenBrowserBackend: () => null
  })

  // ── 订阅/驱动基建 ──
  private subscriptionCleanups = new Map<string, () => void | Promise<void>>()
  private subscriptionCleanupPromises = new Map<
    string,
    { cleanup: () => void | Promise<void>; promise: Promise<void> }
  >()
  // Why: index of subscriptionIds by per-WebSocket connectionId so the
  // server can sweep all subscriptions for a closing socket without
  // touching subscriptions on other live sockets that share the same
  // deviceToken (multi-screen mobile).
  private subscriptionsByConnection = new Map<string, Set<string>>()
  private subscriptionConnectionByEntry = new Map<string, string>()
  private activeBrowserScreencastsByConnection = new Map<
    string,
    { cancel: (emitEnd?: boolean) => void; done: Promise<void>; connectionKey: string }
  >()
  private activeBrowserScreencastsByPage = new Map<
    string,
    { cancel: (emitEnd?: boolean) => void; done: Promise<void>; connectionKey: string }
  >()
  private currentBrowserDriver = new Map<string, RuntimeBrowserDriverState>()

  // ── Browser automation（薄委托）──

  browserSnapshot: RuntimeBrowserCommands['browserSnapshot'] =
    this.browserCommands.browserSnapshot.bind(this.browserCommands)

  browserClick: RuntimeBrowserCommands['browserClick'] = this.browserCommands.browserClick.bind(
    this.browserCommands
  )

  browserGoto: RuntimeBrowserCommands['browserGoto'] = this.browserCommands.browserGoto.bind(
    this.browserCommands
  )

  browserFill: RuntimeBrowserCommands['browserFill'] = this.browserCommands.browserFill.bind(
    this.browserCommands
  )

  browserType: RuntimeBrowserCommands['browserType'] = this.browserCommands.browserType.bind(
    this.browserCommands
  )

  browserSelect: RuntimeBrowserCommands['browserSelect'] = this.browserCommands.browserSelect.bind(
    this.browserCommands
  )

  browserScroll: RuntimeBrowserCommands['browserScroll'] = this.browserCommands.browserScroll.bind(
    this.browserCommands
  )

  browserBack: RuntimeBrowserCommands['browserBack'] = this.browserCommands.browserBack.bind(
    this.browserCommands
  )

  browserReload: RuntimeBrowserCommands['browserReload'] = this.browserCommands.browserReload.bind(
    this.browserCommands
  )

  browserScreenshot: RuntimeBrowserCommands['browserScreenshot'] =
    this.browserCommands.browserScreenshot.bind(this.browserCommands)

  async browserScreencast(
    params: Parameters<RuntimeBrowserCommands['browserScreencast']>[0],
    options: {
      connectionId?: string
      sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
      signal?: AbortSignal
      emit: (result: BrowserScreencastResult) => void
    }
  ): Promise<void> {
    if (!options.sendBinary) {
      throw new BrowserError(
        'browser_error',
        'Browser screencast requires a binary streaming transport.'
      )
    }

    const connectionKey = options.connectionId ?? 'local'
    const requestedPageId = typeof params.page === 'string' ? params.page : null
    let existingPageStream = requestedPageId
      ? this.activeBrowserScreencastsByPage.get(requestedPageId)
      : undefined
    while (existingPageStream) {
      // Why: CDP allows only one screencast per page; cancel a stale stream so the next tab activation isn't stuck on an already-active error or old viewport.
      existingPageStream.cancel(existingPageStream.connectionKey !== connectionKey)
      await existingPageStream.done
      existingPageStream = requestedPageId
        ? this.activeBrowserScreencastsByPage.get(requestedPageId)
        : undefined
    }
    let existingStream = this.activeBrowserScreencastsByConnection.get(connectionKey)
    while (existingStream) {
      existingStream.cancel()
      await existingStream.done
      existingStream = this.activeBrowserScreencastsByConnection.get(connectionKey)
    }
    if (options.signal?.aborted) {
      throw new BrowserError('browser_error', 'Browser screencast was cancelled.')
    }

    let screencast: Awaited<ReturnType<RuntimeBrowserCommands['browserScreencast']>> | null = null
    let registeredSubscriptionId: string | null = null
    let activeBrowserPageId: string | null = null
    let ended = false
    let cancelledBeforeStart = false
    let readyEmitted = false
    let resolveActiveDone!: () => void
    const activeDone = new Promise<void>((resolve) => {
      resolveActiveDone = resolve
    })
    const end = (emitEnd: boolean): void => {
      if (ended) {
        return
      }
      ended = true
      screencast?.session.stop()
      if (emitEnd && screencast) {
        options.emit({ type: 'end', subscriptionId: screencast.subscriptionId })
      }
    }
    const cancel = (emitEnd = false): void => {
      if (!screencast) {
        cancelledBeforeStart = true
        return
      }
      end(emitEnd)
    }
    const abortScreencast = (): void => cancel()
    const sendBinaryAfterReady = (bytes: Uint8Array<ArrayBufferLike>): boolean | void => {
      if (!readyEmitted) {
        // Why: clients learn the owning subscription from ready, so CDP frames must stay unacked until the JSON ready event is delivered.
        return false
      }
      return options.sendBinary?.(bytes)
    }

    // Why: a phone can rotate before the first stream reaches ready (no subscriptionId yet), so a same-socket replacement cancels and waits here instead of racing.
    this.activeBrowserScreencastsByConnection.set(connectionKey, {
      cancel,
      done: activeDone,
      connectionKey
    })
    options.signal?.addEventListener('abort', abortScreencast, { once: true })
    try {
      screencast = await this.browserCommands.browserScreencast(params, {
        sendBinary: sendBinaryAfterReady,
        emit: options.emit
      })
      if (cancelledBeforeStart || options.signal?.aborted) {
        end(false)
        await screencast.session.done
        return
      }
      activeBrowserPageId = screencast.ready.browserPageId
      this.activeBrowserScreencastsByPage.set(activeBrowserPageId, {
        cancel,
        done: activeDone,
        connectionKey
      })
      this.setBrowserDriver(activeBrowserPageId, { kind: 'mobile', clientId: connectionKey })

      // Why: screencast frames are connection-scoped; tie Page.stopScreencast to the exact socket so dropped connections don't leave Chromium streaming.
      this.registerSubscriptionCleanup(
        screencast.subscriptionId,
        () => end(true),
        options.connectionId
      )
      registeredSubscriptionId = screencast.subscriptionId
      options.emit(screencast.ready)
      readyEmitted = true
      await screencast.session.done
      end(true)
      this.cleanupSubscription(screencast.subscriptionId)
    } finally {
      options.signal?.removeEventListener('abort', abortScreencast)
      if (!ended) {
        end(false)
      }
      if (registeredSubscriptionId) {
        this.cleanupSubscription(registeredSubscriptionId)
      }
      const active = this.activeBrowserScreencastsByConnection.get(connectionKey)
      if (active?.done === activeDone) {
        this.activeBrowserScreencastsByConnection.delete(connectionKey)
      }
      if (activeBrowserPageId) {
        const activePageStream = this.activeBrowserScreencastsByPage.get(activeBrowserPageId)
        if (activePageStream?.done === activeDone) {
          this.activeBrowserScreencastsByPage.delete(activeBrowserPageId)
        }
        const driver = this.getBrowserDriver(activeBrowserPageId)
        if (driver.kind === 'mobile' && driver.clientId === connectionKey) {
          this.setBrowserDriver(activeBrowserPageId, { kind: 'idle' })
        }
      }
      resolveActiveDone()
    }
  }

  browserEval: RuntimeBrowserCommands['browserEval'] = this.browserCommands.browserEval.bind(
    this.browserCommands
  )

  browserTabList: RuntimeBrowserCommands['browserTabList'] =
    this.browserCommands.browserTabList.bind(this.browserCommands)
  browserProceedCertificate: RuntimeBrowserCommands['browserProceedCertificate'] =
    this.browserCommands.browserProceedCertificate.bind(this.browserCommands)

  browserTabShow: RuntimeBrowserCommands['browserTabShow'] =
    this.browserCommands.browserTabShow.bind(this.browserCommands)

  browserTabCurrent: RuntimeBrowserCommands['browserTabCurrent'] =
    this.browserCommands.browserTabCurrent.bind(this.browserCommands)

  browserTabSwitch: RuntimeBrowserCommands['browserTabSwitch'] =
    this.browserCommands.browserTabSwitch.bind(this.browserCommands)

  browserHover: RuntimeBrowserCommands['browserHover'] = this.browserCommands.browserHover.bind(
    this.browserCommands
  )

  browserDrag: RuntimeBrowserCommands['browserDrag'] = this.browserCommands.browserDrag.bind(
    this.browserCommands
  )

  browserUpload: RuntimeBrowserCommands['browserUpload'] = this.browserCommands.browserUpload.bind(
    this.browserCommands
  )

  browserWait: RuntimeBrowserCommands['browserWait'] = this.browserCommands.browserWait.bind(
    this.browserCommands
  )

  browserCheck: RuntimeBrowserCommands['browserCheck'] = this.browserCommands.browserCheck.bind(
    this.browserCommands
  )

  browserFocus: RuntimeBrowserCommands['browserFocus'] = this.browserCommands.browserFocus.bind(
    this.browserCommands
  )

  browserClear: RuntimeBrowserCommands['browserClear'] = this.browserCommands.browserClear.bind(
    this.browserCommands
  )

  browserSelectAll: RuntimeBrowserCommands['browserSelectAll'] =
    this.browserCommands.browserSelectAll.bind(this.browserCommands)

  browserKeypress: RuntimeBrowserCommands['browserKeypress'] =
    this.browserCommands.browserKeypress.bind(this.browserCommands)

  browserPdf: RuntimeBrowserCommands['browserPdf'] = this.browserCommands.browserPdf.bind(
    this.browserCommands
  )

  browserFullScreenshot: RuntimeBrowserCommands['browserFullScreenshot'] =
    this.browserCommands.browserFullScreenshot.bind(this.browserCommands)

  browserCookieGet: RuntimeBrowserCommands['browserCookieGet'] =
    this.browserCommands.browserCookieGet.bind(this.browserCommands)

  browserCookieSet: RuntimeBrowserCommands['browserCookieSet'] =
    this.browserCommands.browserCookieSet.bind(this.browserCommands)

  browserCookieDelete: RuntimeBrowserCommands['browserCookieDelete'] =
    this.browserCommands.browserCookieDelete.bind(this.browserCommands)

  browserSetViewport: RuntimeBrowserCommands['browserSetViewport'] =
    this.browserCommands.browserSetViewport.bind(this.browserCommands)

  browserSetGeolocation: RuntimeBrowserCommands['browserSetGeolocation'] =
    this.browserCommands.browserSetGeolocation.bind(this.browserCommands)

  browserInterceptEnable: RuntimeBrowserCommands['browserInterceptEnable'] =
    this.browserCommands.browserInterceptEnable.bind(this.browserCommands)

  browserInterceptDisable: RuntimeBrowserCommands['browserInterceptDisable'] =
    this.browserCommands.browserInterceptDisable.bind(this.browserCommands)

  browserInterceptList: RuntimeBrowserCommands['browserInterceptList'] =
    this.browserCommands.browserInterceptList.bind(this.browserCommands)

  browserCaptureStart: RuntimeBrowserCommands['browserCaptureStart'] =
    this.browserCommands.browserCaptureStart.bind(this.browserCommands)

  browserCaptureStop: RuntimeBrowserCommands['browserCaptureStop'] =
    this.browserCommands.browserCaptureStop.bind(this.browserCommands)

  browserConsoleLog: RuntimeBrowserCommands['browserConsoleLog'] =
    this.browserCommands.browserConsoleLog.bind(this.browserCommands)

  browserNetworkLog: RuntimeBrowserCommands['browserNetworkLog'] =
    this.browserCommands.browserNetworkLog.bind(this.browserCommands)

  browserDblclick: RuntimeBrowserCommands['browserDblclick'] =
    this.browserCommands.browserDblclick.bind(this.browserCommands)

  browserForward: RuntimeBrowserCommands['browserForward'] =
    this.browserCommands.browserForward.bind(this.browserCommands)

  browserScrollIntoView: RuntimeBrowserCommands['browserScrollIntoView'] =
    this.browserCommands.browserScrollIntoView.bind(this.browserCommands)

  browserGet: RuntimeBrowserCommands['browserGet'] = this.browserCommands.browserGet.bind(
    this.browserCommands
  )

  browserIs: RuntimeBrowserCommands['browserIs'] = this.browserCommands.browserIs.bind(
    this.browserCommands
  )

  browserKeyboardInsertText: RuntimeBrowserCommands['browserKeyboardInsertText'] =
    this.browserCommands.browserKeyboardInsertText.bind(this.browserCommands)

  browserMouseMove: RuntimeBrowserCommands['browserMouseMove'] =
    this.browserCommands.browserMouseMove.bind(this.browserCommands)

  browserMouseDown: RuntimeBrowserCommands['browserMouseDown'] =
    this.browserCommands.browserMouseDown.bind(this.browserCommands)

  browserMouseClick: RuntimeBrowserCommands['browserMouseClick'] =
    this.browserCommands.browserMouseClick.bind(this.browserCommands)

  browserMouseUp: RuntimeBrowserCommands['browserMouseUp'] =
    this.browserCommands.browserMouseUp.bind(this.browserCommands)

  browserMouseWheel: RuntimeBrowserCommands['browserMouseWheel'] =
    this.browserCommands.browserMouseWheel.bind(this.browserCommands)

  browserFind: RuntimeBrowserCommands['browserFind'] = this.browserCommands.browserFind.bind(
    this.browserCommands
  )

  browserSetDevice: RuntimeBrowserCommands['browserSetDevice'] =
    this.browserCommands.browserSetDevice.bind(this.browserCommands)

  browserSetOffline: RuntimeBrowserCommands['browserSetOffline'] =
    this.browserCommands.browserSetOffline.bind(this.browserCommands)

  browserSetHeaders: RuntimeBrowserCommands['browserSetHeaders'] =
    this.browserCommands.browserSetHeaders.bind(this.browserCommands)

  browserSetCredentials: RuntimeBrowserCommands['browserSetCredentials'] =
    this.browserCommands.browserSetCredentials.bind(this.browserCommands)

  browserSetMedia: RuntimeBrowserCommands['browserSetMedia'] =
    this.browserCommands.browserSetMedia.bind(this.browserCommands)

  browserClipboardRead: RuntimeBrowserCommands['browserClipboardRead'] =
    this.browserCommands.browserClipboardRead.bind(this.browserCommands)

  browserClipboardWrite: RuntimeBrowserCommands['browserClipboardWrite'] =
    this.browserCommands.browserClipboardWrite.bind(this.browserCommands)

  browserDialogAccept: RuntimeBrowserCommands['browserDialogAccept'] =
    this.browserCommands.browserDialogAccept.bind(this.browserCommands)

  browserDialogDismiss: RuntimeBrowserCommands['browserDialogDismiss'] =
    this.browserCommands.browserDialogDismiss.bind(this.browserCommands)

  browserStorageLocalGet: RuntimeBrowserCommands['browserStorageLocalGet'] =
    this.browserCommands.browserStorageLocalGet.bind(this.browserCommands)

  browserStorageLocalSet: RuntimeBrowserCommands['browserStorageLocalSet'] =
    this.browserCommands.browserStorageLocalSet.bind(this.browserCommands)

  browserStorageLocalClear: RuntimeBrowserCommands['browserStorageLocalClear'] =
    this.browserCommands.browserStorageLocalClear.bind(this.browserCommands)

  browserStorageSessionGet: RuntimeBrowserCommands['browserStorageSessionGet'] =
    this.browserCommands.browserStorageSessionGet.bind(this.browserCommands)

  browserStorageSessionSet: RuntimeBrowserCommands['browserStorageSessionSet'] =
    this.browserCommands.browserStorageSessionSet.bind(this.browserCommands)

  browserStorageSessionClear: RuntimeBrowserCommands['browserStorageSessionClear'] =
    this.browserCommands.browserStorageSessionClear.bind(this.browserCommands)

  browserDownload: RuntimeBrowserCommands['browserDownload'] =
    this.browserCommands.browserDownload.bind(this.browserCommands)

  browserHighlight: RuntimeBrowserCommands['browserHighlight'] =
    this.browserCommands.browserHighlight.bind(this.browserCommands)

  browserExec: RuntimeBrowserCommands['browserExec'] = this.browserCommands.browserExec.bind(
    this.browserCommands
  )

  browserTabCreate: RuntimeBrowserCommands['browserTabCreate'] =
    this.browserCommands.browserTabCreate.bind(this.browserCommands)

  browserTabSetProfile: RuntimeBrowserCommands['browserTabSetProfile'] =
    this.browserCommands.browserTabSetProfile.bind(this.browserCommands)

  browserTabProfileShow: RuntimeBrowserCommands['browserTabProfileShow'] =
    this.browserCommands.browserTabProfileShow.bind(this.browserCommands)

  browserTabProfileClone: RuntimeBrowserCommands['browserTabProfileClone'] =
    this.browserCommands.browserTabProfileClone.bind(this.browserCommands)

  browserProfileList: RuntimeBrowserCommands['browserProfileList'] =
    this.browserCommands.browserProfileList.bind(this.browserCommands)

  browserProfileCreate: RuntimeBrowserCommands['browserProfileCreate'] =
    this.browserCommands.browserProfileCreate.bind(this.browserCommands)

  browserProfileDelete: RuntimeBrowserCommands['browserProfileDelete'] =
    this.browserCommands.browserProfileDelete.bind(this.browserCommands)

  browserProfileDetectBrowsers: RuntimeBrowserCommands['browserProfileDetectBrowsers'] =
    this.browserCommands.browserProfileDetectBrowsers.bind(this.browserCommands)

  browserProfileImportFromBrowser: RuntimeBrowserCommands['browserProfileImportFromBrowser'] =
    this.browserCommands.browserProfileImportFromBrowser.bind(this.browserCommands)

  browserProfileClearDefaultCookies: RuntimeBrowserCommands['browserProfileClearDefaultCookies'] =
    this.browserCommands.browserProfileClearDefaultCookies.bind(this.browserCommands)

  browserTabClose: RuntimeBrowserCommands['browserTabClose'] =
    this.browserCommands.browserTabClose.bind(this.browserCommands)

  // ── 宿主装配 ──

  setAgentBrowserBridge(bridge: AgentBrowserBridge | null): void {
    this.agentBrowserBridge = bridge
  }

  getAgentBrowserBridge(): AgentBrowserBridge | null {
    return this.agentBrowserBridge
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  getRuntimeId(): string {
    return this.runtimeId
  }

  getStartedAt(): number {
    return this.startedAt
  }

  // ── 订阅基建 ──

  registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void | Promise<void>,
    connectionId?: string
  ): void {
    // Why: mobile clients reconnect frequently (phone lock, network switch).
    // The RPC client re-sends terminal.subscribe on reconnect, creating a new
    // handler before the old one is cleaned up. Without this, the old data
    // listener leaks in dataListeners and duplicates every PTY data event.
    const existing = this.subscriptionCleanups.get(subscriptionId)
    if (existing) {
      // Why: the stable id is about to belong to a newer connection; detach
      // the old owner before its asynchronous cleanup can overlap the rebind.
      this.removeSubscriptionConnectionIndex(subscriptionId)
      this.cleanupSubscription(subscriptionId)
    }
    this.subscriptionCleanups.set(subscriptionId, cleanup)
    if (connectionId) {
      let set = this.subscriptionsByConnection.get(connectionId)
      if (!set) {
        set = new Set()
        this.subscriptionsByConnection.set(connectionId, set)
      }
      set.add(subscriptionId)
      this.subscriptionConnectionByEntry.set(subscriptionId, connectionId)
    }
  }

  cleanupSubscription(subscriptionId: string): void {
    void this.cleanupSubscriptionAndWait(subscriptionId).catch((error) => {
      console.error(`[runtime] subscription cleanup failed for ${subscriptionId}:`, error)
    })
  }

  async cleanupSubscriptionAndWait(subscriptionId: string): Promise<void> {
    const cleanup = this.subscriptionCleanups.get(subscriptionId)
    if (!cleanup) {
      return
    }
    const inFlight = this.subscriptionCleanupPromises.get(subscriptionId)
    if (inFlight?.cleanup === cleanup) {
      return inFlight.promise
    }
    let cleanupResult: void | Promise<void>
    try {
      cleanupResult = cleanup()
    } catch (error) {
      cleanupResult = Promise.reject(error)
    }
    const promise = Promise.resolve(cleanupResult)
      .then(() => {
        // Why: a reconnect can replace this id while old async cleanup runs;
        // only the generation that registered this callback may remove it.
        if (this.subscriptionCleanups.get(subscriptionId) !== cleanup) {
          return
        }
        this.subscriptionCleanups.delete(subscriptionId)
        this.removeSubscriptionConnectionIndex(subscriptionId)
      })
      .finally(() => {
        if (this.subscriptionCleanupPromises.get(subscriptionId)?.promise === promise) {
          this.subscriptionCleanupPromises.delete(subscriptionId)
        }
      })
    this.subscriptionCleanupPromises.set(subscriptionId, { cleanup, promise })
    return promise
  }

  private removeSubscriptionConnectionIndex(subscriptionId: string): void {
    const connectionId = this.subscriptionConnectionByEntry.get(subscriptionId)
    if (connectionId) {
      this.subscriptionConnectionByEntry.delete(subscriptionId)
      const set = this.subscriptionsByConnection.get(connectionId)
      if (set) {
        set.delete(subscriptionId)
        if (set.size === 0) {
          this.subscriptionsByConnection.delete(connectionId)
        }
      }
    }
  }

  // ── 浏览器驱动状态 ──

  private getBrowserDriver(browserPageId: string): RuntimeBrowserDriverState {
    return this.currentBrowserDriver.get(browserPageId) ?? { kind: 'idle' }
  }

  private setBrowserDriver(browserPageId: string, next: RuntimeBrowserDriverState): void {
    const prev = this.getBrowserDriver(browserPageId)
    if (prev.kind === next.kind) {
      if (prev.kind === 'mobile' && next.kind === 'mobile' && prev.clientId === next.clientId) {
        return
      }
      if (prev.kind !== 'mobile' && next.kind !== 'mobile') {
        return
      }
    }
    if (next.kind === 'idle') {
      this.currentBrowserDriver.delete(browserPageId)
    } else {
      this.currentBrowserDriver.set(browserPageId, next)
    }
    // Why: 此处未通知 browserDriverChanged（mobile 配对客户端 UI 域未迁移）。
  }
}
