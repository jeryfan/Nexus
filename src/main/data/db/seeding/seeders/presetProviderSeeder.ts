import { application } from '@application'
import type { ProtoProviderConfig } from '@nexus/provider-registry'
import { buildPersistedEndpointConfigs, ENDPOINT_TYPE } from '@nexus/provider-registry'
import { RegistryLoader } from '@nexus/provider-registry/node'
import { providerService } from '@data/services/ProviderService'
import type { AuthConfig } from '@shared/data/types/provider'

import type { DbType, ISeeder } from '../../types'

/**
 * Registry entries for azure-openai are skeletons (no defaultChatEndpoint,
 * no endpointConfigs) — they need an explicit seed value here.
 *
 * Per the v2 invariant in `ProviderSettings/utils/provider.ts` ("Azure
 * reuses other vendors' endpoint protocols, so authType is the only reliable
 * discriminator"), we deliberately do NOT introduce dedicated endpoint types like
 * `azure-openai-chat-completions`. Vendor URL routing is driven by `authType`
 * (`iam-azure` → AI SDK `createAzure`).
 *
 * `defaultChatEndpoint` here only feeds the reasoning endpoint resolution inside
 * `ProviderRegistryService.mergePresetModel`, i.e. it picks the reasoning format
 * (`openai-chat`, `gemini`, `anthropic`, ...). So the seed must match each
 * provider's wire-format reasoning shape:
 *   - Azure OpenAI runs OpenAI models → `openai-chat-completions` (openai effort)
 */
function getSeedDefaultChatEndpoint(
  providerId: string,
  presetDefault: ProtoProviderConfig['defaultChatEndpoint']
) {
  if (providerId === 'azure-openai') {
    return ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
  }

  return presetDefault ?? null
}

function getSeedAuthConfig(providerId: string): AuthConfig | null {
  if (providerId === 'azure-openai') {
    return { type: 'iam-azure', apiVersion: '' }
  }

  return null
}

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
    defaultChatEndpoint: getSeedDefaultChatEndpoint(p.id, p.defaultChatEndpoint),
    authConfig: getSeedAuthConfig(p.id),
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

    db.transaction((tx) => providerService.batchUpsertTx(tx, rows))
  }
}
