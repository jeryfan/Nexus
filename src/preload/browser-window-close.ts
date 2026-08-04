import { installBrowserWindowCloseGuard } from './browser-window-close-installation'
import type { ContextBridge } from 'electron'

// Why: raw require keeps the sandboxed preload standalone in the main-process CJS build.
// oxlint-disable-next-line typescript/no-require-imports -- sandboxed guest preload 必须以裸 require('electron') 保持独立（见上行注释）
const { contextBridge } = require('electron') as { contextBridge: ContextBridge }

contextBridge.executeInMainWorld({ func: installBrowserWindowCloseGuard })
