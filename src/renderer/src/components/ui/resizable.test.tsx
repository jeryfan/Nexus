// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ResizeDragOverlay, useResizeDragStore } from './resizable'

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
