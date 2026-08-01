import { validateSender } from '@main/core/security/validateSender'
import type {
  MenuAnchor,
  NativePopupMenuItem,
  NativePopupMenuModel,
  NativePopupMenuResult
} from '@shared/types/command'
import { IpcChannel } from '@shared/IpcChannel'
import { BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'

function toTemplate(
  items: NativePopupMenuItem[],
  select: (result: NativePopupMenuResult) => void
): MenuItemConstructorOptions[] {
  return items.map((item) => {
    if (item.type === 'separator') return { type: 'separator' }
    if (item.type === 'submenu') {
      return {
        label: item.label,
        enabled: item.enabled,
        submenu: toTemplate(item.children, select)
      }
    }

    const result: NativePopupMenuResult =
      item.type === 'command'
        ? { type: 'command', command: item.command }
        : { type: 'custom', id: item.id }

    return {
      label: item.label,
      enabled: item.enabled,
      ...(item.checked !== undefined ? { type: 'checkbox' as const, checked: item.checked } : {}),
      ...(item.accelerator ? { accelerator: item.accelerator } : {}),
      click: () => select(result)
    }
  })
}

export function registerNativeCommandMenu(): () => void {
  ipcMain.handle(
    IpcChannel.NativeCommandPopupMenu_Show,
    (event, model: NativePopupMenuModel, anchor?: MenuAnchor) => {
      if (!validateSender(event)) {
        throw new Error('Rejected native command menu request from untrusted sender')
      }

      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return undefined

      return new Promise<NativePopupMenuResult | undefined>((resolve) => {
        let settled = false
        const settle = (result?: NativePopupMenuResult): void => {
          if (settled) return
          settled = true
          resolve(result)
        }
        const menu = Menu.buildFromTemplate(toTemplate(model.items, settle))
        menu.popup({
          window,
          ...(anchor?.x !== undefined ? { x: anchor.x } : {}),
          ...(anchor?.y !== undefined ? { y: anchor.y } : {}),
          callback: () => settle()
        })
      })
    }
  )

  return () => ipcMain.removeHandler(IpcChannel.NativeCommandPopupMenu_Show)
}
