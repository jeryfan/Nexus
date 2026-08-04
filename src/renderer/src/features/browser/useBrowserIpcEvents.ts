// app 层浏览器 IPC 事件接入独立 browser store。
// CLI/agent → 主进程 RuntimeBrowserCommands → browser:requestTab{Create,
// SetProfile,Close} 的 request/reply 链路依赖本 hook 的 reply；guest 快捷键转发
// （onFocusBrowserAddressBar/onFindInBrowserPage/onReloadBrowserPage/onHardReloadBrowserPage/
// onBrowserHistoryNavigate/onZoomBrowserPage/onGrabModeToggle/onGrabActionShortcut）由
// pane/BrowserPane 内部自行订阅，不在此处。
// 裁剪: isRuntimeEnvironmentActive 远程分支（Nexus 恒本地路径）、floating
// workspace panel 分支、unifiedTabsByWorktree/targetGroupId 分组定位（Nexus 面板无分组，
// openTab 总是激活）、pinned tab 关闭确认（Nexus 无 pinned 标签）、
// requestBackgroundTerminalWorktreeMount（终端后台挂载体系）。
import { useEffect } from 'react'
import type { BrowserCertificateFailure } from '@shared/browser/types'
import { useBrowserStore, type BrowserState } from '@renderer/stores/browser'
import { translate } from './i18n'
import {
  acquireBrowserAutomationVisibility,
  releaseBrowserAutomationVisibility
} from './pane/browser-automation-visibility'
import { destroyPersistentWebview } from './pane/webview-registry'
import { BROWSER_SETTINGS_DEFAULTS } from './settings-defaults'

// ---------------------------------------------------------------------------
// Browser automation bootstrap lease
// ---------------------------------------------------------------------------

const BROWSER_AUTOMATION_BOOTSTRAP_LEASE_MS = 10_000
const browserAutomationBootstrapLeaseByPageId = new Map<string, { token: string; timer: number }>()

function releaseBrowserAutomationBootstrapLease(browserPageId: string): void {
  const existing = browserAutomationBootstrapLeaseByPageId.get(browserPageId)
  if (!existing) {
    return
  }
  window.clearTimeout(existing.timer)
  releaseBrowserAutomationVisibility(existing.token)
  browserAutomationBootstrapLeaseByPageId.delete(browserPageId)
}

function findBrowserPageWorktreeId(
  store: Pick<BrowserState, 'browserTabsByWorktree' | 'browserPagesByWorkspace'>,
  browserPageId: string
): string | null {
  for (const [worktreeId, browserTabs] of Object.entries(store.browserTabsByWorktree)) {
    for (const workspace of browserTabs) {
      if (
        workspace.id === browserPageId ||
        workspace.activePageId === browserPageId ||
        workspace.pageIds?.includes(browserPageId)
      ) {
        return worktreeId
      }
    }
  }

  for (const pages of Object.values(store.browserPagesByWorkspace)) {
    const page = pages.find((candidate) => candidate.id === browserPageId)
    if (page) {
      return page.worktreeId
    }
  }

  return null
}

// Why: webviews start their guest only when shown; CLI/agent 建 tab 走后台路径时，
// 短暂可见性租约让 pane 挂载 webview（registerGuest 相关链路），10s 后自动释放。
function acquireBrowserAutomationBootstrapLease(
  worktreeId: string | null | undefined,
  browserPageId?: string | null
): void {
  const store = useBrowserStore.getState()
  const targetWorktreeId =
    worktreeId ??
    (browserPageId ? findBrowserPageWorktreeId(store, browserPageId) : null) ??
    store.activeWorktreeId
  if (!targetWorktreeId) {
    return
  }
  // 裁剪: requestBackgroundTerminalWorktreeMount（终端后台挂载体系）。
  let targetBrowserPageId = browserPageId ?? null
  if (!targetBrowserPageId) {
    const browserTabs = store.browserTabsByWorktree[targetWorktreeId] ?? []
    const activeWorkspaceId = store.activeBrowserTabIdByWorktree[targetWorktreeId] ?? null
    const workspace =
      browserTabs.find((tab) => tab.id === activeWorkspaceId) ?? browserTabs[0] ?? null
    targetBrowserPageId =
      workspace?.activePageId ?? workspace?.pageIds?.[0] ?? workspace?.id ?? null
  }
  if (!targetBrowserPageId) {
    return
  }

  releaseBrowserAutomationBootstrapLease(targetBrowserPageId)
  const token = acquireBrowserAutomationVisibility(targetBrowserPageId)
  const timer = window.setTimeout(() => {
    releaseBrowserAutomationBootstrapLease(targetBrowserPageId)
  }, BROWSER_AUTOMATION_BOOTSTRAP_LEASE_MS)
  browserAutomationBootstrapLeaseByPageId.set(targetBrowserPageId, { token, timer })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBrowserIpcEvents(): void {
  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(
      window.api.browser.onGuestLoadFailed(({ browserPageId, loadError }) => {
        // 裁剪: isRuntimeEnvironmentActive 远程分支（Nexus 恒本地路径）。
        useBrowserStore.getState().updateBrowserPageState(browserPageId, {
          loading: false,
          loadError,
          canGoBack: false,
          canGoForward: false
        })
      })
    )

    unsubs.push(
      window.api.browser.onCertificateFailureChanged(
        ({
          browserPageId,
          failure
        }: {
          browserPageId: string
          failure: BrowserCertificateFailure | null
        }) => {
          // 裁剪: isRuntimeEnvironmentActive 远程分支。
          useBrowserStore.getState().setBrowserPageCertificateFailure(browserPageId, failure)
        }
      )
    )

    // Why: agent-browser navigates via CDP so did-navigate never fires; this IPC pushes live URL/title to the stale store.
    unsubs.push(
      window.api.browser.onNavigationUpdate(({ browserPageId, url, title }) => {
        // 裁剪: isRuntimeEnvironmentActive 远程分支。
        const store = useBrowserStore.getState()
        store.setBrowserPageUrl(browserPageId, url)
        store.updateBrowserPageState(browserPageId, { title, loading: false })
      })
    )

    // Why: webviews start their guest only when shown; sent pre-automation so hidden tabs mount without moving the active pane.
    unsubs.push(
      window.api.browser.onActivateView(({ worktreeId, browserPageId }) => {
        // 裁剪: isRuntimeEnvironmentActive 远程分支。
        acquireBrowserAutomationBootstrapLease(worktreeId, browserPageId)
      })
    )

    // Why: `nexus tab switch --focus` must NOT call setActiveWorktree — a global focus from one agent's parallel-worktree switch would steal the user's view.
    // focusBrowserTabInWorktree updates per-worktree state in place; globals flip only when the user is already on the targeted worktree.
    unsubs.push(
      window.api.browser.onPaneFocus(({ worktreeId, browserPageId }) => {
        // 裁剪: isRuntimeEnvironmentActive 远程分支。
        const store = useBrowserStore.getState()
        // Why: worktreeId is null if the tab closed mid-switch; the activeWorktreeId fallback makes the focus call a safe no-op for a stale page id.
        const targetWt = worktreeId ?? store.activeWorktreeId
        if (!targetWt) {
          return
        }
        store.focusBrowserTabInWorktree(targetWt, browserPageId)
      })
    )

    unsubs.push(
      window.api.browser.onOpenLinkInNexusTab(({ browserPageId, url }) => {
        const store = useBrowserStore.getState()
        const sourcePage = Object.values(store.browserPagesByWorkspace)
          .flat()
          .find((page) => page.id === browserPageId)
        if (!sourcePage) {
          return
        }
        // 裁剪: getRuntimeEnvironmentIdForWorktree 远程分支（Nexus 恒本地）。
        // Why: only the renderer owns the tab model, so main delegates link-open here.
        store.createBrowserTab(sourcePage.worktreeId, url, { title: url })
      })
    )

    // Why: embedded browser guests capture keyboard focus and bypass window-level keydown, so shortcuts are forwarded via IPC.
    unsubs.push(
      window.api.ui.onNewBrowserTab(() => {
        const store = useBrowserStore.getState()
        // 裁剪: floating workspace panel 分支与远程 runtime（web session）分支。
        const worktreeId = store.activeWorktreeId
        if (worktreeId) {
          // Glue for Nexus: state.browserDefaultUrl（GlobalSettings）→ BROWSER_SETTINGS_DEFAULTS。
          store.createBrowserTab(
            worktreeId,
            BROWSER_SETTINGS_DEFAULTS.browserDefaultUrl ?? 'about:blank',
            {
              title: translate('auto.hooks.useIpcEvents.f6300deb8b', 'New Browser Tab'),
              focusAddressBar: true
            }
          )
        }
      })
    )

    unsubs.push(
      window.api.ui.onRequestTabCreate((data) => {
        try {
          // 裁剪: isRuntimeEnvironmentActive 远程分支（Nexus 恒本地路径）。
          const store = useBrowserStore.getState()
          const worktreeId = data.worktreeId ?? store.activeWorktreeId
          if (!worktreeId) {
            window.api.ui.replyTabCreate({
              requestId: data.requestId,
              error: translate('auto.hooks.useIpcEvents.f000b2ff76', 'No active worktree')
            })
            return
          }
          // 裁剪: unifiedTabsByWorktree 活跃浏览器分组定位（targetGroupId）——
          // Nexus 面板无分组概念，createBrowserTab 尾部 panelBridge.openBrowserTab 总是激活。
          // Why: a user-initiated open (data.activate) vs agent/automation opens keeps the original semantics at slice level.
          const workspace = store.createBrowserTab(worktreeId, data.url, {
            title: data.url,
            sessionProfileId: data.sessionProfileId,
            sessionPartition: data.sessionPartition,
            activate: data.activate === true
          })
          // Why: registerGuest fires with the page ID, not the workspace ID; return it so waitForTabRegistration can correlate.
          const pages = useBrowserStore.getState().browserPagesByWorkspace[workspace.id] ?? []
          const browserPageId = pages[0]?.id ?? workspace.id
          acquireBrowserAutomationBootstrapLease(worktreeId, browserPageId)
          window.api.ui.replyTabCreate({ requestId: data.requestId, browserPageId })
        } catch (err) {
          window.api.ui.replyTabCreate({
            requestId: data.requestId,
            error: err instanceof Error ? err.message : 'Tab creation failed'
          })
        }
      })
    )

    unsubs.push(
      window.api.ui.onRequestTabSetProfile((data) => {
        try {
          // 裁剪: isRuntimeEnvironmentActive 远程分支。
          const store = useBrowserStore.getState()
          const owningWorkspace = Object.values(store.browserTabsByWorktree)
            .flat()
            .find((workspace) => {
              if (workspace.id === data.browserPageId) {
                return true
              }
              const pages = store.browserPagesByWorkspace[workspace.id] ?? []
              return pages.some((page) => page.id === data.browserPageId)
            })
          if (!owningWorkspace) {
            window.api.ui.replyTabSetProfile({
              requestId: data.requestId,
              error: translate(
                'auto.hooks.useIpcEvents.0e3cf53060',
                'Browser tab {{value0}} not found',
                { value0: data.browserPageId }
              )
            })
            return
          }
          // Why: a workspace may host several browser pages; profile switch must tear down all sibling webviews, not just the IPC's.
          const workspacePages = store.browserPagesByWorkspace[owningWorkspace.id] ?? []
          if (workspacePages.length > 0) {
            for (const page of workspacePages) {
              destroyPersistentWebview(page.id)
            }
          } else {
            destroyPersistentWebview(data.browserPageId)
          }
          store.switchBrowserTabProfile(owningWorkspace.id, data.profileId, data.sessionPartition)
          window.api.ui.replyTabSetProfile({ requestId: data.requestId })
        } catch (err) {
          window.api.ui.replyTabSetProfile({
            requestId: data.requestId,
            error: err instanceof Error ? err.message : 'Tab profile update failed'
          })
        }
      })
    )

    unsubs.push(
      window.api.ui.onRequestTabClose((data) => {
        try {
          // 裁剪: isRuntimeEnvironmentActive 远程分支；pinned tab 关闭确认
          // （guardPinnedTabClose/isPinnedSessionTab/resolvePinnedTabLabel——依赖
          // unifiedTabs isPinned 与确认弹窗体系，Nexus 无 pinned 标签，关闭直通）。
          const store = useBrowserStore.getState()
          const explicitTargetId = data.tabId ?? null
          const tabToClose =
            explicitTargetId ??
            (data.worktreeId
              ? (store.activeBrowserTabIdByWorktree?.[data.worktreeId] ?? null)
              : store.activeBrowserTabId)
          if (!tabToClose) {
            window.api.ui.replyTabClose({
              requestId: data.requestId,
              error: translate(
                'auto.hooks.useIpcEvents.a8d2bf8e9e',
                'No active browser tab to close'
              )
            })
            return
          }
          // Why: the bridge keys tabs by browserPageId, but closeBrowserTab expects a workspace id.
          // Per the CLI's `tab close --page` contract, close only that page unless it is the last in its workspace.
          const isWorkspaceId = Object.values(store.browserTabsByWorktree)
            .flat()
            .some((ws) => ws.id === tabToClose)
          if (!isWorkspaceId) {
            const owningWorkspace = Object.entries(store.browserPagesByWorkspace).find(
              ([, pages]) => pages.some((p) => p.id === tabToClose)
            )
            if (owningWorkspace) {
              const [workspaceId, pages] = owningWorkspace
              if (pages.length <= 1) {
                useBrowserStore.getState().closeBrowserTab(workspaceId)
              } else {
                useBrowserStore.getState().closeBrowserPage(tabToClose)
              }
              window.api.ui.replyTabClose({ requestId: data.requestId })
              return
            }
          }
          if (isWorkspaceId) {
            useBrowserStore.getState().closeBrowserTab(tabToClose)
            window.api.ui.replyTabClose({ requestId: data.requestId })
            return
          }
          if (explicitTargetId) {
            window.api.ui.replyTabClose({
              requestId: data.requestId,
              error: translate(
                'auto.hooks.useIpcEvents.0e3cf53060',
                'Browser tab {{value0}} not found',
                { value0: explicitTargetId }
              )
            })
            return
          }
          useBrowserStore.getState().closeBrowserTab(tabToClose)
          window.api.ui.replyTabClose({ requestId: data.requestId })
        } catch (err) {
          window.api.ui.replyTabClose({
            requestId: data.requestId,
            error: err instanceof Error ? err.message : 'Tab close failed'
          })
        }
      })
    )

    return () => {
      for (const unsubscribe of unsubs) {
        unsubscribe()
      }
    }
  }, [])
}
