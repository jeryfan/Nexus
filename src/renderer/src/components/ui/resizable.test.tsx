// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { Group, Panel } from 'react-resizable-panels'
import { afterEach, describe, expect, it } from 'vitest'

import { ResizeDragOverlay, ResizableSeparator, useResizeDragStore } from './resizable'

// ResizeObserver 强制 no-op（同 agent-page-mount.test.tsx）：库从 element.ownerDocument.defaultView
// 取构造函数，happy-dom 自带实现的回调时机与零尺寸不可控，统一替换为空实现
class NoopResizeObserver {
  observe = (): void => {}
  unobserve = (): void => {}
  disconnect = (): void => {}
}
globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver
if (document.defaultView) {
  ;(document.defaultView as unknown as Record<string, unknown>).ResizeObserver = NoopResizeObserver
}

afterEach(() => {
  cleanup()
  act(() => useResizeDragStore.getState().end())
})

describe('useResizeDragStore', () => {
  it('begin/end 切换 dragging 状态', () => {
    expect(useResizeDragStore.getState().dragging).toBe(false)
    act(() => useResizeDragStore.getState().begin())
    expect(useResizeDragStore.getState().dragging).toBe(true)
    act(() => useResizeDragStore.getState().end())
    expect(useResizeDragStore.getState().dragging).toBe(false)
  })
})

describe('ResizeDragOverlay', () => {
  it('仅拖拽期间渲染全屏透明遮罩', () => {
    const { container } = render(<ResizeDragOverlay />)
    expect(container.firstChild).toBeNull()
    act(() => useResizeDragStore.getState().begin())
    expect(container.firstChild).not.toBeNull()
    act(() => useResizeDragStore.getState().end())
    expect(container.firstChild).toBeNull()
  })
})

describe('ResizableSeparator', () => {
  it('拖拽中中线切换为高亮（全屏遮罩盖住分隔条、hover 丢失时保持反馈）', () => {
    const { container } = render(
      <Group>
        <Panel />
        <ResizableSeparator />
        <Panel />
      </Group>
    )
    const line = container.querySelector('.w-px')
    expect(line, '分隔条中线未渲染').not.toBeNull()
    expect(line?.classList.contains('bg-border')).toBe(true)

    act(() => useResizeDragStore.getState().begin())
    expect(line?.classList.contains('bg-primary/40')).toBe(true)
    expect(line?.classList.contains('bg-border')).toBe(false)

    act(() => useResizeDragStore.getState().end())
    expect(line?.classList.contains('bg-border')).toBe(true)
  })
})
