import { unwrap } from '@shared/agent/api/result'
import { toast } from '@renderer/services/toast'
import type { AgentThinkingLevel, ProjectTreeNode } from '@shared/agent/api/AgentDataApi'
import type {
  AgentSessionEventPayload,
  AgentSessionMetaPayload,
  ImageInputDto,
  ModelInfoDto,
  ModelRefDto,
  SessionSummaryDto
} from '@shared/agent/types'
import { create } from 'zustand'

import { indexToolResults } from './converters'
import { applyAgentEvents, EMPTY_SESSION_STATE, type SessionState } from './eventReducer'
import { agentApi } from './services/agentApi'

/** 新会话草稿：仅存在于客户端，发出首条消息时才创建真实会话（materialize）。 */
interface DraftSession {
  /** `draft:` 前缀 id，与真实会话 id 区分 */
  id: string
  /** 用户显式选择的项目目录；null = 未选择（materialize 时用默认工作区） */
  cwd: string | null
}

interface AgentStore {
  /** 项目树（本地 DB 记录：工作区会话按项目分组，含排序/标志位） */
  projects: ProjectTreeNode[]
  /** 对话列表（本地 DB 记录：独立工作区会话，无项目） */
  chats: SessionSummaryDto[]
  /** 新会话草稿（同时最多一个；不进列表） */
  draft: DraftSession | null
  /** 当前激活会话（真实会话 id 或草稿 id） */
  activeSessionId: string | null
  /** 每会话运行态（消息/流式/工具 join 表），仅已打开（或草稿）的会话有记录 */
  sessionStates: Record<string, SessionState>
  /** 可用模型 */
  models: ModelInfoDto[]
  /** 当前激活会话的模型 */
  activeModel: ModelRefDto | null
  /** 当前选中模型的思考程度（reasoning effort）；模型不支持时为 undefined */
  activeEffort: string | undefined
  initialized: boolean

  initialize: () => Promise<void>

  /** 新会话按钮：创建草稿并激活；已有草稿时仅激活（去重，不产生空会话）
   *  cwd 传入时预选项目（项目行“项目下新建”入口） */
  createSession: (cwd?: string) => void
  activateDraft: () => void
  discardDraft: () => void
  setDraftCwd: (cwd: string | null) => void
  /** 草稿 → 真实会话：发出首条消息时调用，返回真实会话 id */
  materializeDraft: () => Promise<string | null>
  openSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  setPinned: (sessionId: string, pinned: boolean) => Promise<void>
  setArchived: (sessionId: string, archived: boolean) => Promise<void>
  setProjectPinned: (cwd: string, pinned: boolean) => Promise<void>
  setProjectRemoved: (cwd: string, removed: boolean) => Promise<void>
  archiveProjectSessions: (cwd: string) => Promise<void>
  sendPrompt: (text: string, images?: ImageInputDto[]) => Promise<void>
  /** 编辑历史用户消息并重发（经 navigateTree 分支） */
  editMessage: (timestamp: number, text: string) => Promise<void>
  abort: () => Promise<void>
  setModel: (ref: ModelRefDto) => Promise<void>
  /** 设置思考程度；undefined 表示不指定（交 pi 默认） */
  setEffort: (effort: string | undefined) => void

  applyEventBatch: (payload: AgentSessionEventPayload) => void
  applyMeta: (payload: AgentSessionMetaPayload) => void
}

function patchSessionState(
  states: Record<string, SessionState>,
  sessionId: string,
  patch: Partial<SessionState>
): Record<string, SessionState> {
  const current = states[sessionId] ?? EMPTY_SESSION_STATE
  return { ...states, [sessionId]: { ...current, ...patch } }
}

/** 将模型自带默认思考程度收敛到 UI 三档（low/medium/high）。 */
const EFFORT_CLAMP: Record<string, 'low' | 'medium' | 'high'> = {
  minimal: 'low',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'high',
  max: 'high'
}

/** reasoning 模型的默认思考程度：优先模型自带 defaultEffort，否则 medium；非 reasoning 返回 undefined。 */
function defaultEffortForModel(
  models: ModelInfoDto[],
  ref: ModelRefDto | null | undefined
): string | undefined {
  if (!ref) return undefined
  const model = models.find((m) => m.provider === ref.provider && m.modelId === ref.modelId)
  if (!model?.reasoning) return undefined
  return (model.defaultEffort && EFFORT_CLAMP[model.defaultEffort]) || 'medium'
}

/** 在项目树与对话列表中定位会话 */
function findSession(
  projects: ProjectTreeNode[],
  chats: SessionSummaryDto[],
  sessionId: string
): SessionSummaryDto | undefined {
  const chat = chats.find((s) => s.sessionId === sessionId)
  if (chat) return chat
  for (const project of projects) {
    const session = project.sessions.find((s) => s.sessionId === sessionId)
    if (session) return session
  }
  return undefined
}

/** 最近活跃的会话 id（对话与项目会话取 updatedAt 最大者） */
function latestSessionId(
  projects: ProjectTreeNode[],
  chats: SessionSummaryDto[]
): string | undefined {
  const candidates = [chats[0], projects[0]?.sessions[0]].filter(
    (s): s is SessionSummaryDto => s !== undefined
  )
  return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.sessionId
}

/**
 * 当前会话的工作目录：草稿返回 draft.cwd，真实会话从列表查找；无会话返回 null。
 */
export function selectActiveCwd(state: AgentStore): string | null {
  const { activeSessionId, draft, projects, chats } = state
  if (!activeSessionId) return null
  if (draft && activeSessionId === draft.id) return draft.cwd
  return findSession(projects, chats, activeSessionId)?.cwd ?? null
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  projects: [],
  chats: [],
  draft: null,
  activeSessionId: null,
  sessionStates: {},
  models: [],
  activeModel: null,
  activeEffort: undefined,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    set({ initialized: true })

    agentApi.subscribeSessionEvents((payload) => get().applyEventBatch(payload))
    agentApi.subscribeSessionMeta((payload) => get().applyMeta(payload))
    // 会话列表变更推送：所有元数据 mutation 的最终刷新通道（多窗口同步）
    agentApi.subscribeListsChanged((lists) =>
      set({ projects: lists.projects, chats: lists.chats })
    )

    const models = await agentApi
      .listAvailableModels()
      .then(unwrap)
      .catch(() => [] as ModelInfoDto[])
    set({
      models,
      activeEffort: defaultEffortForModel(
        models,
        models[0] ? { provider: models[0].provider, modelId: models[0].modelId } : null
      )
    })

    const lists = unwrap(await agentApi.getSessionLists())
    set({ projects: lists.projects, chats: lists.chats })

    // Why: 启动时始终进入新会话（草稿），不自动跳转上次会话——历史会话经侧栏手动打开。
    get().createSession()
  },

  createSession: (cwd) => {
    const { draft } = get()
    if (draft) {
      // 复用已有草稿：显式传入工作区则选中该项目；未传入（新会话按钮）则清空，回到未选择状态
      set({ draft: { ...draft, cwd: cwd ?? null }, activeSessionId: draft.id })
      return
    }
    const id = `draft:${crypto.randomUUID()}`
    set((state) => ({
      draft: { id, cwd: cwd ?? null },
      sessionStates: { ...state.sessionStates, [id]: EMPTY_SESSION_STATE },
      activeSessionId: id
    }))
  },

  activateDraft: () => {
    const { draft } = get()
    if (draft) set({ activeSessionId: draft.id })
  },

  discardDraft: () => {
    const { draft, activeSessionId } = get()
    if (!draft) return
    set((state) => {
      const sessionStates = { ...state.sessionStates }
      delete sessionStates[draft.id]
      const latest = latestSessionId(state.projects, state.chats)
      return {
        draft: null,
        sessionStates,
        ...(activeSessionId === draft.id ? { activeSessionId: latest ?? null } : {})
      }
    })
    const next = get().activeSessionId
    if (next && next !== draft.id && !get().sessionStates[next]) {
      void get().openSession(next)
    }
  },

  setDraftCwd: (cwd) => {
    const { draft } = get()
    if (draft) set({ draft: { ...draft, cwd } })
  },

  materializeDraft: async () => {
    const { draft } = get()
    if (!draft) return get().activeSessionId

    // cwd 缺省时创建对话（主进程分配独立工作区 chats/<uuid>）；有 cwd 则为项目会话
    const { sessionId } = unwrap(
      await agentApi.createSession(draft.cwd ? { cwd: draft.cwd } : {})
    )
    set((state) => ({
      draft: null,
      sessionStates: { ...state.sessionStates, [sessionId]: EMPTY_SESSION_STATE },
      activeSessionId: sessionId
    }))
    // 草稿期选择的模型随会话创建应用
    const model = get().activeModel
    if (model) await get().setModel(model)
    return sessionId
  },

  openSession: async (sessionId) => {
    const { draft } = get()
    const snapshot = unwrap(await agentApi.openSession(sessionId))
    set((state) => ({
      ...(draft ? { draft: null } : {}),
      activeSessionId: sessionId,
      activeModel: snapshot.model,
      sessionStates: {
        ...state.sessionStates,
        [sessionId]: {
          messages: snapshot.messages,
          isStreaming: snapshot.isStreaming,
          toolJoin: state.sessionStates[sessionId]?.toolJoin ?? {},
          toolResults: indexToolResults(snapshot.messages)
        }
      }
    }))
  },

  deleteSession: async (sessionId) => {
    await agentApi.deleteSession(sessionId).then(unwrap)
    set((state) => {
      const sessionStates = { ...state.sessionStates }
      delete sessionStates[sessionId]
      return {
        sessionStates,
        ...(state.activeSessionId === sessionId ? { activeSessionId: null } : {})
      }
    })
    // 列表刷新走 listsChanged 推送
  },

  setPinned: async (sessionId, pinned) => {
    await agentApi.setPinned(sessionId, pinned).then(unwrap)
  },

  setArchived: async (sessionId, archived) => {
    await agentApi.setArchived(sessionId, archived).then(unwrap)
  },

  setProjectPinned: async (cwd, pinned) => {
    await agentApi.setProjectPinned(cwd, pinned).then(unwrap)
  },

  setProjectRemoved: async (cwd, removed) => {
    await agentApi.setProjectRemoved(cwd, removed).then(unwrap)
  },

  archiveProjectSessions: async (cwd) => {
    await agentApi.archiveProjectSessions(cwd).then(unwrap)
  },

  sendPrompt: async (text, images) => {
    if (get().models.length === 0) {
      toast.error({
        title: '暂无可用模型',
        description: '请先在设置中配置并启用提供商与模型'
      })
      return
    }
    if (!get().activeSessionId) {
      get().createSession()
    }
    let sessionId = get().activeSessionId
    if (sessionId && sessionId === get().draft?.id) {
      sessionId = await get().materializeDraft()
    }
    if (!sessionId) return

    set((state) => ({
      sessionStates: patchSessionState(state.sessionStates, sessionId, {
        isStreaming: true
      })
    }))
    try {
      const effort = get().activeEffort
      await agentApi
        .prompt({
          sessionId,
          text,
          ...(images?.length ? { images } : {}),
          ...(effort ? { thinkingLevel: effort as AgentThinkingLevel } : {})
        })
        .then(unwrap)
    } catch (error) {
      // IPC rejected = run never started; release the optimistic streaming flag.
      set((state) => ({
        sessionStates: patchSessionState(state.sessionStates, sessionId, {
          isStreaming: false
        })
      }))
      toast.error({
        title: '发送失败',
        description: error instanceof Error ? error.message : String(error)
      })
    }
  },

  editMessage: async (timestamp, text) => {
    const { activeSessionId, draft } = get()
    if (!activeSessionId || activeSessionId === draft?.id) return
    await agentApi.editMessage({ sessionId: activeSessionId, timestamp, text }).then(unwrap)
    await get().openSession(activeSessionId)
  },

  abort: async () => {
    const { activeSessionId, draft } = get()
    if (!activeSessionId || activeSessionId === draft?.id) return
    await agentApi.abort(activeSessionId).then(unwrap)
  },

  setModel: async (ref) => {
    const { activeSessionId, draft } = get()
    set({ activeModel: ref, activeEffort: defaultEffortForModel(get().models, ref) })
    if (activeSessionId && activeSessionId !== draft?.id) {
      await agentApi.setModel(activeSessionId, ref).then(unwrap)
    }
  },

  setEffort: (effort) => {
    set({ activeEffort: effort })
  },

  applyEventBatch: ({ sessionId, events }) => {
    set((state) => {
      // 本窗口未打开的会话（其他窗口流式/后台会话）事件无消费者，直接丢弃：
      // 侧栏流式指示由 agent.session.meta 驱动（agent_start/settled 时主进程广播），
      // 打开会话时 openSession 快照携带完整状态，增量 delta 自带全量 partial 可自愈
      const current = state.sessionStates[sessionId]
      if (!current) return state
      const next = applyAgentEvents(current, events)
      return { sessionStates: { ...state.sessionStates, [sessionId]: next } }
    })
  },

  applyMeta: ({ sessionId, model, isStreaming }) => {
    // 标题不进 meta：由主进程 TitleSummarizer 写库后经 treeChanged 推送刷新
    set((state) => ({
      sessionStates:
        isStreaming !== undefined
          ? patchSessionState(state.sessionStates, sessionId, { isStreaming })
          : state.sessionStates,
      ...(model !== undefined && state.activeSessionId === sessionId
        ? { activeModel: model }
        : {})
    }))
  }
}))

// 开发调试：暴露 store 便于 CDP/控制台验证（生产构建不生效）
if (import.meta.env.DEV) {
  // @ts-expect-error 调试用途
  window.__agentStore = useAgentStore
}
