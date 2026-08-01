import { application } from '@application'
import type { ProtoProviderConfig } from '@nexus/provider-registry'
import { buildPersistedEndpointConfigs } from '@nexus/provider-registry'
import { RegistryLoader } from '@nexus/provider-registry/node'
import { providerService } from '@data/services/ProviderService'
import { deleteProviderLogo } from '@main/services/providerLogoStore'

import type { DbType, ISeeder } from '../../types'

/**
 * Kimi For Coding only serves coding-agent clients and gates on `User-Agent`.
 *
 * Two layers have to cooperate for this value to reach the wire, and neither is
 * optional: `providerToAiSdkConfig` re-applies it via `withForcedUserAgent`
 * (the AI SDK's header merge drops provider-level UAs), and `customFetch`
 * smuggles it past Chromium's UA overwrite. With both in place the wire value
 * is exactly this string — no SDK suffixes.
 */
const KIMI_FOR_CODING_USER_AGENT = 'claude-cli/1.0.60'

/**
 * Registry entries carry connection config only — no headers. Providers whose
 * upstream requires a specific header out of the box get it seeded here, as an
 * ordinary user-editable `extraHeaders` entry (Settings → 请求配置).
 */
function getSeedProviderSettings(providerId: string): Record<string, unknown> | null {
  if (providerId === 'kimi-for-coding') {
    return { extraHeaders: { 'User-Agent': KIMI_FOR_CODING_USER_AGENT } }
  }

  return null
}

function toDbRow(p: ProtoProviderConfig) {
  const apiFeatures = p.apiFeatures
    ? {
        arrayContent: p.apiFeatures.arrayContent,
        streamOptions: p.apiFeatures.streamOptions,
        developerRole: p.apiFeatures.developerRole,
        serviceTier: p.apiFeatures.serviceTier,
        verbosity: p.apiFeatures.verbosity
      }
    : null

  return {
    providerId: p.id,
    presetProviderId: p.presetProviderId ?? p.id,
    name: p.name,
    endpointConfigs: buildPersistedEndpointConfigs(p.endpointConfigs),
    defaultChatEndpoint: p.defaultChatEndpoint ?? null,
    authConfig: null,
    providerSettings: getSeedProviderSettings(p.id),
    apiFeatures
  }
}

export class PresetProviderSeeder implements ISeeder {
  readonly name = 'presetProvider'
  readonly description = 'Insert preset provider configurations'

  private _loader?: RegistryLoader

  private getLoader(): RegistryLoader {
    if (!this._loader) {
      this._loader = new RegistryLoader({
        models: application.getPath('feature.provider_registry.data', 'models.json'),
        providers: application.getPath('feature.provider_registry.data', 'providers.json'),
        providerModels: application.getPath(
          'feature.provider_registry.data',
          'provider-models.json'
        )
      })
    }
    return this._loader
  }

  get version(): string {
    return this.getLoader().getProvidersVersion()
  }

  run(db: DbType): void {
    let rawProviders: ProtoProviderConfig[]
    try {
      rawProviders = this.getLoader().loadProviders()
    } catch (error) {
      throw new Error('PresetProviderSeeder: failed to load registry providers', { cause: error })
    }

    if (rawProviders.length === 0) return

    const rows = rawProviders.map(toDbRow)

    const reconciliation = db.transaction((tx) => {
      const result = providerService.reconcilePresetProvidersTx(
        tx,
        rawProviders.map((provider) => provider.id)
      )
      providerService.batchUpsertTx(tx, rows)
      return result
    })

    for (const providerId of reconciliation.removedProviderIds) {
      deleteProviderLogo(providerId)
    }
  }
}
