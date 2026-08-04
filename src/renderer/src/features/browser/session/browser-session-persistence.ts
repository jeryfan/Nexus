// Glue for Nexus: 订阅 useBrowserStore 变化 → 防抖 patch 到主进程 nexus-browser-session.json；
// 启动时 hydrate（装配方式：createSessionWriteSubscriber + beforeunload 同步写）。
// 调用点在 Task 10 的 useBrowserSessionHydration（应用启动/会话切换）。
import type { WorkspaceSessionState } from '@shared/browser/types'
import { getDefaultWorkspaceSession } from '@shared/browser/constants'
import { normalizeBrowserHistoryEntries } from '@shared/browser/workspace-session-browser-history'
import { useBrowserStore } from '@renderer/stores/browser'
import { createSessionWriteSubscriber } from './session-write-subscriber'
import {
  buildPersistedBrowserPagesByWorkspace,
  buildPersistedBrowserTabsByWorktree,
  shouldPersistWorkspaceSession
} from './workspace-session'

let started = false

export function startBrowserSessionPersistence(): void {
  if (started) {
    return
  }
  started = true
  createSessionWriteSubscriber({
    store: useBrowserStore,
    persist: ({ patch }) => void window.api.session.patch(patch),
    shouldSchedulePersist: () => true
  })
  installBrowserSessionBeforeUnload()
}

export async function hydrateBrowserSessionFromDisk(): Promise<void> {
  const session = await window.api.session.get()
  useBrowserStore.getState().hydrateBrowserSession(session)
  // browserSessionReady 闸门：仅在 hydrate 成功后置位；get/hydrate 抛错时保持 false，
  // 订阅器不会以空状态覆盖磁盘会话文件（issue #1158 语义）。
  useBrowserStore.setState({ browserSessionReady: true })
}

// beforeunload 同步落盘（shutdown checkpoint），
// Nexus 无 scrollback/agent 休眠会话捕获，直接 setSync 浏览器部分（阻塞直至主进程写盘）。
let beforeUnloadInstalled = false
function installBrowserSessionBeforeUnload(): void {
  if (beforeUnloadInstalled || typeof window === 'undefined') {
    return
  }
  beforeUnloadInstalled = true
  window.addEventListener('beforeunload', () => {
    const state = useBrowserStore.getState()
    if (!shouldPersistWorkspaceSession(state)) {
      return
    }
    // Glue for Nexus: 会话文件仅持久化浏览器字段，其余必填字段取默认空值。
    const payload: WorkspaceSessionState = {
      ...getDefaultWorkspaceSession(),
      browserTabsByWorktree: buildPersistedBrowserTabsByWorktree(state.browserTabsByWorktree),
      browserPagesByWorkspace: buildPersistedBrowserPagesByWorkspace(state.browserPagesByWorkspace),
      activeBrowserTabIdByWorktree: state.activeBrowserTabIdByWorktree,
      browserUrlHistory: normalizeBrowserHistoryEntries(state.browserUrlHistory)
    }
    window.api.session.setSync(payload)
  })
}
