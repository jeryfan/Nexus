import { validateSender } from '@main/core/security/validateSender'
import type { CacheEntry, CacheSyncMessage } from '@shared/data/cache/cacheTypes'
import { IpcChannel } from '@shared/IpcChannel'
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'

/**
 * Small cache boundary for the retained model service. It keeps the old
 * renderer cache protocol intact and supplies ProviderService's API-key
 * round-robin state without bringing over the old app-wide cache subsystem.
 */
export class CacheService {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly sharedCache = new Map<string, CacheEntry>()

  private readonly onSync = (event: IpcMainEvent, message: CacheSyncMessage): void => {
    if (!validateSender(event)) return

    if (message.type === 'shared') {
      if (message.value === undefined) {
        this.sharedCache.delete(message.key)
      } else {
        this.sharedCache.set(message.key, {
          value: message.value,
          expireAt: message.expireAt
        })
      }
    }

    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window.id !== senderWindow?.id) {
        window.webContents.send(IpcChannel.Cache_Sync, message)
      }
    }
  }

  constructor() {
    ipcMain.on(IpcChannel.Cache_Sync, this.onSync)
    ipcMain.handle(IpcChannel.Cache_GetAllShared, (event) => {
      if (!validateSender(event)) {
        throw new Error('Rejected cache request from untrusted sender')
      }
      return this.getAllShared()
    })
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (entry.expireAt && entry.expireAt <= Date.now()) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      expireAt: ttl ? Date.now() + ttl : undefined
    })
  }

  dispose(): void {
    ipcMain.removeListener(IpcChannel.Cache_Sync, this.onSync)
    ipcMain.removeHandler(IpcChannel.Cache_GetAllShared)
    this.cache.clear()
    this.sharedCache.clear()
  }

  private getAllShared(): Record<string, CacheEntry> {
    const now = Date.now()
    const entries: Record<string, CacheEntry> = {}
    for (const [key, entry] of this.sharedCache) {
      if (entry.expireAt && entry.expireAt <= now) {
        this.sharedCache.delete(key)
        continue
      }
      entries[key] = entry
    }
    return entries
  }
}
