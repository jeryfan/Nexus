// Glue for Nexus: SESSION_RELEVANT_FIELDS 收敛为 4 个浏览器字段；终端/编辑器/统一 tab/agent 休眠
// 会话等字段及其构建器（buildWorkspaceSessionPayload/buildEditorSessionData/buildTerminalSessionData/
// buildPersistedUnifiedTabSessionData 等）随对应 slice 不迁移。
import type { BrowserPage, BrowserWorkspace, WorkspaceSessionState } from '@shared/browser/types'
import type { BrowserState } from '@renderer/stores/browser'

/** Why: hydrate 成功后才允许落盘，避免以空状态覆盖磁盘会话文件。 */
export function shouldPersistWorkspaceSession(
  state: Pick<BrowserState, 'browserSessionReady'>
): boolean {
  return state.browserSessionReady
}

export type WorkspaceSessionSnapshot = Pick<
  BrowserState,
  | 'browserTabsByWorktree'
  | 'browserPagesByWorkspace'
  | 'activeBrowserTabIdByWorktree'
  | 'browserUrlHistory'
>

// Why: shallow-equality gate for the debounced session writer; _exhaustive below keeps it in sync with the snapshot type.
export const SESSION_RELEVANT_FIELDS = [
  'browserTabsByWorktree',
  'browserPagesByWorkspace',
  'activeBrowserTabIdByWorktree',
  'browserUrlHistory'
] as const satisfies readonly (keyof WorkspaceSessionSnapshot)[]

type _MissingSessionField = Exclude<
  keyof WorkspaceSessionSnapshot,
  (typeof SESSION_RELEVANT_FIELDS)[number]
>
void (true satisfies [_MissingSessionField] extends [never] ? true : never)

export function buildPersistedBrowserTabsByWorktree(
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>
): WorkspaceSessionState['browserTabsByWorktree'] {
  return Object.fromEntries(
    Object.entries(browserTabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      tabs.map((tab) => ({ ...tab, loading: false }))
    ])
  )
}

export function buildPersistedBrowserPagesByWorkspace(
  browserPagesByWorkspace: Record<string, BrowserPage[]>
): WorkspaceSessionState['browserPagesByWorkspace'] {
  return Object.fromEntries(
    Object.entries(browserPagesByWorkspace).map(([workspaceId, pages]) => [
      workspaceId,
      pages.map((page) => ({ ...page, loading: false }))
    ])
  )
}
