// @vitest-environment happy-dom
// 挂载语义回归（对齐旧实现）：面板开合不得重挂载对话区，最大化切换不得重挂载对话区
// 与面板——重挂载会丢失滚动位置/焦点，且内置浏览器 <webview> guest 的 DOM 父节点被移除
// 即销毁（见 browser-page-viewport.ts）。
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { AgentPage } from './AgentPage'
import { useAgentStore } from './agentStore'

// ResizeObserver 兜底：react-resizable-panels 的 Group 从 element.ownerDocument.defaultView
// 取构造函数，测试环境缺失时补最小实现（happy-dom 自带则不覆盖）。
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never

// 真实组件依赖 agent runtime / Monaco / webview 注册表，本测试只验证挂载语义，用 marker 隔离。
vi.mock('./AgentThread', () => ({
  AgentHeader: () => null,
  AgentThread: () => <div data-testid="thread-marker" />
}))
vi.mock('./ProjectPanel', () => ({
  ProjectPanel: () => <div data-testid="panel-marker" />
}))

describe('AgentPage 面板开合/最大化挂载语义', () => {
  let agentSnapshot: ReturnType<typeof useAgentStore.getState>
  let panelSnapshot: ReturnType<typeof useProjectPanelStore.getState>

  beforeEach(() => {
    agentSnapshot = useAgentStore.getState()
    panelSnapshot = useProjectPanelStore.getState()
    // 草稿会话是 selectActiveCwd 非空的最简路径：activeSessionId === draft.id 时返回 draft.cwd
    useAgentStore.setState({
      draft: { id: 'draft:test', cwd: '/tmp/project' },
      activeSessionId: 'draft:test'
    })
    useProjectPanelStore.setState({ open: false, maximized: false })
  })

  afterEach(() => {
    cleanup()
    // replace=true 整体还原测试前快照
    useAgentStore.setState(agentSnapshot, true)
    useProjectPanelStore.setState(panelSnapshot, true)
  })

  it('面板开合/最大化切换不重挂载对话区与面板', () => {
    render(<AgentPage />)

    const threadMarker = screen.getByTestId('thread-marker')
    expect(screen.queryByTestId('panel-marker')).toBeNull()

    // 打开面板：对话区保持同一 DOM 节点，面板挂载
    act(() => {
      useProjectPanelStore.setState({ open: true })
    })
    expect(screen.getByTestId('thread-marker')).toBe(threadMarker)
    expect(screen.getByTestId('panel-marker')).toBeTruthy()

    // 最大化：对话区与面板均不重挂载；对话区包裹层以 hidden 类隐藏（display:none 保留状态）
    act(() => {
      useProjectPanelStore.setState({ maximized: true })
    })
    expect(screen.getByTestId('thread-marker')).toBe(threadMarker)
    expect(screen.getByTestId('panel-marker')).toBeTruthy()
    const conversationWrapper = threadMarker.closest('.bg-background')
    expect(conversationWrapper).not.toBeNull()
    expect(conversationWrapper?.classList.contains('hidden')).toBe(true)

    // 还原：hidden 类移除，仍是同一节点
    act(() => {
      useProjectPanelStore.setState({ maximized: false })
    })
    expect(screen.getByTestId('thread-marker')).toBe(threadMarker)
    expect(conversationWrapper?.classList.contains('hidden')).toBe(false)

    // 收起面板：面板卸载，对话区仍是同一节点
    act(() => {
      useProjectPanelStore.setState({ open: false })
    })
    expect(screen.getByTestId('thread-marker')).toBe(threadMarker)
    expect(screen.queryByTestId('panel-marker')).toBeNull()
  })
})
