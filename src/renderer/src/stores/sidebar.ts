import { create } from 'zustand'

export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_DEFAULT_WIDTH = 260

interface SidebarState {
  collapsed: boolean
  width: number
  toggleCollapsed: () => void
  /** 设置宽度，自动限制在 [最小值, 最大值] 区间 */
  setWidth: (width: number) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  width: SIDEBAR_DEFAULT_WIDTH,
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
  setWidth: (width) =>
    set({ width: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)) })
}))
