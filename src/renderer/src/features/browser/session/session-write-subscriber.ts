// SESSION_RELEVANT_FIELDS 收敛为浏览器字段，tabsByWorktree/unifiedTabsByWorktree
// 装饰性标题变更检测（isDecorativeAgentTitleFrameChange 等）随终端/统一 tab 系统不迁移；
// store 引用为 useBrowserStore，persist 本地直写（无 host 分发）。
import type { BrowserState } from '@renderer/stores/browser'
import type { WorkspaceSessionPatch } from '@shared/browser/types'
import { SESSION_RELEVANT_FIELDS, shouldPersistWorkspaceSession } from './workspace-session'
import { buildWorkspaceSessionPatch } from './workspace-session-patch'

type SessionRelevantField = (typeof SESSION_RELEVANT_FIELDS)[number]

function sessionRelevantFieldChanged(
  _key: SessionRelevantField,
  prevValue: unknown,
  nextValue: unknown
): boolean {
  // 剩余字段均为浏览器字段，引用比较即可（终端/统一 tab 的装饰性
  // 标题抖动过滤不适用）。
  return prevValue !== nextValue
}

export type WorkspaceSessionWrite = {
  patch: WorkspaceSessionPatch
}

export type SessionWriteSubscriberDeps = {
  store: {
    subscribe: (listener: (state: BrowserState) => void) => () => void
    getState: () => BrowserState
  }
  persist: (payload: WorkspaceSessionWrite) => void
  shouldSchedulePersist?: () => boolean
  debounceMs?: number
}

/**
 * Why: factored out so a vitest can drive the real Zustand store and assert
 * which mutations cause a session write — the gate against unrelated updates
 * (agent status, usage, runtime title ticks) is load-bearing for setTimeout
 * violation budgets and the failure mode is silent.
 */
export function createSessionWriteSubscriber({
  store,
  persist,
  shouldSchedulePersist,
  debounceMs = 150
}: SessionWriteSubscriberDeps): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  // Why: the subscriber fires on every store update (agent status, usage
  // refreshes, runtime title ticks, …). Without this gate each fire reset
  // the debounce, and when it finally expired buildWorkspaceSessionPayload
  // crossed 70-110ms with many tabs, tripping setTimeout violations. Compare
  // each session-feeding field by reference against the prior snapshot and
  // skip both the timer reset and the rebuild when none changed. `null`
  // sentinel guarantees the very first fire always proceeds.
  let prev: Record<string, unknown> | null = null
  const pendingChangedFields = new Set<SessionRelevantField>()

  const unsub = store.subscribe((state) => {
    if (!shouldPersistWorkspaceSession(state)) {
      return
    }
    const changedFields: SessionRelevantField[] = []
    if (prev === null) {
      changedFields.push(...SESSION_RELEVANT_FIELDS)
    } else {
      for (const key of SESSION_RELEVANT_FIELDS) {
        if (sessionRelevantFieldChanged(key, prev[key], state[key])) {
          changedFields.push(key)
        }
      }
    }
    if (changedFields.length === 0) {
      return
    }
    const next: Record<string, unknown> = {}
    for (const key of SESSION_RELEVANT_FIELDS) {
      next[key] = state[key]
    }
    prev = next
    for (const field of changedFields) {
      pendingChangedFields.add(field)
    }
    if (shouldSchedulePersist && !shouldSchedulePersist()) {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pendingChangedFields.clear()
      return
    }
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      // Why: rebuild from the freshest store state rather than the snapshot
      // captured when this timer was scheduled. Today this is equivalent
      // because buildWorkspaceSessionPayload reads only SESSION_RELEVANT_FIELDS
      // (the same fields gating the timer reset), so the captured `state` is
      // already current for those fields. Calling getState() guards against a
      // future refactor that adds a non-relevant field read to the payload
      // builder — without this, such a change would silently start emitting
      // stale values for that field.
      const fresh = store.getState()
      if (!shouldPersistWorkspaceSession(fresh)) {
        pendingChangedFields.clear()
        return
      }
      if (shouldSchedulePersist && !shouldSchedulePersist()) {
        pendingChangedFields.clear()
        return
      }
      const changed = new Set(pendingChangedFields)
      pendingChangedFields.clear()
      const patch = buildWorkspaceSessionPatch(fresh, changed)
      if (Object.keys(patch).length === 0) {
        return
      }
      persist({ patch })
    }, debounceMs)
  })

  return () => {
    unsub()
    if (timer !== null) {
      clearTimeout(timer)
    }
    pendingChangedFields.clear()
  }
}
