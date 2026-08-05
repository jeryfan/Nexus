// Glue for Nexus: ref-counted "frames critical" lease for browser guests.
// Upstream kept background throttling disabled for every guest so hidden tabs
// could still produce frames for screenshots/automation; that kept every
// background page's timers/rAF running at full speed. Nexus keeps Chromium's
// default (throttling on) and unthrottles a guest only while something needs
// its compositor frames: a CDP debugger lease (automation proxy / screencast)
// or an automation-visibility wait. See attachGuestPolicies /
// acquireAutomationVisibility in browser-manager.ts and
// electron-debugger-lease.ts for the holders.
import type { WebContents } from 'electron'

const frameLeaseCounts = new WeakMap<WebContents, number>()

// Test doubles model a minimal WebContents; real Electron always provides both
// methods, so throttling control degrades to a no-op when they are absent.
function canToggleThrottling(webContents: WebContents): boolean {
  return (
    typeof webContents.getBackgroundThrottling === 'function' &&
    typeof webContents.setBackgroundThrottling === 'function'
  )
}

/** Mark a guest as needing frames; restores background throttling when the
 *  last lease is released. Safe to call for visible guests (no-op change). */
export function acquireGuestFrameLease(webContents: WebContents): () => void {
  if (webContents.isDestroyed()) {
    return () => {}
  }
  const count = frameLeaseCounts.get(webContents) ?? 0
  if (count === 0 && canToggleThrottling(webContents) && webContents.getBackgroundThrottling()) {
    webContents.setBackgroundThrottling(false)
  }
  frameLeaseCounts.set(webContents, count + 1)

  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    if (webContents.isDestroyed()) {
      return
    }
    const next = (frameLeaseCounts.get(webContents) ?? 1) - 1
    if (next > 0) {
      frameLeaseCounts.set(webContents, next)
      return
    }
    frameLeaseCounts.delete(webContents)
    if (canToggleThrottling(webContents)) {
      webContents.setBackgroundThrottling(true)
    }
  }
}
