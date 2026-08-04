// 宿主能力封装（clipboard / shell / zoom）。
// Nexus 渲染层无 nodeIntegration：剪贴板用 Chromium 异步剪贴板 API（FilePreviewPanel 已用
// navigator.clipboard.writeText 的先例），窗口缩放 Nexus 未启用恒为 0，shell 打开类操作
// 走 ipcApi 通用路由（shell 域，见 src/shared/shell/schemas.ts）。
import { ipcApi } from '@renderer/ipc/ipcApi'

/** 写入剪贴板文本。 */
export async function writeClipboardText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/** 写入剪贴板图片（dataUrl → PNG blob → 异步剪贴板）。 */
export async function writeClipboardImage(dataUrl: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

/** 获取窗口缩放级别。Nexus 渲染层无 Node integration，经 preload webFrame 暴露
 *  （见 src/preload/index.ts ui.getZoomLevel）；preload 不可用时回退 0（zoomFactor 1）。 */
export function getZoomLevel(): number {
  return window.api?.ui?.getZoomLevel?.() ?? 0
}

/** 系统默认浏览器打开外部 URL（仅 http/https）。 */
export async function openUrl(url: string): Promise<void> {
  await ipcApi.request('shell.openUrl', { url })
}

/** 默认应用打开下载文件，返回是否成功。 */
export async function openFilePath(path: string): Promise<boolean> {
  return ipcApi.request('shell.openFilePath', { path })
}

/** 文件管理器定位文件。 */
export async function openInFileManager(
  path: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return ipcApi.request('shell.openInFileManager', { path })
}
