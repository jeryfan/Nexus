// @vitest-environment happy-dom
// Glue for Nexus: useBrowserIpcEvents 最小测试——onRequestTabCreate 三路径（无 worktree /
// 成功 / handler 抛错）与 mount→unmount→mount 无重复监听（CLI request/reply 链路回归护栏）。
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBrowserIpcEvents } from './useBrowserIpcEvents'

type Handler = (data: never) => void

const storeState = vi.hoisted(() => ({
  activeWorktreeId: null as string | null,
  activeBrowserTabId: null as string | null,
  activeBrowserTabIdByWorktree: {} as Record<string, string | null>,
  browserTabsByWorktree: {} as Record<string, unknown[]>,
  browserPagesByWorkspace: {} as Record<string, Array<{ id: string }>>,
  createBrowserTab: vi.fn(),
  updateBrowserPageState: vi.fn(),
  setBrowserPageUrl: vi.fn(),
  setBrowserPageCertificateFailure: vi.fn(),
  focusBrowserTabInWorktree: vi.fn(),
  switchBrowserTabProfile: vi.fn(),
  closeBrowserTab: vi.fn(),
  closeBrowserPage: vi.fn()
}))

vi.mock('@renderer/stores/browser', () => ({
  useBrowserStore: { getState: () => storeState }
}))

const CHANNELS = [
  'browser.onGuestLoadFailed',
  'browser.onCertificateFailureChanged',
  'browser.onNavigationUpdate',
  'browser.onActivateView',
  'browser.onPaneFocus',
  'browser.onOpenLinkInNexusTab',
  'ui.onNewBrowserTab',
  'ui.onRequestTabCreate',
  'ui.onRequestTabSetProfile',
  'ui.onRequestTabClose'
] as const

const replyTabCreate = vi.fn()
const replyTabSetProfile = vi.fn()
const replyTabClose = vi.fn()
const listenersByChannel = new Map<string, Handler[]>()
const subscribeFns = new Map<string, ReturnType<typeof vi.fn>>()

function installWindowApi(): void {
  listenersByChannel.clear()
  subscribeFns.clear()
  for (const channel of CHANNELS) {
    const subscribe = vi.fn((callback: Handler) => {
      const list = listenersByChannel.get(channel) ?? []
      list.push(callback)
      listenersByChannel.set(channel, list)
      return () => {
        listenersByChannel.set(
          channel,
          (listenersByChannel.get(channel) ?? []).filter((c) => c !== callback)
        )
      }
    })
    subscribeFns.set(channel, subscribe)
  }
  const api = {
    browser: {
      onGuestLoadFailed: subscribeFns.get('browser.onGuestLoadFailed'),
      onCertificateFailureChanged: subscribeFns.get('browser.onCertificateFailureChanged'),
      onNavigationUpdate: subscribeFns.get('browser.onNavigationUpdate'),
      onActivateView: subscribeFns.get('browser.onActivateView'),
      onPaneFocus: subscribeFns.get('browser.onPaneFocus'),
      onOpenLinkInNexusTab: subscribeFns.get('browser.onOpenLinkInNexusTab')
    },
    ui: {
      onNewBrowserTab: subscribeFns.get('ui.onNewBrowserTab'),
      onRequestTabCreate: subscribeFns.get('ui.onRequestTabCreate'),
      onRequestTabSetProfile: subscribeFns.get('ui.onRequestTabSetProfile'),
      onRequestTabClose: subscribeFns.get('ui.onRequestTabClose'),
      replyTabCreate,
      replyTabSetProfile,
      replyTabClose
    }
  }
  ;(window as unknown as Record<string, unknown>).api = api
}

function emitRequestTabCreate(data: { requestId: string; url: string; worktreeId?: string }): void {
  const handlers = listenersByChannel.get('ui.onRequestTabCreate') ?? []
  for (const handler of handlers) {
    handler(data as never)
  }
}

describe('useBrowserIpcEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.activeWorktreeId = null
    storeState.activeBrowserTabId = null
    storeState.activeBrowserTabIdByWorktree = {}
    storeState.browserTabsByWorktree = {}
    storeState.browserPagesByWorkspace = {}
    installWindowApi()
  })

  describe('onRequestTabCreate', () => {
    it('replies an error when no worktree is resolvable', () => {
      renderHook(() => useBrowserIpcEvents())
      storeState.activeWorktreeId = null
      emitRequestTabCreate({ requestId: 'r1', url: 'https://example.com' })
      expect(replyTabCreate).toHaveBeenCalledWith({
        requestId: 'r1',
        error: expect.any(String)
      })
      expect(storeState.createBrowserTab).not.toHaveBeenCalled()
    })

    it('creates the tab and replies with the browser page id', () => {
      renderHook(() => useBrowserIpcEvents())
      storeState.activeWorktreeId = 'session-1'
      storeState.createBrowserTab.mockReturnValue({ id: 'workspace-1' })
      storeState.browserPagesByWorkspace = { 'workspace-1': [{ id: 'page-1' }] }

      emitRequestTabCreate({ requestId: 'r2', url: 'https://example.com' })

      expect(storeState.createBrowserTab).toHaveBeenCalledWith(
        'session-1',
        'https://example.com',
        expect.objectContaining({ title: 'https://example.com', activate: false })
      )
      expect(replyTabCreate).toHaveBeenCalledWith({
        requestId: 'r2',
        browserPageId: 'page-1'
      })
    })

    it('replies the error message when the handler throws', () => {
      renderHook(() => useBrowserIpcEvents())
      storeState.activeWorktreeId = 'session-1'
      storeState.createBrowserTab.mockImplementation(() => {
        throw new Error('boom')
      })

      emitRequestTabCreate({ requestId: 'r3', url: 'https://example.com' })

      expect(replyTabCreate).toHaveBeenCalledWith({ requestId: 'r3', error: 'boom' })
    })
  })

  it('does not accumulate listeners across mount/unmount cycles', () => {
    const first = renderHook(() => useBrowserIpcEvents())
    for (const channel of CHANNELS) {
      expect(listenersByChannel.get(channel)).toHaveLength(1)
    }

    first.unmount()
    for (const channel of CHANNELS) {
      expect(listenersByChannel.get(channel)).toHaveLength(0)
    }

    renderHook(() => useBrowserIpcEvents())
    for (const channel of CHANNELS) {
      expect(listenersByChannel.get(channel)).toHaveLength(1)
    }
    expect(subscribeFns.get('ui.onRequestTabCreate')).toHaveBeenCalledTimes(2)
  })
})
