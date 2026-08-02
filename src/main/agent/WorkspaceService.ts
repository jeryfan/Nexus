import type { CacheService } from '@main/data/CacheService'
import { mkdir, rm, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { BrowserWindow, dialog, shell } from 'electron'

const RECENT_WORKSPACE_CACHE_KEY = 'agent.lastWorkspace'

/** Workspace (agent cwd) selection: native directory dialog + last-used persistence. */
export class WorkspaceService {
  constructor(private readonly cache: CacheService) {}

  /** 对话独立工作区的根目录（~/Documents/.nexus/chats，应用托管） */
  chatsRoot(): string {
    return join(homedir(), 'Documents', '.nexus', 'chats')
  }

  /**
   * 为对话创建独立工作区目录（chats/<uuid>）并返回路径。
   * 目录由应用托管：删除对话时随 {@link removeChatWorkspace} 回收。
   */
  async createChatWorkspace(): Promise<string> {
    const dir = join(this.chatsRoot(), randomUUID())
    await mkdir(dir, { recursive: true })
    return dir
  }

  /** 回收对话工作区目录（仅允许 chats 根目录下的直接子目录，防误删用户目录） */
  async removeChatWorkspace(cwd: string): Promise<void> {
    const root = resolve(this.chatsRoot())
    const target = resolve(cwd)
    if (dirname(target) !== root) {
      throw new Error(`Not a chat workspace: ${cwd}`)
    }
    await rm(target, { recursive: true, force: true })
  }

  async pick(defaultPath?: string): Promise<{ path: string } | null> {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog({
      ...(window ? { parent: window } : {}),
      defaultPath: defaultPath ?? this.cache.get<string>(RECENT_WORKSPACE_CACHE_KEY),
      properties: ['openDirectory', 'createDirectory']
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    this.cache.set(RECENT_WORKSPACE_CACHE_KEY, path)
    return { path }
  }

  /** 在系统文件管理器中显示项目目录（校验：存在的目录）。 */
  async reveal(targetPath: string): Promise<void> {
    const resolved = resolve(targetPath)
    const info = await stat(resolved)
    if (!info.isDirectory()) {
      throw new Error(`Not a directory: ${targetPath}`)
    }
    shell.showItemInFolder(resolved)
  }

  getRecent(): { path: string } | null {
    const path = this.cache.get<string>(RECENT_WORKSPACE_CACHE_KEY)
    return path ? { path } : null
  }
}
