import type { IpcHandlersFor } from '@shared/ipc/types'
import type { IpcRequestSchemas } from '@shared/ipc/schemas/ipcSchemas'

import { aiHandlers } from './ai'
import { providerHandlers } from './provider'

export const ipcHandlers: IpcHandlersFor<IpcRequestSchemas> = {
  ...aiHandlers,
  ...providerHandlers
}
