import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { providerService } from '@main/data/services/ProviderService'
import { modelService } from '@main/data/services/ModelService'
import { loggerService } from '@logger'
import type { ModelInfoDto } from '@shared/agent/types'

import { loadPi } from './PiLoader'
import { buildPiProviderRegistrations, resolvePiModelId } from './providerMapping'

const logger = loggerService.withContext('ModelRuntimeService')

/**
 * Owns the pi ModelRuntime singleton (provider catalog + auth resolution).
 *
 * Created once per app run from `~/.nexus/agent` (rebranded `getAgentDir()`),
 * then populated with the providers/models configured in Nexus provider/model
 * management via `registerProvider` — SQLite stays the single source of
 * truth; nothing is written to pi config files. Keep all construction behind
 * this class so the runtime composition stays local.
 */
export class ModelRuntimeService {
  private runtime: ModelRuntime | undefined
  /** Fingerprint per providerId registered by {@link syncNexusProviders}. */
  private syncedProviders = new Map<string, string>()
  /** Serializes overlapping sync calls (init vs. picker reads). */
  private syncChain: Promise<void> = Promise.resolve()

  async initialize(): Promise<void> {
    const pi = await loadPi()
    this.runtime = await pi.ModelRuntime.create()
    await this.syncNexusProviders()
  }

  get(): ModelRuntime {
    if (!this.runtime) {
      throw new Error('ModelRuntimeService not initialized')
    }
    return this.runtime
  }

  /**
   * Idempotently mirrors enabled Nexus providers/models into the pi runtime.
   * Cheap when nothing changed (SQLite reads + fingerprint diff); safe to call
   * before any model resolution. Never throws — sync failures degrade to the
   * pi-default catalog instead of breaking agent functionality.
   */
  syncNexusProviders(): Promise<void> {
    const run = this.syncChain.then(() => this.doSyncProviders())
    // Keep the chain alive after a failure so later syncs still run.
    this.syncChain = run.catch(() => {})
    return run
  }

  async listAvailableModels(): Promise<ModelInfoDto[]> {
    await this.syncNexusProviders()
    const models = await this.get().getAvailable()
    // Join pi-available models back to Nexus rows to surface the model's own
    // default reasoning effort (registry reasoning.defaultEffort).
    const nexusByWireId = new Map(
      modelService
        .list({ enabled: true })
        .map((n) => [`${n.providerId}::${resolvePiModelId(n)}`, n] as const)
    )
    return models.map((m) => {
      const nexus = nexusByWireId.get(`${m.provider}::${m.id}`)
      const defaultEffort = nexus?.reasoning?.defaultEffort
      return {
        provider: m.provider,
        modelId: m.id,
        name: m.name,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
        ...(defaultEffort ? { defaultEffort } : {})
      }
    })
  }

  private async doSyncProviders(): Promise<void> {
    const runtime = this.runtime
    if (!runtime) return

    try {
      const providers = providerService.list({ enabled: true })
      const desired = buildPiProviderRegistrations(
        providers,
        (providerId) => modelService.list({ providerId, enabled: true }),
        // Deterministic pick (first enabled key): pi holds one credential per
        // registration, so the AiService-style round-robin does not apply.
        (providerId) => providerService.getApiKeys(providerId, { enabled: true })[0]?.key ?? ''
      )

      const desiredById = new Map(desired.map((entry) => [entry.providerId, entry]))

      let removed = 0
      for (const providerId of [...this.syncedProviders.keys()]) {
        if (!desiredById.has(providerId)) {
          runtime.unregisterProvider(providerId)
          this.syncedProviders.delete(providerId)
          removed++
        }
      }

      let applied = 0
      for (const { providerId, config } of desired) {
        const fingerprint = JSON.stringify(config)
        if (this.syncedProviders.get(providerId) === fingerprint) continue
        if (this.syncedProviders.has(providerId)) {
          runtime.unregisterProvider(providerId)
        }
        runtime.registerProvider(providerId, config)
        this.syncedProviders.set(providerId, fingerprint)
        applied++
      }

      if (applied > 0 || removed > 0) {
        logger.info(`Synced Nexus providers into pi runtime (+${applied}/-${removed})`)
      }
    } catch (error) {
      logger.warn('Failed to sync Nexus providers into pi runtime', error)
    }
  }
}
