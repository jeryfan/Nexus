// Glue for Nexus: 应用启动时 hydrate 浏览器会话；会话切换时把该会话的浏览器标签
// 恢复进面板（旧会话的浏览器标签从面板移除，webview 由 browser-webview-cleanup 销毁），
// 并维护 slice 的 activeWorktreeId（hydrate 活跃 tab 计算与 notifyActiveTabChanged 依赖）。
import { useAgentStore } from '@renderer/features/agent/agentStore'
import { useBrowserStore } from '@renderer/stores/browser'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { useEffect } from 'react'
import {
  hydrateBrowserSessionFromDisk,
  startBrowserSessionPersistence
} from './session/browser-session-persistence'

/** 重建面板的浏览器标签：移除所有浏览器类型面板标签，按指定会话的持久化
 *  BrowserWorkspace 重建，激活态对齐 activeBrowserTabIdByWorktree[sessionId]。 */
function rebuildPanelBrowserTabs(sessionId: string | null): void {
  const panel = useProjectPanelStore.getState()
  const nonBrowserTabs = panel.tabs.filter((t) => t.type !== 'browser')
  const workspaces = sessionId
    ? (useBrowserStore.getState().browserTabsByWorktree[sessionId] ?? [])
    : []
  const nextTabs = [
    ...nonBrowserTabs,
    ...workspaces.map((ws) => ({
      id: ws.id,
      type: 'browser' as const,
      label: ws.title || ws.url || '浏览器'
    }))
  ]
  const persistedActiveId = sessionId
    ? useBrowserStore.getState().activeBrowserTabIdByWorktree[sessionId]
    : null
  const activeTabId = nextTabs.some((t) => t.id === panel.activeTabId)
    ? panel.activeTabId
    : persistedActiveId && nextTabs.some((t) => t.id === persistedActiveId)
      ? persistedActiveId
      : (nextTabs[nextTabs.length - 1]?.id ?? null)
  // Why: 面板 open 态是全局的，旧会话的浏览器流程打开后会跨会话残留——
  // 切到没有标签的新会话时收起面板（用户期望新会话不自动开右侧 panel）；
  // 仍有文件等标签时保持原状。agent 之后开浏览器会经 panelBridge 重新打开。
  useProjectPanelStore.setState({
    tabs: nextTabs,
    activeTabId,
    ...(nextTabs.length === 0 ? { open: false } : {})
  })
}

export function useBrowserSessionHydration(): void {
  const sessionId = useAgentStore((s) => s.activeSessionId)

  useEffect(() => {
    startBrowserSessionPersistence()
    // 启动时也设置 activeWorktreeId：hydrate 的活跃 tab 计算依赖它
    useBrowserStore.getState().setActiveWorktreeId(useAgentStore.getState().activeSessionId)
    hydrateBrowserSessionFromDisk()
      .then(() => rebuildPanelBrowserTabs(useAgentStore.getState().activeSessionId))
      .catch((error) => console.error('浏览器会话 hydrate 失败', error))
  }, [])

  useEffect(() => {
    if (!sessionId) {
      return
    }
    useBrowserStore.getState().setActiveWorktreeId(sessionId)
    rebuildPanelBrowserTabs(sessionId)
  }, [sessionId])
}
