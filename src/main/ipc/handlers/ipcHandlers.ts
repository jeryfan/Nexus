import type { IpcHandlersFor } from '@shared/ipc/types'
import type { IpcRequestSchemas } from '@shared/ipc/schemas/ipcSchemas'

import { agentHandlers } from './agent'
import { aiHandlers } from './ai'
import { fsHandlers } from './fs'
import { providerHandlers } from './provider'
import { shellHandlers } from './shell'

export const ipcHandlers: IpcHandlersFor<IpcRequestSchemas> = {
  ...agentHandlers,
  ...aiHandlers,
  ...fsHandlers,
  ...providerHandlers,
  ...shellHandlers
}
