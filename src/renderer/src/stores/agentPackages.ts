import { ipcApi } from '@renderer/ipc/ipcApi'
import { toast } from '@renderer/services/toast'
import type { AgentPackageDto, AgentPackageUpdateDto } from '@shared/agent/types'
import { create } from 'zustand'

/** 行内进行中动作（source → 动作），用于按钮 loading 与禁用。 */
type BusyAction = 'install' | 'remove' | 'update' | 'toggle' | 'retry'

interface AgentPackagesState {
  packages: AgentPackageDto[]
  /** 有可用更新的包（checkUpdates 结果；内置钉版包天然不在其中） */
  updates: AgentPackageUpdateDto[]
  loading: boolean
  checkingUpdates: boolean
  busy: Record<string, BusyAction>
  initialized: boolean

  initialize: () => Promise<void>
  refresh: () => Promise<void>
  install: (source: string) => Promise<boolean>
  remove: (source: string) => Promise<void>
  update: (source?: string) => Promise<void>
  setEnabled: (source: string, enabled: boolean) => Promise<void>
  retryBuiltin: () => Promise<void>
}

let eventsBound = false

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useAgentPackagesStore = create<AgentPackagesState>((set, get) => {
  const withBusy = async (
    source: string,
    action: BusyAction,
    task: () => Promise<void>
  ): Promise<void> => {
    set((state) => ({ busy: { ...state.busy, [source]: action } }))
    try {
      await task()
    } finally {
      set((state) => {
        const busy = { ...state.busy }
        delete busy[source]
        return { busy }
      })
    }
  }

  const refreshUpdates = async (): Promise<void> => {
    set({ checkingUpdates: true })
    try {
      const updates = await ipcApi.request('agent.package.checkUpdates')
      set({ updates })
    } catch {
      // 更新检查失败（离线/npm 不可用等）不打扰用户：清空列表即可
      set({ updates: [] })
    } finally {
      set({ checkingUpdates: false })
    }
  }

  const bindEvents = (): void => {
    if (eventsBound) return
    eventsBound = true
    ipcApi.on('agent.package.changed', () => {
      void get().refresh()
      void refreshUpdates()
    })
  }

  return {
    packages: [],
    updates: [],
    loading: false,
    checkingUpdates: false,
    busy: {},
    initialized: false,

    initialize: async () => {
      if (get().initialized) return
      bindEvents()
      set({ loading: true })
      try {
        await get().refresh()
        set({ initialized: true })
      } finally {
        set({ loading: false })
      }
      // 更新检查走网络，慢且不阻塞首屏
      void refreshUpdates()
    },

    refresh: async () => {
      const packages = await ipcApi.request('agent.package.list')
      set({ packages })
    },

    install: async (source) => {
      try {
        await withBusy(source, 'install', async () => {
          await ipcApi.request('agent.package.install', { source })
        })
        toast.success(`已安装 ${source}，将在新会话生效`)
        return true
      } catch (error) {
        toast.error({ title: `安装失败：${source}`, description: errorMessage(error) })
        return false
      }
    },

    remove: async (source) => {
      try {
        await withBusy(source, 'remove', async () => {
          await ipcApi.request('agent.package.remove', { source })
        })
        toast.success(`已删除 ${source}，将在新会话生效`)
      } catch (error) {
        toast.error({ title: `删除失败：${source}`, description: errorMessage(error) })
      }
    },

    update: async (source) => {
      const key = source ?? '__all__'
      try {
        await withBusy(key, 'update', async () => {
          await ipcApi.request('agent.package.update', source ? { source } : {})
        })
        toast.success('更新完成，将在新会话生效')
      } catch (error) {
        toast.error({ title: '更新失败', description: errorMessage(error) })
      }
    },

    setEnabled: async (source, enabled) => {
      try {
        await withBusy(source, 'toggle', async () => {
          await ipcApi.request('agent.package.setEnabled', { source, enabled })
        })
        toast.success(enabled ? '已启用，将在新会话生效' : '已禁用，将在新会话生效')
      } catch (error) {
        toast.error({ title: '操作失败', description: errorMessage(error) })
      }
    },

    retryBuiltin: async () => {
      try {
        await withBusy('__builtin__', 'retry', async () => {
          await ipcApi.request('agent.package.retryBuiltin')
        })
      } catch (error) {
        toast.error({ title: '重试失败', description: errorMessage(error) })
      }
    }
  }
})
