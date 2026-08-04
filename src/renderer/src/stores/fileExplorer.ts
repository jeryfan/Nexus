import { create } from 'zustand'

/**
 * 文件树展开/过滤状态（原 `Record<worktreeId, Set<string>>` 改为 `Record<rootPath, string[]>`：
 * 以项目根路径为 key，数组替代 Set 以保证可序列化）。
 */
interface FileExplorerState {
  /** root 路径 → 已展开的目录路径列表 */
  expandedDirs: Record<string, string[]>
  /** root 路径 → 是否显示点开头文件（默认 false 隐藏） */
  showDotfiles: Record<string, boolean>
  toggleDir: (root: string, dirPath: string) => void
  collapseAll: (root: string) => void
  toggleDotfiles: (root: string) => void
}

export const useFileExplorerStore = create<FileExplorerState>((set) => ({
  expandedDirs: {},
  showDotfiles: {},
  toggleDir: (root, dirPath) =>
    set((state) => {
      const current = state.expandedDirs[root] ?? []
      const next = current.includes(dirPath)
        ? current.filter((dir) => dir !== dirPath)
        : [...current, dirPath]
      return { expandedDirs: { ...state.expandedDirs, [root]: next } }
    }),
  collapseAll: (root) =>
    set((state) => {
      const current = state.expandedDirs[root]
      if (!current?.length) {
        return state
      }
      return { expandedDirs: { ...state.expandedDirs, [root]: [] } }
    }),
  toggleDotfiles: (root) =>
    set((state) => ({
      showDotfiles: { ...state.showDotfiles, [root]: !state.showDotfiles[root] }
    }))
}))
