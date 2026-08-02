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

function createWindow(): void {
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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
async function startApp(): Promise<void> {
  await app.whenReady()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

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
