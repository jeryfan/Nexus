import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultWorkspaceSession } from '../../shared/browser/constants'
import type { BrowserWorkspace, WorkspaceSessionState } from '../../shared/browser/types'
import { BrowserSessionStore } from './browser-session-store'

const electronMock = vi.hoisted(() => ({
  userData: '',
  getPath: vi.fn(() => electronMock.userData)
}))

vi.mock('electron', () => ({
  app: { getPath: electronMock.getPath }
}))

function makeBrowserWorkspace(overrides: Partial<BrowserWorkspace> = {}): BrowserWorkspace {
  return {
    id: 'bw-1',
    worktreeId: 'wt-1',
    url: 'https://example.com/',
    title: 'Example',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1,
    ...overrides
  }
}

function makeSession(overrides: Partial<WorkspaceSessionState> = {}): WorkspaceSessionState {
  return { ...getDefaultWorkspaceSession(), ...overrides }
}

describe('BrowserSessionStore', () => {
  let dir: string
  let dataFile: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexus-browser-session-store-'))
    dataFile = join(dir, 'nexus-browser-session.json')
    electronMock.userData = dir
    electronMock.getPath.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('patch 浅合并顶层字段并在 flush 后落盘读回', () => {
    const store = new BrowserSessionStore(dataFile)
    store.patchWorkspaceSession({ activeWorktreeId: 'wt-1' })
    store.patchWorkspaceSession({
      browserTabsByWorktree: { 'wt-1': [makeBrowserWorkspace()] }
    })
    store.flushOrThrow()

    const reloaded = new BrowserSessionStore(dataFile)
    const session = reloaded.getWorkspaceSession()
    expect(session.activeWorktreeId).toBe('wt-1')
    expect(session.browserTabsByWorktree?.['wt-1']).toHaveLength(1)
    expect(session.browserTabsByWorktree?.['wt-1']?.[0]?.url).toBe('https://example.com/')
  })

  it('patch 防抖窗口内合并多次写入', () => {
    vi.useFakeTimers()
    const store = new BrowserSessionStore(dataFile)
    store.patchWorkspaceSession({ activeWorktreeId: 'wt-1' })
    store.patchWorkspaceSession({ activeWorktreeId: 'wt-2' })

    vi.advanceTimersByTime(149)
    expect(existsSync(dataFile)).toBe(false)

    vi.advanceTimersByTime(1)
    expect(existsSync(dataFile)).toBe(true)
    const written = JSON.parse(readFileSync(dataFile, 'utf8')) as WorkspaceSessionState
    expect(written.activeWorktreeId).toBe('wt-2')
  })

  it('持续 patch 流下落盘有 max-wait 上限，不被防抖无限推迟', () => {
    vi.useFakeTimers()
    const store = new BrowserSessionStore(dataFile)
    store.patchWorkspaceSession({ activeWorktreeId: 'wt-0' })
    // 每 100ms 一次 patch，始终处于 150ms 防抖窗口内；无 max-wait 时永不落盘
    for (let i = 1; i <= 49; i++) {
      vi.advanceTimersByTime(100)
      store.patchWorkspaceSession({ activeWorktreeId: `wt-${i}` })
    }
    expect(existsSync(dataFile)).toBe(false)

    // t=5000ms 触达 SAVE_MAX_WAIT_MS，立即 flush
    vi.advanceTimersByTime(100)
    expect(existsSync(dataFile)).toBe(true)
    const written = JSON.parse(readFileSync(dataFile, 'utf8')) as WorkspaceSessionState
    expect(written.activeWorktreeId).toBe('wt-49')
  })

  it('set 全量替换语义：未出现在新状态里的字段不保留', () => {
    const store = new BrowserSessionStore(dataFile)
    store.setWorkspaceSession(
      makeSession({
        activeWorktreeId: 'wt-1',
        browserTabsByWorktree: { 'wt-1': [makeBrowserWorkspace()] }
      })
    )
    store.flushOrThrow()

    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-2' }))
    store.flushOrThrow()

    const reloaded = new BrowserSessionStore(dataFile)
    expect(reloaded.getWorkspaceSession().activeWorktreeId).toBe('wt-2')
    expect(reloaded.getWorkspaceSession().browserTabsByWorktree).toEqual({})
  })

  it('主文件损坏时从 .bak.0 恢复（.bak.0 为最近一次成功写入的快照）', () => {
    const store = new BrowserSessionStore(dataFile)
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-backup' }))
    store.flushOrThrow()
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-latest' }))
    store.flushOrThrow()

    writeFileSync(dataFile, 'not json{{{', 'utf8')

    const reloaded = new BrowserSessionStore(dataFile)
    expect(reloaded.getWorkspaceSession().activeWorktreeId).toBe('wt-latest')
  })

  it('主文件与 .bak.0 都损坏时回退 .bak.1', () => {
    const store = new BrowserSessionStore(dataFile)
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-oldest' }))
    store.flushOrThrow()
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-latest' }))
    store.flushOrThrow()

    writeFileSync(dataFile, 'not json{{{', 'utf8')
    writeFileSync(`${dataFile}.bak.0`, '{"foo": 1}', 'utf8')

    const reloaded = new BrowserSessionStore(dataFile)
    expect(reloaded.getWorkspaceSession().activeWorktreeId).toBe('wt-oldest')
  })

  it('主文件与备份都不可用时回退默认空态', () => {
    writeFileSync(dataFile, '{"foo": 1}', 'utf8')

    const reloaded = new BrowserSessionStore(dataFile)
    expect(reloaded.getWorkspaceSession()).toEqual(getDefaultWorkspaceSession())
  })

  it('备份轮换在写盘后进行：.bak.0 镜像最新写入，.bak.1 保留上一代', () => {
    const store = new BrowserSessionStore(dataFile)
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-1' }))
    store.flushOrThrow()
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-2' }))
    store.flushOrThrow()
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-3' }))
    store.flushOrThrow()

    const bak0 = JSON.parse(readFileSync(`${dataFile}.bak.0`, 'utf8')) as WorkspaceSessionState
    const bak1 = JSON.parse(readFileSync(`${dataFile}.bak.1`, 'utf8')) as WorkspaceSessionState
    expect(bak0.activeWorktreeId).toBe('wt-3')
    expect(bak1.activeWorktreeId).toBe('wt-2')
  })

  it('flush() 吞磁盘错误仅记录日志，flushOrThrow() 照常抛出', () => {
    // dataFile 指向一个已存在的目录：tmp 写入可成功，但 rename 到目录必然失败（EISDIR/EPERM）
    const store = new BrowserSessionStore(dir)
    store.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-1' }))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => store.flushOrThrow()).toThrow()
      expect(() => store.flush()).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('patch 含 browserUrlHistory 时按 nexus 语义剪枝（归一化去重、保留最近访问）', () => {
    const store = new BrowserSessionStore(dataFile)
    store.patchWorkspaceSession({
      browserUrlHistory: [
        {
          url: 'https://Example.com/path',
          normalizedUrl: 'https://example.com/path',
          title: 'Old',
          lastVisitedAt: 100,
          visitCount: 1
        },
        {
          url: 'https://example.com/path',
          normalizedUrl: 'https://example.com/path',
          title: 'New',
          lastVisitedAt: 200,
          visitCount: 2
        }
      ]
    })

    const history = store.getWorkspaceSession().browserUrlHistory
    expect(history).toHaveLength(1)
    expect(history?.[0]?.title).toBe('New')
    expect(history?.[0]?.lastVisitedAt).toBe(200)
  })

  it('懒初始化单例：import 不触达 app.getPath，默认路径在 userData 下', async () => {
    vi.resetModules()
    const mod = await import('./browser-session-store')

    expect(electronMock.getPath).not.toHaveBeenCalled()

    const a = mod.getBrowserSessionStore()
    const b = mod.getBrowserSessionStore()
    expect(a).toBe(b)
    expect(electronMock.getPath).toHaveBeenCalledWith('userData')

    a.setWorkspaceSession(makeSession({ activeWorktreeId: 'wt-singleton' }))
    a.flushOrThrow()
    const written = JSON.parse(
      readFileSync(join(dir, 'nexus-browser-session.json'), 'utf8')
    ) as WorkspaceSessionState
    expect(written.activeWorktreeId).toBe('wt-singleton')
  })
})
