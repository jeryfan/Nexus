// @vitest-environment happy-dom
// Glue for Nexus: I2 回归——关闭 browser 面板标签必须走 browser store（closeBrowserTab），
// 否则 BrowserWorkspace 残留 store、持久化后重启复活。断言：workspace 被移除 + 面板标签同步移除。
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowserPage, BrowserWorkspace } from '@shared/browser/types'
import { useAgentStore } from './agentStore'
import { ProjectPanel } from './ProjectPanel'
import { useBrowserStore } from '@renderer/stores/browser'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'

// 文件树/文件预览依赖 Monaco 与 IPC，非本测试关注点，隔离掉。
vi.mock('./files/explorer/FileTreeDock', () => ({
  FileTreeDock: () => null,
  FileTreeLayout: ({ children }: { children?: unknown }) => children ?? null,
  TreeToggleButton: () => null
}))
vi.mock('./files/preview/FilePreviewPanel', () => ({
  FilePreviewPanel: () => null
}))

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

describe('ProjectPanel browser tab close', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAgentStore.setState({ activeSessionId: 'session-1' })
    useBrowserStore.setState({
      activeWorktreeId: 'session-1',
      browserTabsByWorktree: { 'session-1': [workspaceFixture('ws-1', 'session-1')] },
      browserPagesByWorkspace: { 'ws-1': [pageFixture('ws-1', 'session-1')] },
      activeBrowserTabId: 'ws-1',
      activeBrowserTabIdByWorktree: { 'session-1': 'ws-1' }
    })
    // 激活非 browser 标签：browser 槽位保持 hidden（不挂载 BrowserPane，测试无需 window.api）。
    useProjectPanelStore.setState({
      open: true,
      tabs: [
        { id: 'review-1', type: 'review' },
        { id: 'ws-1', type: 'browser', label: 'Example' }
      ],
      activeTabId: 'review-1'
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('removes the BrowserWorkspace and the panel tab together', () => {
    render(<ProjectPanel />)

    const tabRoot = screen.getByText('Example').closest('.group')
    expect(tabRoot).not.toBeNull()
    fireEvent.click(within(tabRoot as HTMLElement).getByLabelText('关闭标签页'))

    // browser store：workspace/pages 均已移除
    expect(useBrowserStore.getState().browserTabsByWorktree['session-1'] ?? []).toHaveLength(0)
    expect(useBrowserStore.getState().browserPagesByWorkspace['ws-1']).toBeUndefined()
    // 面板标签：同步移除（slice 尾部 panelBridge.closeTab 闭环）
    expect(useProjectPanelStore.getState().tabs.some((t) => t.id === 'ws-1')).toBe(false)
    // 其余标签不受影响
    expect(useProjectPanelStore.getState().tabs.some((t) => t.id === 'review-1')).toBe(true)
  })
})
