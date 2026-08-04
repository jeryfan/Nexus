import { create } from 'zustand'

export const PANEL_MIN_WIDTH = 240
export const PANEL_MAX_WIDTH = 640
export const PANEL_DEFAULT_WIDTH = 320
export const TREE_MIN_WIDTH = 120
export const TREE_MAX_WIDTH = 480
export const TREE_DEFAULT_WIDTH = 144

/** 面板标签页类型（前四个对应「+」菜单入口；'file-browser' 为「打开文件」页，'file' 为文件预览/编辑标签） */
export type PanelTabType = 'review' | 'terminal' | 'browser' | 'chat' | 'file-browser' | 'file'

export interface PanelTab {
  id: string
  type: PanelTabType
  /** type === 'file' 时的文件路径 */
  filePath?: string
  /** 预览标签（单击打开）：会被下一个预览标签原位替换；双击固化后清除 */
  isPreview?: boolean
  /** 自定义标签标题（浏览器标签标题来自 BrowserWorkspace，随页面标题更新） */
  label?: string
}

interface ProjectPanelState {
  /** 右侧面板是否展开 */
  open: boolean
  /** 面板最大化：隐藏对话区，面板占满内容区（open=false 时无视觉效果） */
  maximized: boolean
  /** 文件树是否展示（标签栏文件夹图标切换；树是面板的可显隐区域，不是标签页） */
  treeVisible: boolean
  /** 已打开的标签页 */
  tabs: PanelTab[]
  /** 当前激活的标签页；null 表示无标签（显示菜单列表） */
  activeTabId: string | null
  /** 有未保存修改的标签 id 集合（文件编辑 dirty 标记，供标签栏显示圆点） */
  dirtyTabIds: Record<string, true>
  toggleOpen: () => void
  toggleMaximized: () => void
  toggleTreeVisible: () => void
  /** 打开一个标签页并激活（同类型允许多开）。options.id 供浏览器标签复用 BrowserWorkspace.id；label 为自定义标题 */
  openTab: (type: PanelTabType, options?: { id?: string; label?: string }) => void
  /** 重命名标签标题（浏览器标签随页面标题更新） */
  renameTab: (id: string, label: string) => void
  /**
   * 打开文件标签并激活。同 filePath 已存在时仅激活；
   * 若该标签仍为预览且本次 preview=false，则同时固化（清除 isPreview，
   * 按 existing-tab + non-preview 语义处理，供双击固化使用）。
   * 默认 preview=true —— 已有预览文件标签会被新标签原位替换
   * （isPreview 替换语义）。
   */
  openFileTab: (filePath: string, options?: { preview?: boolean }) => void
  /** 清除预览标记（双击固化预览标签） */
  makeTabPermanent: (id: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  /** 标记/清除标签的未保存修改状态（文件编辑面板上报） */
  setTabDirty: (id: string, dirty: boolean) => void
}

export const useProjectPanelStore = create<ProjectPanelState>((set) => ({
  open: false,
  maximized: false,
  treeVisible: false,
  tabs: [],
  activeTabId: null,
  dirtyTabIds: {},
  toggleOpen: () => set((state) => ({ open: !state.open })),
  toggleMaximized: () => set((state) => ({ maximized: !state.maximized })),
  toggleTreeVisible: () => set((state) => ({ treeVisible: !state.treeVisible })),
  openTab: (type, options) =>
    set((state) => {
      // 「打开文件」页唯一：已存在时仅激活（重复点菜单「文件」不多开）
      if (type === 'file-browser') {
        const existing = state.tabs.find((tab) => tab.type === 'file-browser')
        if (existing) return { activeTabId: existing.id }
      }
      // 带显式 id 幂等：同 id 标签已存在（浏览器标签 id === BrowserWorkspace.id，
      // panelBridge.openBrowserTab 可能重复调用）时仅激活并更新 label，不插入重复标签
      if (options?.id) {
        const existing = state.tabs.find((tab) => tab.id === options.id)
        if (existing) {
          return {
            tabs:
              options.label !== undefined
                ? state.tabs.map((tab) =>
                    tab.id === options.id ? { ...tab, label: options.label } : tab
                  )
                : state.tabs,
            activeTabId: existing.id
          }
        }
      }
      const tab: PanelTab = { id: options?.id ?? crypto.randomUUID(), type, label: options?.label }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),
  renameTab: (id, label) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, label } : tab))
    })),
  openFileTab: (filePath, options) =>
    set((state) => {
      const existing = state.tabs.find((tab) => tab.type === 'file' && tab.filePath === filePath)
      if (existing) {
        // 双击固化：已有预览标签以 preview=false 重新打开时清除 isPreview
        if (options?.preview === false && existing.isPreview) {
          return {
            tabs: state.tabs.map((t) => (t.id === existing.id ? { ...t, isPreview: false } : t)),
            activeTabId: existing.id
          }
        }
        return { activeTabId: existing.id }
      }
      const isPreview = options?.preview ?? true
      const tab: PanelTab = { id: crypto.randomUUID(), type: 'file', filePath, isPreview }
      // 「打开文件」标签被选中的文件原位替换（对齐 codex：打开文件页选中文件后即成为该文件的标签）
      const browserIndex = state.tabs.findIndex((t) => t.type === 'file-browser')
      if (browserIndex !== -1) {
        return {
          tabs: state.tabs.map((t, i) => (i === browserIndex ? tab : t)),
          activeTabId: tab.id
        }
      }
      // 预览模式：原位替换当前预览文件标签，保持标签位置
      if (isPreview) {
        const previewIndex = state.tabs.findIndex((t) => t.type === 'file' && t.isPreview)
        if (previewIndex !== -1) {
          // 被替换标签的 dirty 标记一并清除（其编辑草稿随标签销毁）
          const dirtyTabIds = { ...state.dirtyTabIds }
          delete dirtyTabIds[state.tabs[previewIndex].id]
          return {
            tabs: state.tabs.map((t, i) => (i === previewIndex ? tab : t)),
            activeTabId: tab.id,
            dirtyTabIds
          }
        }
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),
  makeTabPermanent: (id) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id && tab.isPreview ? { ...tab, isPreview: false } : tab
      )
    })),
  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const dirtyTabIds = { ...state.dirtyTabIds }
      delete dirtyTabIds[id]
      // 关闭最后一个标签时连同面板一起关闭（而不是回到空态菜单）
      if (tabs.length === 0) {
        return { tabs, activeTabId: null, dirtyTabIds, open: false }
      }
      // 关闭激活页时回退到最后一个标签
      const activeTabId =
        state.activeTabId === id ? tabs[tabs.length - 1].id : state.activeTabId
      return { tabs, activeTabId, dirtyTabIds }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  setTabDirty: (id, dirty) =>
    set((state) => {
      if ((state.dirtyTabIds[id] === true) === dirty) {
        return state
      }
      const dirtyTabIds = { ...state.dirtyTabIds }
      if (dirty) {
        dirtyTabIds[id] = true
      } else {
        delete dirtyTabIds[id]
      }
      // needsPreviewClear 语义：预览标签
      // 一旦变 dirty 即固化，避免被下一个预览标签原位替换导致草稿丢失
      const tabs = dirty
        ? state.tabs.map((tab) => (tab.id === id && tab.isPreview ? { ...tab, isPreview: false } : tab))
        : state.tabs
      return { dirtyTabIds, tabs }
    })
}))
