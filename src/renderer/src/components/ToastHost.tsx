import { ToastViewport } from '@nexus/ui'
import { useMemo } from 'react'

/**
 * ToastHost — a leaf, not a wrapper. Mount it as a sibling of the window content,
 * inside every provider, never wrapping children, one per window.
 * It renders the shared toast viewport with hardcoded Chinese labels; the imperative
 * `toast` object (services/toast) writes to the same defaultToastStore this viewport
 * drains. Wiring both to that one store is what fixes viewport-less windows where
 * the imperative toast used to vanish into a store nothing rendered.
 */
export default function ToastHost() {
  const labels = useMemo(
    () => ({
      close: '关闭',
      error: '错误',
      errorDescription: '未知错误',
      loading: '加载中...',
      success: '成功'
    }),
    []
  )

  return <ToastViewport labels={labels} />
}
