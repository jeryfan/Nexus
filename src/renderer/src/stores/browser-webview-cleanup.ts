// Glue for Nexus: import 指向迁移后的 pane 目录（webview-registry / browser-page-zoom 随 Task 9 前置落位）。
import type { BrowserPage, BrowserWorkspace } from '@shared/browser/types'
import { isBrowserAutomationVisible } from '../features/browser/pane/browser-automation-visibility'
import { hasActiveBrowserPageDownload } from '../features/browser/pane/browser-page-download-activity'
import {
  selectBrowserGuestEvictionWorktreeIds,
  touchBrowserGuestWorktreeRecency,
  worktreeHoldsLiveBrowserGuests
} from '../features/browser/pane/browser-guest-worktree-retention'
import {
  destroyPersistentWebview,
  hasLiveBrowserGuest,
  moveFocusToRendererBeforeFocusedWebviewHidden
} from '../features/browser/pane/webview-registry'
import {
  getExplicitBrowserPageZoomLevel,
  rememberExplicitBrowserPageZoomLevel
} from '../features/browser/pane/browser-page-zoom'

export { moveFocusToRendererBeforeFocusedWebviewHidden }

export function destroyRemovedBrowserWebview(browserPageId: string): void {
  destroyPersistentWebview(browserPageId)
}

export function collectBrowserWebviewIds(
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>,
  browserPagesByWorkspace: Record<string, BrowserPage[]>
): Set<string> {
  const ids = new Set<string>()
  for (const pages of Object.values(browserPagesByWorkspace)) {
    for (const page of pages) {
      ids.add(page.id)
    }
  }

  for (const tabs of Object.values(browserTabsByWorktree)) {
    for (const tab of tabs) {
      if ((browserPagesByWorkspace[tab.id] ?? []).length === 0) {
        ids.add(tab.id)
      }
    }
  }
  return ids
}

// Why: guest-budget eviction destroys every guest a hidden worktree retains
// while its tabs/pages stay in the store, so a revisit rebuilds from state.
// Eviction is not a user close — the tab stays in the UI, so the user's zoom
// is re-remembered past the destroy-path forget: the revisit reasserts it
// instead of writing the default through Chromium's partition-wide HostZoomMap
// (which would also reset same-host sibling tabs).
export function destroyWorktreeBrowserGuests(
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>,
  browserPagesByWorkspace: Record<string, BrowserPage[]>,
  worktreeId: string
): void {
  for (const tab of browserTabsByWorktree[worktreeId] ?? []) {
    const pages = browserPagesByWorkspace[tab.id] ?? []
    // Legacy sessions persisted before pages existed key their webview by the
    // workspace tab id (same fallback as collectBrowserWebviewIds).
    const guestIds = pages.length === 0 ? [tab.id] : pages.map((page) => page.id)
    for (const guestId of guestIds) {
      const explicitZoomLevel = getExplicitBrowserPageZoomLevel(guestId)
      destroyRemovedBrowserWebview(guestId)
      if (explicitZoomLevel !== null) {
        rememberExplicitBrowserPageZoomLevel(guestId, explicitZoomLevel)
      }
    }
  }
}

/** Hidden-worktree guest 预算的 LRU 时钟：最近激活的 worktree 在前。 */
const guestWorktreeRecency: string[] = []

/**
 * Glue for Nexus: guest-budget eviction 接线。上游实现了完整的保留/驱逐原语
 *（browser-guest-worktree-retention + destroyWorktreeBrowserGuests）但未接入：
 * 隐藏 worktree 的 guest 随访问过的 worktree 数量线性常驻。此处在工作区
 * 切换时更新 LRU 序，对超出保留预算（默认 4 个隐藏 worktree）且无自动化
 * 租约/进行中下载的 worktree 销毁其 guest——再次访问时从持久化标签状态重建。
 */
export function evictBrowserGuestsOverBudget(args: {
  activeWorktreeId: string
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>
  browserPagesByWorkspace: Record<string, BrowserPage[]>
}): void {
  touchBrowserGuestWorktreeRecency(guestWorktreeRecency, args.activeWorktreeId)
  const evictionIds = selectBrowserGuestEvictionWorktreeIds({
    orderedWorktreeIds: guestWorktreeRecency,
    activeWorktreeId: args.activeWorktreeId,
    isRetained: (worktreeId) => (args.browserTabsByWorktree[worktreeId] ?? []).length > 0,
    holdsLiveGuests: (worktreeId) =>
      worktreeHoldsLiveBrowserGuests(
        args.browserTabsByWorktree[worktreeId] ?? [],
        args.browserPagesByWorkspace,
        hasLiveBrowserGuest
      ),
    isEvictable: (worktreeId) => {
      for (const tab of args.browserTabsByWorktree[worktreeId] ?? []) {
        const pages = args.browserPagesByWorkspace[tab.id] ?? []
        // Legacy sessions persisted before pages existed key their webview by
        // the workspace tab id (same fallback as destroyWorktreeBrowserGuests).
        const guestIds = pages.length === 0 ? [tab.id] : pages.map((page) => page.id)
        for (const guestId of guestIds) {
          if (isBrowserAutomationVisible(guestId) || hasActiveBrowserPageDownload(guestId)) {
            return false
          }
        }
      }
      return true
    }
  })
  for (const worktreeId of evictionIds) {
    destroyWorktreeBrowserGuests(
      args.browserTabsByWorktree,
      args.browserPagesByWorkspace,
      worktreeId
    )
  }
}

export function destroyWorkspaceWebviews(
  browserPagesByWorkspace: Record<string, BrowserPage[]>,
  workspaceId: string
): void {
  const pages = browserPagesByWorkspace[workspaceId] ?? []
  if (pages.length === 0) {
    // Why: legacy sessions persisted before pages existed still key their
    // webview by workspace id. Preserve the legacy destroy as a fallback.
    destroyRemovedBrowserWebview(workspaceId)
    return
  }
  for (const page of pages) {
    destroyRemovedBrowserWebview(page.id)
  }
}
