// @vitest-environment happy-dom
// 挂载语义回归（对齐旧实现）：面板开合不得重挂载对话区，最大化切换不得重挂载对话区
// 与面板——重挂载会丢失滚动位置/焦点，且内置浏览器 <webview> guest 的 DOM 父节点被移除
// 即销毁（见 browser-page-viewport.ts）。
// 注意：happy-dom 布局恒为 0，库的约束推导（groupSize = Σ panel.offsetWidth）会降级，
// 故测试以固定像素 patch offsetWidth/offsetLeft/DOMRect，断言真实布局百分比；
// 真实浏览器渲染效果另由 Task 5 宽窗口手工验收覆盖。
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { AgentPage } from './AgentPage'
import { useAgentStore } from './agentStore'

// ResizeObserver 强制 no-op：库从 element.ownerDocument.defaultView 取构造函数；
// happy-dom 自带实现的回调时机与零尺寸不可控，统一替换为空实现——初始布局来自
// defaultSize + 约束推导，不依赖 RO 回调。
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver
if (document.defaultView) {
  ;(document.defaultView as unknown as Record<string, unknown>).ResizeObserver = NoopResizeObserver
}

// 真实像素尺寸：happy-dom 布局恒为 0，库的约束推导（groupSize = Σ panel.offsetWidth）
// 会降级为 maxSize:100 假约束，测不出折叠截断。按 panel id 固定像素
// （thread 820 + project 320 = group 1140），使 defaultSize/minSize/maxSize 按真实像素折算。
const PANEL_PIXEL_WIDTHS: Record<string, number> = { thread: 820, project: 320 }
const PANEL_PIXEL_LEFTS: Record<string, number> = { thread: 0, project: 828 }
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get(this: HTMLElement) {
    return PANEL_PIXEL_WIDTHS[this.id] ?? 0
  }
})
// offsetLeft 供库的 panel 排序（DOM 顺序推导）使用
Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
  configurable: true,
  get(this: HTMLElement) {
    return PANEL_PIXEL_LEFTS[this.id] ?? 0
  }
})
// DOMRect 对齐 offsetWidth/offsetLeft（库的命中检测/拖拽路径读 getBoundingClientRect）
HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
  return {
    x: this.offsetLeft,
    y: 0,
    left: this.offsetLeft,
    right: this.offsetLeft + this.offsetWidth,
    top: 0,
    bottom: 0,
    width: this.offsetWidth,
    height: 0,
    toJSON: () => ({})
  } as DOMRect
}

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
    const panelMarker = screen.getByTestId('panel-marker')

    // 最大化：对话区与面板均不重挂载；对话区包裹层以 hidden 类隐藏（display:none 保留状态）
    act(() => {
      useProjectPanelStore.setState({ maximized: true })
    })
    expect(screen.getByTestId('thread-marker')).toBe(threadMarker)
    expect(screen.getByTestId('panel-marker')).toBe(panelMarker)
    const conversationWrapper = threadMarker.closest('.bg-background')
    expect(conversationWrapper).not.toBeNull()
    expect(conversationWrapper?.classList.contains('hidden')).toBe(true)

    // 还原：hidden 类移除，对话区与面板仍是同一节点
    act(() => {
      useProjectPanelStore.setState({ maximized: false })
    })
    expect(screen.getByTestId('thread-marker')).toBe(threadMarker)
    expect(screen.getByTestId('panel-marker')).toBe(panelMarker)
    expect(conversationWrapper?.classList.contains('hidden')).toBe(false)

    // 收起面板：面板卸载，对话区仍是同一节点
    act(() => {
      useProjectPanelStore.setState({ open: false })
    })
    expect(screen.getByTestId('thread-marker')).toBe(threadMarker)
    expect(screen.queryByTestId('panel-marker')).toBeNull()
  })

  /** 读取库渲染出的 Panel 元素 flexGrow（布局百分比）；容差 ±1（复核约定） */
  const expectGrow = (panelId: string, expected: number): void => {
    const el = document.getElementById(panelId)
    expect(el, `panel #${panelId} 未渲染`).not.toBeNull()
    const grow = Number.parseFloat(el?.style.flexGrow ?? '')
    expect(
      Math.abs(grow - expected),
      `#${panelId} flexGrow=${grow}，期望≈${expected}`
    ).toBeLessThanOrEqual(1)
  }

  /** setTimeout 0 的 collapse/expand 在约束更新 commit 之后才执行，等待落盘 */
  const flushMacrotask = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  it('像素布局：开合恢复默认布局，最大化完全折叠，还原回到折叠前尺寸', async () => {
    // 面板展开态渲染：group=820+320=1140px，project defaultSize=320px → 71.9% / 28.1%
    useProjectPanelStore.setState({ open: true })
    render(<AgentPage />)
    expectGrow('thread', 71.9)
    expectGrow('project', 28.1)

    // 收起再打开：无用户交互不记忆布局，默认布局恢复
    act(() => {
      useProjectPanelStore.setState({ open: false })
    })
    act(() => {
      useProjectPanelStore.setState({ open: true })
    })
    expectGrow('thread', 71.9)
    expectGrow('project', 28.1)

    // 最大化：thread 折叠到 0、project 占满（maxSize 已解除，不被 640px 截断）
    await act(async () => {
      useProjectPanelStore.setState({ maximized: true })
      await flushMacrotask()
    })
    expectGrow('thread', 0)
    expectGrow('project', 100)

    // 还原：expand() 回到折叠前尺寸
    await act(async () => {
      useProjectPanelStore.setState({ maximized: false })
      await flushMacrotask()
    })
    expectGrow('thread', 71.9)
    expectGrow('project', 28.1)
  })
})
