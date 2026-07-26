import { create } from 'zustand'

interface NavigationState {
  /** 浏览历史栈（视图 id） */
  history: string[]
  /** 当前位置下标 */
  index: number
  /** 进入新视图：截断前进分支后入栈 */
  navigate: (view: string) => void
  goBack: () => void
  goForward: () => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  history: ['home'],
  index: 0,
  navigate: (view) =>
    set((state) => {
      const history = [...state.history.slice(0, state.index + 1), view]
      return { history, index: history.length - 1 }
    }),
  goBack: () => set((state) => ({ index: Math.max(0, state.index - 1) })),
  goForward: () => set((state) => ({ index: Math.min(state.history.length - 1, state.index + 1) }))
}))

export const selectCanGoBack = (state: NavigationState): boolean => state.index > 0
export const selectCanGoForward = (state: NavigationState): boolean =>
  state.index < state.history.length - 1
