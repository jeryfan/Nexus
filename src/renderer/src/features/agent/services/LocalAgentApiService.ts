import { ipcApi } from '@renderer/ipc/ipcApi'
import type {
  AgentDataApi,
  CreateSessionInput,
  EditMessageInput,
  LocalCapabilitiesApi,
  PromptInput,
  SessionListsDto,
  Unsubscribe
} from '@shared/agent/api/AgentDataApi'
import { ApiCode, ok, err, type ApiResult } from '@shared/agent/api/result'
import type {
  AgentSessionEventPayload,
  AgentSessionMetaPayload,
  ModelRefDto
} from '@shared/agent/types'

import { IpcError, IpcErrorCode } from '@shared/ipc/errors/IpcError'

function mapError(error: unknown): { code: number; msg: string } {
  if (error instanceof IpcError) {
    switch (error.code) {
      case IpcErrorCode.VALIDATION_FAILED:
        return { code: ApiCode.VALIDATION, msg: error.message }
      case IpcErrorCode.ROUTE_NOT_FOUND:
        return { code: ApiCode.NOT_FOUND, msg: error.message }
      default:
        return { code: ApiCode.INTERNAL, msg: error.message }
    }
  }
  return { code: ApiCode.INTERNAL, msg: error instanceof Error ? error.message : String(error) }
}

/** IPC 调用 → 统一信封（code/msg/data 转换的唯一地点） */
async function call<T>(pending: Promise<T>): Promise<ApiResult<T>> {
  try {
    return ok(await pending)
  } catch (error) {
    const mapped = mapError(error)
    return err(mapped.code, mapped.msg)
  }
}

/**
 * AgentDataApi 的本地实现：IPC → 主进程 → SQLite 元数据索引。
 * 云端实现（未来）只需以 HTTP 实现同一接口。
 */
export class LocalAgentApiService implements AgentDataApi {
  getSessionLists() {
    return call(ipcApi.request('agent.sessionLists.get'))
  }

  subscribeListsChanged(handler: (lists: SessionListsDto) => void): Unsubscribe {
    return ipcApi.on('agent.sessionLists.changed', handler)
  }

  createSession(input: CreateSessionInput) {
    return call(ipcApi.request('agent.session.create', input.cwd ? { cwd: input.cwd } : {}))
  }

  openSession(sessionId: string) {
    return call(ipcApi.request('agent.session.open', { sessionId }))
  }

  deleteSession(sessionId: string) {
    return call(ipcApi.request('agent.session.delete', { sessionId }))
  }

  setPinned(sessionId: string, pinned: boolean) {
    return call(ipcApi.request('agent.session.setPinned', { sessionId, pinned }))
  }

  setArchived(sessionId: string, archived: boolean) {
    return call(ipcApi.request('agent.session.setArchived', { sessionId, archived }))
  }

  prompt(input: PromptInput) {
    return call(
      ipcApi.request('agent.session.prompt', {
        sessionId: input.sessionId,
        text: input.text,
        ...(input.images?.length ? { images: input.images } : {})
      })
    )
  }

  editMessage(input: EditMessageInput) {
    return call(ipcApi.request('agent.session.edit', input))
  }

  abort(sessionId: string) {
    return call(ipcApi.request('agent.session.abort', { sessionId }))
  }

  setProjectPinned(cwd: string, pinned: boolean) {
    return call(ipcApi.request('agent.project.setPinned', { cwd, pinned }))
  }

  setProjectRemoved(cwd: string, removed: boolean) {
    return call(ipcApi.request('agent.project.setRemoved', { cwd, removed }))
  }

  archiveProjectSessions(cwd: string) {
    return call(ipcApi.request('agent.project.archiveSessions', { cwd }))
  }

  subscribeSessionEvents(handler: (payload: AgentSessionEventPayload) => void): Unsubscribe {
    return ipcApi.on('agent.session.event', handler)
  }

  subscribeSessionMeta(handler: (payload: AgentSessionMetaPayload) => void): Unsubscribe {
    return ipcApi.on('agent.session.meta', handler)
  }

  listAvailableModels() {
    return call(ipcApi.request('agent.model.listAvailable'))
  }

  setModel(sessionId: string, ref: ModelRefDto) {
    return call(ipcApi.request('agent.model.set', { sessionId, ...ref }))
  }
}

/** 本地专属能力（目录对话框/访达/产物打开） */
export class LocalCapabilitiesService implements LocalCapabilitiesApi {
  pickWorkspace(defaultPath?: string) {
    return call(
      ipcApi.request('agent.workspace.pick', defaultPath ? { defaultPath } : {})
    )
  }

  getRecentWorkspace() {
    return call(ipcApi.request('agent.workspace.getRecent'))
  }

  revealInFinder(path: string) {
    return call(ipcApi.request('agent.workspace.reveal', { path }))
  }

  openArtifact(sessionId: string, path: string) {
    return call(ipcApi.request('agent.artifact.open', { sessionId, path }))
  }
}
