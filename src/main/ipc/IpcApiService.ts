import { loggerService } from '@logger'
import { DIAGNOSTICS_ENABLED, SLOW_THRESHOLD_MS } from '@main/core/diagnostics'
import { validateSender } from '@main/core/security/validateSender'
import { IpcError, IpcErrorCode, type IpcResult } from '@shared/ipc/errors/IpcError'
import { type IpcRequestSchemas, ipcRequestSchemas } from '@shared/ipc/schemas/ipcSchemas'
import type { IpcContext } from '@shared/ipc/types'
import { IpcChannel } from '@shared/IpcChannel'
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'

import { ipcHandlers } from './handlers/ipcHandlers'
import { IpcRouter } from './IpcRouter'

const logger = loggerService.withContext('IpcApiService')

/** Typed command transport retained from the old project. */
export class IpcApiService {
  private readonly router = new IpcRouter<IpcRequestSchemas>(ipcRequestSchemas, ipcHandlers)

  initialize(): void {
    ipcMain.handle(IpcChannel.IpcApi_Request, (event, route: string, input: unknown) =>
      this.handleRequest(event, route, input)
    )
  }

  dispose(): void {
    ipcMain.removeHandler(IpcChannel.IpcApi_Request)
  }

  private async handleRequest(
    event: IpcMainInvokeEvent,
    route: string,
    input: unknown
  ): Promise<IpcResult<unknown>> {
    if (!validateSender(event)) {
      const error = new IpcError(
        IpcErrorCode.FORBIDDEN_SENDER,
        `Rejected IpcApi request from untrusted sender: ${route}`
      )
      return { ok: false, error: error.toJSON() }
    }

    const startedAt = DIAGNOSTICS_ENABLED ? performance.now() : 0
    try {
      const data = await this.router.dispatch(route, input, this.makeContext(event))
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: IpcError.from(error).toJSON() }
    } finally {
      if (DIAGNOSTICS_ENABLED) {
        const duration = performance.now() - startedAt
        if (duration > SLOW_THRESHOLD_MS.ipcHandler) {
          logger.info(`[Diagnostics/ipc-api] ${duration.toFixed(1)}ms ${route}`)
        }
      }
    }
  }

  private makeContext(event: IpcMainInvokeEvent): IpcContext {
    const window = BrowserWindow.fromWebContents(event.sender)
    return { senderId: window ? String(window.id) : null }
  }
}
