import { ipcApi } from '@renderer/ipc/ipcApi'
import { toast } from '@renderer/services/toast'
import type { AgentSkillDto } from '@shared/agent/types'
import { create } from 'zustand'

interface AgentSkillsState {
  skills: AgentSkillDto[]
  loading: boolean
  /** 进行中的开关切换（filePath） */
  busy: Record<string, true>
  initialized: boolean

  initialize: () => Promise<void>
  refresh: () => Promise<void>
  setEnabled: (filePath: string, enabled: boolean) => Promise<void>
  reveal: (filePath: string) => Promise<void>
}

let eventsBound = false

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useAgentSkillsStore = create<AgentSkillsState>((set, get) => ({
  skills: [],
  loading: false,
  busy: {},
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    if (!eventsBound) {
      eventsBound = true
      ipcApi.on('agent.skill.changed', () => void get().refresh())
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
    const skills = await ipcApi.request('agent.skill.list')
    set({ skills })
  },

  setEnabled: async (filePath, enabled) => {
    set((state) => ({ busy: { ...state.busy, [filePath]: true } }))
    try {
      await ipcApi.request('agent.skill.setEnabled', { filePath, enabled })
      toast.success(enabled ? '已启用，将在新会话生效' : '已禁用，将在新会话生效')
    } catch (error) {
      toast.error({ title: '操作失败', description: errorMessage(error) })
    } finally {
      set((state) => {
        const busy = { ...state.busy }
        delete busy[filePath]
        return { busy }
      })
    }
  },

  reveal: async (filePath) => {
    await ipcApi.request('agent.skill.reveal', { filePath })
  }
}))
