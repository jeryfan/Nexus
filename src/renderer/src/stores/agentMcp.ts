import { ipcApi } from '@renderer/ipc/ipcApi'
import { toast } from '@renderer/services/toast'
import type { McpServerDto } from '@shared/agent/types'
import { create } from 'zustand'

type BusyAction = 'toggle' | 'save' | 'remove'

interface AgentMcpState {
  servers: McpServerDto[]
  loading: boolean
  busy: Record<string, BusyAction>
  initialized: boolean

  initialize: () => Promise<void>
  refresh: () => Promise<void>
  setDisabled: (name: string, disabled: boolean) => Promise<void>
  save: (originalName: string | undefined, server: McpServerDto) => Promise<boolean>
  remove: (name: string) => Promise<boolean>
}

let eventsBound = false

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useAgentMcpStore = create<AgentMcpState>((set, get) => {
  const withBusy = async (
    key: string,
    action: BusyAction,
    task: () => Promise<void>
  ): Promise<void> => {
    set((state) => ({ busy: { ...state.busy, [key]: action } }))
    try {
      await task()
    } finally {
      set((state) => {
        const busy = { ...state.busy }
        delete busy[key]
        return { busy }
      })
    }
  }

  return {
    servers: [],
    loading: false,
    busy: {},
    initialized: false,

    initialize: async () => {
      if (get().initialized) return
      if (!eventsBound) {
        eventsBound = true
        ipcApi.on('agent.mcp.changed', () => void get().refresh())
      }
      set({ loading: true })
      try {
        await get().refresh()
        set({ initialized: true })
      } finally {
        set({ loading: false })
      }
    },

    refresh: async () => {
      const servers = await ipcApi.request('agent.mcp.list')
      set({ servers })
    },

    setDisabled: async (name, disabled) => {
      try {
        await withBusy(name, 'toggle', async () => {
          await ipcApi.request('agent.mcp.setDisabled', { name, disabled })
        })
        toast.success(disabled ? '已停用，将在新会话生效' : '已启用，将在新会话生效')
      } catch (error) {
        toast.error({ title: '操作失败', description: errorMessage(error) })
      }
    },

    save: async (originalName, server) => {
      try {
        await withBusy(server.name, 'save', async () => {
          await ipcApi.request('agent.mcp.save', {
            ...(originalName ? { originalName } : {}),
            server
          })
        })
        toast.success('已保存，将在新会话生效')
        return true
      } catch (error) {
        toast.error({ title: '保存失败', description: errorMessage(error) })
        return false
      }
    },

    remove: async (name) => {
      try {
        await withBusy(name, 'remove', async () => {
          await ipcApi.request('agent.mcp.remove', { name })
        })
        toast.success('已卸载，将在新会话生效')
        return true
      } catch (error) {
        toast.error({ title: '卸载失败', description: errorMessage(error) })
        return false
      }
    }
  }
})
