import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { application } from '@application'
import { AiService } from '@main/ai/AiService'
import { loggerService } from '@logger'
import { CacheService } from '@main/data/CacheService'
import { DataApiService } from '@main/data/DataApiService'
import { DbService } from '@main/data/db/DbService'
import { PresetProviderSeeder } from '@main/data/db/seeding/seeders/presetProviderSeeder'
import { IpcApiService } from '@main/ipc/IpcApiService'
import { runPiSmoke } from '@main/agent/piSmoke'
import { AgentService } from '@main/agent'
import { registerNativeCommandMenu } from '@main/ipc/nativeCommandMenu'
import { installBrowserCliEnv } from '@main/browser/browser-cli-env'
import { browserCertificateTrustController, browserManager } from '@main/browser/browser-manager'
import { browserSessionRegistry } from '@main/browser/browser-session-registry'
import { initializeBrowserSessionsForApp } from '@main/browser/browser-session-startup'
import { flushLoadedBrowserSessionStore } from '@main/browser/browser-session-store'
import { registerBrowserSessionHandlers } from '@main/ipc/browser-session'
import {
  registerBrowserHandlers,
  setAgentBrowserBridgeRef,
  setTrustedBrowserRendererWebContentsId
} from '@main/ipc/browser'
import { AgentBrowserBridge } from '@main/browser/agent-browser-bridge'
import { NexusRuntimeService } from '@main/runtime/NexusRuntimeService'
import { NexusRuntimeRpcServer } from '@main/runtime/runtime-rpc'
import { clearRuntimeMetadataIfOwned } from '@main/runtime/runtime-metadata'
import { normalizeBrowserNavigationUrl } from '@shared/browser/browser-url'
import { NEXUS_BROWSER_GUEST_WEB_PREFERENCES } from '@shared/browser/browser-guest-web-preferences'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

const logger = loggerService.withContext('MainEntry')

let dbService: DbService | undefined
let cacheService: CacheService | undefined
let dataApiService: DataApiService | undefined
let ipcApiService: IpcApiService | undefined
let aiService: AiService | undefined
let agentService: AgentService | undefined
let disposeNativeCommandMenu: (() => void) | undefined
// 内置浏览器：模块级以便 activate 重建窗口时 createWindow() 仍能装配宿主，
// 且 will-quit 退出链可停掉 RPC server 并清理元数据
let nexusRuntime: NexusRuntimeService | undefined
let agentBrowserBridge: AgentBrowserBridge | undefined
let runtimeRpc: NexusRuntimeRpcServer | undefined

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // macOS 隐藏原生标题栏，内容延伸到窗口顶部；红绿灯位置与 48px 顶栏垂直居中对齐
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 18 } }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // 内置浏览器：渲染层通过 <webview> 承载 browser guest
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 全屏状态变化同步给渲染层（macOS 全屏时红绿灯隐藏，顶栏需调整布局）
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-changed', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window:fullscreen-changed', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Why: 兜底守卫——渲染层任何未被拦截的导航（聊天链接漏网、拖放等）都会把主窗口
  // 带离应用（白屏事故）。只放行渲染层自身来源，其余一律转系统浏览器。
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const rendererOrigin =
      is.dev && process.env['ELECTRON_RENDERER_URL'] ? process.env['ELECTRON_RENDERER_URL'] : null
    const allowed = rendererOrigin ? url.startsWith(rendererOrigin) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  // —— 内置浏览器 guest 策略（fail-closed）——
  // 注：sandboxed guest preload 必须是 CJS（electron-vite 5 的 preload 产物为 .mjs/ESM，sandboxed guest 中静默加载失败），
  // 因此它作为 main 构建的额外 rollup 入口输出到 out/main/（见 electron.vite.config.ts）
  const browserWindowClosePreload = join(__dirname, 'browser-window-close-preload.js')
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const src = typeof params.src === 'string' ? params.src : ''
    const normalizedSrc = normalizeBrowserNavigationUrl(src)
    const partition = typeof webPreferences.partition === 'string' ? webPreferences.partition : ''

    // Why: fail closed — deny any src or partition not in the registry allowlist so a renderer bug can't smuggle preload/Node into an unprivileged guest.
    if (!normalizedSrc || !browserSessionRegistry.isAllowedPartition(partition)) {
      event.preventDefault()
      return
    }

    delete params.preload
    // Why: preload runs in the page's main world before inline scripts can call window.close().
    webPreferences.preload = browserWindowClosePreload
    // Why: older Electron builds expose preloadURL alongside preload; delete both so the guest can't inherit the main preload bridge.
    delete (webPreferences as Record<string, unknown>).preloadURL
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.enableBlinkFeatures = ''
    webPreferences.disableBlinkFeatures = ''
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    // Why: force the browser guest policy even if host markup omits or misspells a preference.
    Object.assign(webPreferences, NEXUS_BROWSER_GUEST_WEB_PREFERENCES)
    // Why: keep the registry-validated partition so isolated session profiles use their own storage while other hardening stays intact.
    webPreferences.partition = partition
  })

  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    // Why: attach guest popup/nav policy at creation; waiting for renderer registration races target=_blank/early redirects past it.
    browserManager.attachGuestPolicies(guest)
  })

  // 内置浏览器：注册可信渲染层与宿主窗口。必须放在 createWindow() 内部——
  // macOS activate 重建窗口时 webContents.id 变化，否则 isTrustedBrowserRenderer
  // fail-closed 会拒绝重建窗口的全部 browser:* IPC。
  setTrustedBrowserRendererWebContentsId(mainWindow.webContents.id)
  nexusRuntime?.setMainWindow(mainWindow)
  // Why: 窗口销毁后宿主回调不得再返回它（getAvailableAuthoritativeWindow 按 null 处理）
  mainWindow.on('closed', () => {
    nexusRuntime?.setMainWindow(null)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
async function startApp(): Promise<void> {
  await app.whenReady()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 内置浏览器：注入 NEXUS_USER_DATA_PATH 并把 nexus CLI 前置进 PATH，
  // 让 pi agent 的 shell 子进程可直接调用 `nexus`（须早于任何 agent 会话创建）
  installBrowserCliEnv()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 查询窗口当前是否处于全屏
  ipcMain.handle('window:is-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? win.isFullScreen() : false
  })

  dbService = new DbService()
  cacheService = new CacheService()
  dataApiService = new DataApiService()
  ipcApiService = new IpcApiService()
  aiService = new AiService()

  application.set('DbService', dbService)
  application.set('CacheService', cacheService)
  application.set('AiService', aiService)

  agentService = new AgentService(cacheService)
  application.set('AgentService', agentService)
  // 异步初始化不阻塞窗口创建；失败时 agent 路由优雅降级
  void agentService.initialize()

  new PresetProviderSeeder().run(dbService.getDb())
  dataApiService.initialize()
  ipcApiService.initialize()
  aiService.initialize()
  disposeNativeCommandMenu = registerNativeCommandMenu()

  // US-001 packaging/rebrand smoke: NEXUS_PI_SMOKE=1 pnpm dev（或打包产物同环境变量启动）
  if (process.env.NEXUS_PI_SMOKE === '1') {
    void runPiSmoke()
  }
  // US-003/006 集成冒烟：NEXUS_AGENT_SMOKE=1
  if (process.env.NEXUS_AGENT_SMOKE === '1') {
    void import('@main/agent/agentSmoke').then((m) => m.runAgentSmoke())
  }
  // M1 包管理/内置包冒烟：NEXUS_PACKAGE_SMOKE=1
  if (process.env.NEXUS_PACKAGE_SMOKE === '1') {
    void import('@main/agent/packageSmoke').then((m) => m.runPackageSmoke())
  }

  // 内置浏览器：session 初始化（cookie 重放必须在首次 session.fromPartition 之前）
  initializeBrowserSessionsForApp()
  // 浏览器会话持久化 IPC（session:get/set/patch/flush/set-sync）
  registerBrowserSessionHandlers()
  // 内置浏览器 IPC（browser:* 通道，可信渲染层边界）
  registerBrowserHandlers()
  browserManager.setSettingsResolver(() => ({ keybindings: undefined }))

  // 内置浏览器：runtime RPC（CLI 控制面）+ agent 控制桥
  nexusRuntime = new NexusRuntimeService()
  agentBrowserBridge = new AgentBrowserBridge(browserManager)
  nexusRuntime.setAgentBrowserBridge(agentBrowserBridge)
  setAgentBrowserBridgeRef(agentBrowserBridge)
  runtimeRpc = new NexusRuntimeRpcServer({
    runtime: nexusRuntime,
    userDataPath: app.getPath('userData'),
    enableWebSocket: false
  })
  // Why: RPC 启动失败（socket 占用/权限/元数据写入）降级为无 CLI 控制面，桌面端自身不受影响
  void runtimeRpc.start().catch((error) => {
    logger.error('Failed to start runtime RPC server; CLI control plane disabled', error as Error)
  })
  // 决策：无显式 selector 的 browser 命令走 bridge 全局活跃 tab（browser:activeTabChanged
  // 由 Task 10 渲染层维护），不设主进程活跃会话回落，故无 browser:active-session-changed 通道

  app.on(
    'certificate-error',
    (event, webContents, url, error, certificate, callback, isMainFrame) => {
      browserCertificateTrustController.handleCertificateError({
        event,
        webContents,
        url,
        error,
        certificate,
        callback,
        isMainFrame
      })
    }
  )

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

startApp().catch((error) => {
  logger.error('Fatal startup error', error as Error)
  app.quit()
})

app.on('will-quit', () => {
  // 内置浏览器：销毁 agent 浏览器会话、注销 guest 状态监听
  void agentBrowserBridge?.destroyAllSessions()
  browserManager.setBrowserGuestStateChangedListener(null)
  // 浏览器会话落盘（仅记录日志不抛错；从未触碰 session 时为 no-op）
  flushLoadedBrowserSessionStore()
  // runtime RPC 退出链：pid/runtimeId 在任何 await 之前同步捕获，
  // 防止后续拆除路径中途置空；干净退出清掉自己拥有的元数据，
  // CLI 下次看到的是 not_running 而不是 stale_bootstrap
  const ownedPid = process.pid
  const ownedRuntimeId = nexusRuntime?.getRuntimeId()
  const rpcStopAndClear = runtimeRpc
    ? runtimeRpc
        .stop()
        .then(() => {
          if (ownedRuntimeId) {
            clearRuntimeMetadataIfOwned(app.getPath('userData'), ownedPid, ownedRuntimeId)
          }
        })
        .catch((error) => {
          logger.error('Failed to stop runtime RPC transport', error as Error)
        })
    : Promise.resolve()
  void rpcStopAndClear
  agentService?.dispose()
  aiService?.dispose()
  disposeNativeCommandMenu?.()
  ipcApiService?.dispose()
  dataApiService?.dispose()
  cacheService?.dispose()
  dbService?.close()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
