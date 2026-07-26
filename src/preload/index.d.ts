import { ElectronAPI } from '@electron-toolkit/preload'

interface NexusApi {
  isFullscreen: () => Promise<boolean>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: NexusApi
  }
}
