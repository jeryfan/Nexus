import { toast } from 'sonner'
import { translate } from '../../i18n'
import { writeClipboardImage } from '../../lib/browser-host'
import type { MarkupComposeResult } from './markup-screenshot-compose'

// Delivery for v1: copy the composited markup PNG to the clipboard, mirroring the
// browser grab "copy" flow. The user pastes it into their agent terminal, where
// the clipboard-screenshot paste writes the image to a temp file (on
// the correct host for local or remote/SSH agents) and hands the path to the TUI.
// This reuses proven, environment-agnostic machinery instead of re-plumbing a
// direct send.
export async function deliverMarkupToClipboard(result: MarkupComposeResult): Promise<void> {
  try {
    await writeClipboardImage(result.dataUrl)
  } catch (error) {
    // Glue for Nexus: 剪贴板写入失败不能向上抛成 unhandled rejection，toast 告知用户。
    console.warn('[browser] markup clipboard write failed', error)
    toast.error('Markup copy failed')
    return
  }
  const isMac = navigator.userAgent.includes('Mac')
  toast.success(
    translate(
      'auto.components.browser-pane.markup.copiedToast',
      'Markup copied — paste it into your agent ({{value0}})',
      { value0: isMac ? '⌘V' : 'Ctrl+V' }
    )
  )
}
