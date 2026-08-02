import { getToastUtilities, type ToastLabels } from '@nexus/ui'

/**
 * services/toast — the notification track: non-blocking, auto-dismissing, no return
 * value. Reach for a toast to tell the user something happened. If you need them to
 * acknowledge before anything continues, that is a dialog — use services/popup
 * (confirm) instead; toasts never take focus and are easy to miss.
 *
 * Labels are supplied as a getter so every toast resolves the current language at
 * fire time (see @nexus/ui ToastLabelsInput). Every toast renders in the one
 * shared `defaultToastStore`, drained by each window's <ToastHost/>.
 */
const resolveToastLabels = (): Partial<ToastLabels> => ({
  close: '关闭',
  error: '错误',
  errorDescription: '未知错误',
  loading: '加载中...',
  success: '成功'
})

export const toast = getToastUtilities(resolveToastLabels)
