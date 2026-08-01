import { application } from '@application'
import { loggerService } from '@logger'
import { serializeError } from '@main/ai/utils/serializeError'
import { aiErrorCodes } from '@shared/ipc/errors/ai'
import { IpcError } from '@shared/ipc/errors/IpcError'
import type { aiRequestSchemas } from '@shared/ipc/schemas/ai'
import type { IpcHandlersFor } from '@shared/ipc/types'

const logger = loggerService.withContext('ipc/ai')

async function exposeAiError<T>(route: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (error) {
    logger.error(`${route} failed`, serializeError(error))
    throw new IpcError(
      aiErrorCodes.AI_REQUEST_FAILED,
      error instanceof Error ? error.message : String(error),
      serializeError(error)
    )
  }
}

export const aiHandlers: IpcHandlersFor<typeof aiRequestSchemas> = {
  'ai.provider.model.list': (request) =>
    exposeAiError('ai.provider.model.list', () => application.get('AiService').listModels(request)),
  'ai.provider.model.check': (request) =>
    exposeAiError('ai.provider.model.check', () =>
      application.get('AiService').checkModel(request)
    )
}
