import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { ModelInfoDto } from '@shared/agent/types'

import { loadPi } from './PiLoader'

/**
 * Owns the pi ModelRuntime singleton (provider catalog + auth resolution).
 *
 * Created once per app run from `~/.nexus/agent` (rebranded `getAgentDir()`).
 * Phase 2 will replace this with a runtime composed from Nexus provider/model
 * management — keep all construction behind this class so the swap is local.
 */
export class ModelRuntimeService {
  private runtime: ModelRuntime | undefined

  async initialize(): Promise<void> {
    const pi = await loadPi()
    this.runtime = await pi.ModelRuntime.create()
  }

  get(): ModelRuntime {
    if (!this.runtime) {
      throw new Error('ModelRuntimeService not initialized')
    }
    return this.runtime
  }

  async listAvailableModels(): Promise<ModelInfoDto[]> {
    const models = await this.get().getAvailable()
    return models.map((m) => ({
      provider: m.provider,
      modelId: m.id,
      name: m.name,
      reasoning: m.reasoning,
      contextWindow: m.contextWindow
    }))
  }
}
