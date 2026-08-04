// 统一 tab 操作（unifiedTabsByWorktree/closeUnifiedTab/
// activateTab/setTabLabel）映射到 Nexus projectPanel store。PanelTab.id === BrowserWorkspace.id。
import { useProjectPanelStore } from '@renderer/stores/projectPanel'

export const panelBridge = {
  /** 面板中是否已存在该浏览器标签 */
  hasTab(id: string): boolean {
    return useProjectPanelStore.getState().tabs.some((t) => t.id === id)
  },
  openBrowserTab(id: string, label?: string): void {
    const panel = useProjectPanelStore.getState()
    if (!panel.open) useProjectPanelStore.setState({ open: true })
    panel.openTab('browser', { id, label })
  },
  closeTab(id: string): void {
    const panel = useProjectPanelStore.getState()
    if (panel.tabs.some((t) => t.id === id)) panel.closeTab(id)
  },
  activateTab(id: string): void {
    const panel = useProjectPanelStore.getState()
    if (panel.tabs.some((t) => t.id === id)) panel.setActiveTab(id)
  },
  setTabLabel(id: string, label: string): void {
    useProjectPanelStore.getState().renameTab(id, label)
  },
  /** 记录埋点：Nexus 无此设施，no-op */
  recordFeatureInteraction(..._args: unknown[]): void {}
}
