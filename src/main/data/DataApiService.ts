import { loggerService } from '@logger'

import { apiHandlers, ApiServer, IpcAdapter } from './api'

const logger = loggerService.withContext('DataApiService')

/** Transport coordinator copied from the old project with lifecycle wiring removed. */
export class DataApiService {
  private readonly apiServer = ApiServer.initialize(apiHandlers)
  private readonly ipcAdapter = new IpcAdapter(this.apiServer)

  initialize(): void {
    this.ipcAdapter.setup()
    const info = this.apiServer.getSystemInfo()
    logger.info(`Data API ready: ${info.handlers.total} endpoints`)
  }

  dispose(): void {
    this.ipcAdapter.dispose()
  }
}
