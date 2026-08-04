// Glue for Nexus: 仅保留 4 个浏览器字段的 patch 分支；终端/编辑器/统一 tab 分支随对应 slice 不迁移。
import type { WorkspaceSessionPatch } from '@shared/browser/types'
import { normalizeBrowserHistoryEntries } from '@shared/browser/workspace-session-browser-history'
import {
  buildPersistedBrowserPagesByWorkspace,
  buildPersistedBrowserTabsByWorktree,
  type WorkspaceSessionSnapshot
} from './workspace-session'

type SessionRelevantField = keyof WorkspaceSessionSnapshot

export function buildWorkspaceSessionPatch(
  snapshot: WorkspaceSessionSnapshot,
  changedFields: Iterable<SessionRelevantField>
): WorkspaceSessionPatch {
  const changed = new Set(changedFields)
  const patch: WorkspaceSessionPatch = {}

  if (changed.has('browserTabsByWorktree')) {
    patch.browserTabsByWorktree = buildPersistedBrowserTabsByWorktree(
      snapshot.browserTabsByWorktree
    )
  }
  if (changed.has('browserPagesByWorkspace')) {
    patch.browserPagesByWorkspace = buildPersistedBrowserPagesByWorkspace(
      snapshot.browserPagesByWorkspace
    )
  }
  if (changed.has('activeBrowserTabIdByWorktree')) {
    patch.activeBrowserTabIdByWorktree = snapshot.activeBrowserTabIdByWorktree
  }
  if (changed.has('browserUrlHistory')) {
    patch.browserUrlHistory = normalizeBrowserHistoryEntries(snapshot.browserUrlHistory)
  }

  return patch
}
