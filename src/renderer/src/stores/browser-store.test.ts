// Glue for Nexus: Task 9 冒烟测试——独立 browser store 与 panelBridge / session 持久化订阅的接线。
// AppState harness 与 remote runtime fixtures 依赖未迁移域，
// 不随迁；本文件覆盖 Nexus 侧新增胶路的端到端行为。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserPage, BrowserWorkspace, WorkspaceSessionState } from '@shared/browser/types'
import { useBrowserStore } from './browser'
import { useProjectPanelStore } from './projectPanel'
import { createSessionWriteSubscriber } from '../features/browser/session/session-write-subscriber'
import {
  hydrateBrowserSessionFromDisk,
  startBrowserSessionPersistence
} from '../features/browser/session/browser-session-persistence'

const notifyActiveTabChanged = vi.fn().mockResolvedValue(true)
const sessionPatch = vi.fn().mockResolvedValue(undefined)
const sessionGet = vi.fn<[], Promise<WorkspaceSessionState>>()
const sessionSetSync = vi.fn()
const beforeUnloadListeners: Array<(event?: unknown) => void> = []

// @ts-expect-error test window mock
globalThis.window = {
  api: {
    browser: { notifyActiveTabChanged },
    session: { patch: sessionPatch, get: sessionGet, setSync: sessionSetSync }
  },
  addEventListener: (type: string, listener: (event?: unknown) => void) => {
    if (type === 'beforeunload') beforeUnloadListeners.push(listener)
  }
}

const initialBrowserState = useBrowserStore.getState()
const initialPanelState = useProjectPanelStore.getState()

function workspaceFixture(id: string, worktreeId: string): BrowserWorkspace {
  return {
    id,
    worktreeId,
    sessionProfileId: null,
    sessionPartition: null,
    activePageId: `${id}-page`,
    pageIds: [`${id}-page`],
    url: 'https://example.com/',
    title: 'Example',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1
  }
}

function pageFixture(workspaceId: string, worktreeId: string): BrowserPage {
  return {
    id: `${workspaceId}-page`,
    workspaceId,
    worktreeId,
    url: 'https://example.com/',
    title: 'Example',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1
  }
}

beforeEach(() => {
  useBrowserStore.setState(initialBrowserState, true)
  useProjectPanelStore.setState(initialPanelState, true)
  notifyActiveTabChanged.mockClear()
  sessionPatch.mockClear()
  sessionSetSync.mockClear()
  sessionGet.mockReset()
})

describe('browser store → panelBridge', () => {
  it('createBrowserTab opens a panel tab keyed by the workspace id', () => {
    useBrowserStore.getState().setActiveWorktreeId('session-1')
    const tab = useBrowserStore.getState().createBrowserTab('session-1', 'https://example.com', {
      title: 'Example'
    })

    const panel = useProjectPanelStore.getState()
    const panelTab = panel.tabs.find((t) => t.id === tab.id)
    expect(panelTab).toMatchObject({ type: 'browser', label: 'Example' })
    expect(panel.activeTabId).toBe(tab.id)
    expect(panel.open).toBe(true)
  })

  it('updateBrowserTabPageState renames the panel tab for the active page', () => {
    useBrowserStore.getState().setActiveWorktreeId('session-1')
    const tab = useBrowserStore.getState().createBrowserTab('session-1', 'https://example.com', {
      title: 'Example'
    })

    useBrowserStore.getState().updateBrowserTabPageState(tab.activePageId as string, {
      title: 'New Title'
    })

    expect(useProjectPanelStore.getState().tabs.find((t) => t.id === tab.id)?.label).toBe(
      'New Title'
    )
  })

  it('setActiveBrowserTab activates the panel tab and notifies main', () => {
    useBrowserStore.getState().setActiveWorktreeId('session-1')
    const first = useBrowserStore.getState().createBrowserTab('session-1', 'https://a.example/', {
      title: 'A'
    })
    const second = useBrowserStore
      .getState()
      .createBrowserTab('session-1', 'https://b.example/', { title: 'B' })
    notifyActiveTabChanged.mockClear()

    useBrowserStore.getState().setActiveBrowserTab(first.id)

    expect(useProjectPanelStore.getState().activeTabId).toBe(first.id)
    expect(notifyActiveTabChanged).toHaveBeenCalledWith({ browserPageId: first.activePageId })
    expect(second.id).not.toBe(first.id)
  })

  it('closeBrowserTab closes the panel tab and reopen restores it', () => {
    useBrowserStore.getState().setActiveWorktreeId('session-1')
    const tab = useBrowserStore.getState().createBrowserTab('session-1', 'https://example.com', {
      title: 'Example'
    })

    useBrowserStore.getState().closeBrowserTab(tab.id)
    expect(useProjectPanelStore.getState().tabs.some((t) => t.id === tab.id)).toBe(false)
    expect(
      useBrowserStore.getState().recentlyClosedBrowserTabsByWorktree['session-1']?.[0]?.workspace.id
    ).toBe(tab.id)

    const restored = useBrowserStore.getState().reopenClosedBrowserTab('session-1')
    expect(restored).not.toBeNull()
    expect(useProjectPanelStore.getState().tabs.some((t) => t.id === restored?.id)).toBe(true)
  })
})

describe('hydrateBrowserSession', () => {
  it('restores tabs, opens panel tabs and notifies the active page', () => {
    useBrowserStore.getState().setActiveWorktreeId('session-9')

    useBrowserStore.getState().hydrateBrowserSession({
      browserTabsByWorktree: { 'session-9': [workspaceFixture('ws-1', 'session-9')] },
      browserPagesByWorkspace: { 'ws-1': [pageFixture('ws-1', 'session-9')] },
      activeBrowserTabIdByWorktree: { 'session-9': 'ws-1' },
      activeTabTypeByWorktree: { 'session-9': 'browser' },
      browserUrlHistory: []
    })

    const state = useBrowserStore.getState()
    expect(state.browserTabsByWorktree['session-9']?.[0]?.id).toBe('ws-1')
    expect(state.activeBrowserTabId).toBe('ws-1')
    expect(useProjectPanelStore.getState().tabs.some((t) => t.id === 'ws-1')).toBe(true)
    expect(notifyActiveTabChanged).toHaveBeenCalledWith({ browserPageId: 'ws-1-page' })
  })
})

describe('hydrateBrowserSessionFromDisk', () => {
  it('flips browserSessionReady only after a successful hydrate', async () => {
    sessionGet.mockResolvedValue({})
    await hydrateBrowserSessionFromDisk()
    expect(useBrowserStore.getState().browserSessionReady).toBe(true)

    // 失败路径：ready 保持 false，订阅器不会以空状态覆盖磁盘（issue #1158 语义）
    useBrowserStore.setState({ browserSessionReady: false })
    sessionGet.mockRejectedValue(new Error('disk read failed'))
    await expect(hydrateBrowserSessionFromDisk()).rejects.toThrow('disk read failed')
    expect(useBrowserStore.getState().browserSessionReady).toBe(false)
  })
})

describe('createSessionWriteSubscriber', () => {
  it('persists a browser-field patch after debounce once ready', async () => {
    const persist = vi.fn()
    const unsub = createSessionWriteSubscriber({
      store: useBrowserStore,
      persist,
      debounceMs: 10
    })
    try {
      useBrowserStore.setState({ browserSessionReady: true })
      useBrowserStore.getState().addBrowserHistoryEntry('https://example.com/', 'Example')

      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(persist).toHaveBeenCalledTimes(1)
      const patch = persist.mock.calls[0]?.[0].patch
      expect(patch.browserUrlHistory?.[0]?.url).toBe('https://example.com/')
      expect(patch.browserTabsByWorktree).toEqual({})
      expect(patch.browserPagesByWorkspace).toEqual({})
      expect(patch.activeBrowserTabIdByWorktree).toEqual({})
    } finally {
      unsub()
    }
  })

  it('does not persist before hydration completes', async () => {
    const persist = vi.fn()
    const unsub = createSessionWriteSubscriber({
      store: useBrowserStore,
      persist,
      debounceMs: 10
    })
    try {
      expect(useBrowserStore.getState().browserSessionReady).toBe(false)
      useBrowserStore.getState().addBrowserHistoryEntry('https://example.com/', 'Example')
      await new Promise((resolve) => setTimeout(resolve, 60))
      expect(persist).not.toHaveBeenCalled()
    } finally {
      unsub()
    }
  })
})

describe('projectPanel openTab idempotency (R1)', () => {
  it('reopening with the same explicit id does not duplicate; updates label and activates', () => {
    useProjectPanelStore.getState().openTab('browser', { id: 'ws-dup', label: 'First' })
    expect(useProjectPanelStore.getState().tabs.filter((t) => t.id === 'ws-dup')).toHaveLength(1)

    // 打开另一个标签，把激活态移开
    useProjectPanelStore.getState().openTab('browser', { id: 'ws-other', label: 'Other' })
    expect(useProjectPanelStore.getState().activeTabId).toBe('ws-other')

    // 同 id 二次打开：不重复、label 更新、重新激活
    useProjectPanelStore.getState().openTab('browser', { id: 'ws-dup', label: 'Renamed' })
    const tabs = useProjectPanelStore.getState().tabs
    expect(tabs.filter((t) => t.id === 'ws-dup')).toHaveLength(1)
    expect(tabs.find((t) => t.id === 'ws-dup')?.label).toBe('Renamed')
    expect(useProjectPanelStore.getState().activeTabId).toBe('ws-dup')
    expect(tabs).toHaveLength(2)
  })

  it('reopening with the same id but no label keeps the existing label', () => {
    useProjectPanelStore.getState().openTab('browser', { id: 'ws-keep', label: 'KeepMe' })
    useProjectPanelStore.getState().openTab('browser', { id: 'ws-keep' })
    const tabs = useProjectPanelStore.getState().tabs
    expect(tabs.filter((t) => t.id === 'ws-keep')).toHaveLength(1)
    expect(tabs.find((t) => t.id === 'ws-keep')?.label).toBe('KeepMe')
  })
})

describe('browser-session-persistence wiring (M4)', () => {
  it('startBrowserSessionPersistence is idempotent: one subscriber, one beforeunload listener', async () => {
    startBrowserSessionPersistence()
    startBrowserSessionPersistence()
    expect(beforeUnloadListeners).toHaveLength(1)

    useBrowserStore.setState({ browserSessionReady: true })
    sessionPatch.mockClear()
    useBrowserStore.getState().addBrowserHistoryEntry('https://idempotent.example/', 'Idempotent')
    // > default debounce (150ms)；单一订阅器只应落盘一次（叠加订阅会 >1 次）
    await new Promise((resolve) => setTimeout(resolve, 260))
    expect(sessionPatch).toHaveBeenCalledTimes(1)
  })

  it('beforeunload writes defaults merged-with the four browser fields via setSync', () => {
    startBrowserSessionPersistence()
    useBrowserStore.setState({
      browserSessionReady: true,
      browserTabsByWorktree: { 'session-bu': [workspaceFixture('ws-bu', 'session-bu')] },
      browserPagesByWorkspace: { 'ws-bu': [pageFixture('ws-bu', 'session-bu')] },
      activeBrowserTabIdByWorktree: { 'session-bu': 'ws-bu' },
      browserUrlHistory: [
        {
          url: 'https://example.com/',
          normalizedUrl: 'example.com',
          title: 'Example',
          lastVisitedAt: 1,
          visitCount: 1
        }
      ]
    })

    for (const listener of [...beforeUnloadListeners]) {
      listener()
    }

    expect(sessionSetSync).toHaveBeenCalledTimes(1)
    const payload = sessionSetSync.mock.calls[0]?.[0]
    // getDefaultWorkspaceSession 合并：非浏览器必填字段取默认空值
    expect(payload.activeRepoId).toBeNull()
    expect(payload.activeWorktreeId).toBeNull()
    expect(payload.tabsByWorktree).toEqual({})
    expect(payload.terminalLayoutsByTabId).toEqual({})
    // 4 个浏览器字段取自 store（loading 复位为 false）
    expect(payload.browserTabsByWorktree).toEqual({
      'session-bu': [{ ...workspaceFixture('ws-bu', 'session-bu'), loading: false }]
    })
    expect(payload.browserPagesByWorkspace).toEqual({
      'ws-bu': [{ ...pageFixture('ws-bu', 'session-bu'), loading: false }]
    })
    expect(payload.activeBrowserTabIdByWorktree).toEqual({ 'session-bu': 'ws-bu' })
    expect(payload.browserUrlHistory?.[0]?.url).toBe('https://example.com/')
  })
})
