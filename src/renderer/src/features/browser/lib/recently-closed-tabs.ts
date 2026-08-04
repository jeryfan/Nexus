// browser slice 用到的位置/种类助手。
// 裁剪:
//   - ClosedTerminalTabSnapshot / pushClosedTerminalTabSnapshot / remapClosedTerminalTabSnapshotCwds
//     （终端/编辑器快照助手，依赖 cross-platform-path，随终端/编辑器 slice 不迁移）
//   - RecentlyClosedTabsSlice / createRecentlyClosedTabsSlice（终端重开 action 依赖终端 slice）
// Glue for Nexus: 参数类型从 Pick<AppState, ...> 放宽为结构化类型——独立 browser store 没有
// groupsByWorktree/unifiedTabsByWorktree（统一 tab 系统由 projectPanel 取代），相应分支自然失效，
// 函数体保持原样。
export type RecentlyClosedTabPosition = {
  tabBarIndex?: number
  groupId?: string
  groupIndex?: number
}

export type RecentlyClosedTabKind = 'terminal' | 'browser' | 'editor'

// Why: wider than the per-type stacks (10) so cross-type ordering survives a
// full per-type stack; kind entries whose snapshot aged out are skipped on pop.
const MAX_RECENT_CLOSED_TAB_KINDS = 30

type PositionTabGroup = { id: string; tabOrder: string[] }
type PositionUnifiedTab = { id: string; entityId: string; groupId: string }

export type RecentlyClosedPositionSource = {
  tabBarOrderByWorktree?: Record<string, string[]>
  groupsByWorktree?: Record<string, PositionTabGroup[]>
  unifiedTabsByWorktree?: Record<string, PositionUnifiedTab[]>
}

export function getRecentlyClosedTabPosition(
  state: RecentlyClosedPositionSource,
  worktreeId: string,
  entityId: string
): RecentlyClosedTabPosition | undefined {
  const tabBarOrder = state.tabBarOrderByWorktree?.[worktreeId]
  const unifiedTabs = state.unifiedTabsByWorktree?.[worktreeId] ?? []
  const tabBarIndex = tabBarOrder?.indexOf(entityId) ?? -1
  const unifiedTab = unifiedTabs.find((tab) => tab.entityId === entityId)
  const group = unifiedTab
    ? (state.groupsByWorktree?.[worktreeId] ?? []).find(
        (candidate) => candidate.id === unifiedTab.groupId
      )
    : undefined
  const groupIndex = group?.tabOrder.indexOf(unifiedTab?.id ?? '') ?? -1
  const groupTabEntityIds = group
    ? group.tabOrder.map((tabId) => unifiedTabs.find((tab) => tab.id === tabId)?.entityId)
    : []
  const tabBarGroupEntityIds = group
    ? (tabBarOrder ?? [])
        .map((tabId) => unifiedTabs.find((tab) => tab.entityId === tabId))
        .filter((tab) => tab?.groupId === group.id)
        .map((tab) => tab?.entityId)
    : []
  const groupOrderMatchesTabBar =
    !group ||
    (groupTabEntityIds.length === tabBarGroupEntityIds.length &&
      groupTabEntityIds.every((entityId, index) => entityId === tabBarGroupEntityIds[index]))
  if (tabBarIndex < 0 && (!group || groupIndex < 0)) {
    return undefined
  }

  return {
    ...(tabBarIndex >= 0 && groupOrderMatchesTabBar ? { tabBarIndex } : {}),
    ...(group && groupIndex >= 0 ? { groupId: group.id, groupIndex } : {})
  }
}

export function insertTabAtRecentlyClosedPosition(
  order: readonly string[],
  tabId: string,
  position?: RecentlyClosedTabPosition
): string[] {
  const nextOrder = order.filter((id) => id !== tabId)
  const index = position?.tabBarIndex
  if (index === undefined) {
    return [...nextOrder, tabId]
  }
  nextOrder.splice(Math.min(Math.max(index, 0), nextOrder.length), 0, tabId)
  return nextOrder
}

export function restoreRecentlyClosedTabPosition(
  getState: () => RecentlyClosedPositionSource & {
    setTabBarOrder?: (worktreeId: string, order: string[]) => void
    reorderUnifiedTabs?: (
      groupId: string,
      tabOrder: string[],
      options?: { recordInteraction?: boolean }
    ) => void
  },
  worktreeId: string,
  entityId: string,
  position?: RecentlyClosedTabPosition
): void {
  if (!position) {
    return
  }
  const state = getState()
  const order = state.tabBarOrderByWorktree?.[worktreeId]
  if (order && typeof state.setTabBarOrder === 'function') {
    state.setTabBarOrder(worktreeId, insertTabAtRecentlyClosedPosition(order, entityId, position))
  }

  if (position?.groupIndex === undefined) {
    return
  }
  const unifiedTab = (getState().unifiedTabsByWorktree?.[worktreeId] ?? []).find(
    (candidate) =>
      candidate.entityId === entityId &&
      (position.groupId === undefined || candidate.groupId === position.groupId)
  )
  if (!unifiedTab) {
    return
  }
  const group = (getState().groupsByWorktree?.[worktreeId] ?? []).find(
    (candidate) => candidate.id === unifiedTab.groupId
  )
  if (!group) {
    return
  }
  const reorderUnifiedTabs = getState().reorderUnifiedTabs
  if (typeof reorderUnifiedTabs === 'function') {
    reorderUnifiedTabs(
      group.id,
      insertTabAtRecentlyClosedPosition(group.tabOrder, unifiedTab.id, {
        tabBarIndex: position.groupIndex
      }),
      { recordInteraction: false }
    )
  }
}

export function pushRecentlyClosedTabKind(
  map: Record<string, RecentlyClosedTabKind[]> | undefined,
  worktreeId: string,
  kind: RecentlyClosedTabKind,
  count = 1
): Record<string, RecentlyClosedTabKind[]> {
  // Why: preserve the original reference on no-op pushes so unrelated
  // subscribers don't re-evaluate (mirrors the closeTab unread-map pattern).
  if (count <= 0) {
    return map ?? {}
  }
  // Why: close-all may contain thousands of editor tabs, but entries beyond
  // the retained history cap can never affect reopen ordering.
  const retainedCount = Math.min(count, MAX_RECENT_CLOSED_TAB_KINDS)
  return {
    ...map,
    [worktreeId]: [
      ...(Array(retainedCount).fill(kind) as RecentlyClosedTabKind[]),
      ...(map?.[worktreeId] ?? [])
    ].slice(0, MAX_RECENT_CLOSED_TAB_KINDS)
  }
}
