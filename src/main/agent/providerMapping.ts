/**
 * Maps Nexus provider/model configuration (SQLite runtime types) onto pi
 * `ModelRuntime.registerProvider` input — the Phase 2 bridge that makes
 * models configured in the settings page usable by pi agent sessions.
 *
 * Pure functions only (no DB / service access) so the mapping is unit
 * testable. `ModelRuntimeService.syncNexusProviders` feeds this module.
 *
 * Protocol notes (pi appends its own wire paths to `baseUrl`):
 * - `openai-completions` / `openai-responses`: OpenAI-SDK-style base URL that
 *   must include the version segment (…/v1), so we append one when missing.
 * - `anthropic-messages`: Anthropic-SDK-style base URL that must NOT carry a
 *   version segment (pi appends /v1/messages), so we strip a trailing one.
 * - `google-generative-ai`: pi requires the version path baked into the base
 *   URL (…/v1beta), mirroring `formatBaseURL`'s Gemini handling.
 */

import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import {
  CURRENCY,
  ENDPOINT_TYPE,
  isUniqueModelId,
  MODEL_CAPABILITY,
  parseUniqueModelId,
  type EndpointType,
  type Model
} from '@shared/data/types/model'
import type { Provider, PiCompat } from '@shared/data/types/provider'
import { vendorPiCompat } from '@shared/data/utils/piCompatDefaults'
import {
  formatApiHost,
  withoutTrailingApiVersion,
  withoutTrailingSharp,
  withoutTrailingSlash
} from '@shared/utils/api/format'

/** pi `ProviderConfigInput` — derived from the runtime API to avoid deep imports. */
export type PiProviderConfig = Parameters<ModelRuntime['registerProvider']>[1]

/** pi model entry inside `ProviderConfigInput.models`. */
export type PiModelEntry = NonNullable<PiProviderConfig['models']>[number]

export interface PiProviderRegistration {
  providerId: string
  config: PiProviderConfig
}

/** The pi protocol families Nexus can currently bridge. */
export type PiApiName =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'

/** Endpoint types that carry chat/agent traffic (vs embedding/rerank/media). */
const CHAT_ENDPOINT_TYPES: ReadonlySet<EndpointType> = new Set([
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.OPENAI_TEXT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  ENDPOINT_TYPE.OLLAMA_CHAT
])

/** Capabilities that alone never serve agent chat. */
const NON_CHAT_CAPABILITIES: ReadonlySet<string> = new Set([
  MODEL_CAPABILITY.EMBEDDING,
  MODEL_CAPABILITY.RERANK,
  MODEL_CAPABILITY.IMAGE_GENERATION,
  MODEL_CAPABILITY.VIDEO_GENERATION,
  MODEL_CAPABILITY.AUDIO_GENERATION,
  MODEL_CAPABILITY.AUDIO_RECOGNITION,
  MODEL_CAPABILITY.AUDIO_TRANSCRIPT
])

/** Fallback when a model row carries no context window. */
export const DEFAULT_CONTEXT_WINDOW = 128_000
/** Fallback when a model row carries no output limit. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8_192

/**
 * Placeholder credential for `authOptional` providers (local servers such as
 * Ollama): pi gates `getAvailable` on resolvable auth, so a key-less provider
 * would never surface its models without one.
 */
export const LOCAL_PROVIDER_PLACEHOLDER_KEY = 'local'

/** Maps a Nexus endpoint type to the pi protocol spoken on that endpoint. */
export function endpointToPiApi(endpointType: EndpointType | undefined): PiApiName {
  switch (endpointType) {
    case ENDPOINT_TYPE.ANTHROPIC_MESSAGES:
      return 'anthropic-messages'
    case ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT:
      return 'google-generative-ai'
    case ENDPOINT_TYPE.OPENAI_RESPONSES:
      return 'openai-responses'
    default:
      return 'openai-completions'
  }
}

interface PiBaseUrlOptions {
  /** Providers whose host serves the API without a version segment (new-api). */
  noApiVersion?: boolean
  /** Ollama hosts: normalize /api | /chat suffixes to the OpenAI-compatible /v1. */
  ollama?: boolean
}

/**
 * Shapes a stored endpoint baseUrl for pi's wire conventions (see module
 * header). Mirrors `formatBaseURL`'s decisions (version append, `#` opt-out,
 * Ollama/Gemini paths, newapi no-version) where pi semantics match.
 */
export function formatPiBaseUrl(raw: string, api: PiApiName, options: PiBaseUrlOptions = {}): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''

  if (api === 'anthropic-messages') {
    // pi's Anthropic client appends /v1/messages — the base must be version-less.
    return withoutTrailingSharp(withoutTrailingApiVersion(withoutTrailingSlash(trimmed)))
  }

  if (api === 'google-generative-ai') {
    // pi requires the version path inside the base URL.
    return formatApiHost(withoutTrailingSharp(trimmed), true, 'v1beta')
  }

  // Keep a trailing `#` intact: formatApiHost reads it as the "do not append
  // a version segment" opt-out and strips it itself.
  let host = trimmed
  if (options.ollama) {
    host = host.replace(/\/(api|chat)$/, '').replace(/\/v1$/, '')
  }
  return formatApiHost(host, !options.noApiVersion)
}

interface ResolvedPiEndpoint {
  endpointType: EndpointType | undefined
  api: PiApiName
  baseUrl: string
}

/**
 * Provider-level endpoint choice: `defaultChatEndpoint` first, then the first
 * configured chat endpoint. baseUrl falls back across configs like
 * `getBaseUrl` (kept local here to stay dependency-free).
 */
export function resolveProviderPiEndpoint(provider: Provider): ResolvedPiEndpoint {
  const configs = provider.endpointConfigs ?? {}

  let endpointType =
    provider.defaultChatEndpoint && configs[provider.defaultChatEndpoint]?.baseUrl
      ? provider.defaultChatEndpoint
      : undefined
  if (!endpointType) {
    endpointType = (Object.keys(configs) as EndpointType[]).find(
      (ep) => CHAT_ENDPOINT_TYPES.has(ep) && configs[ep]?.baseUrl
    )
  }

  const baseUrl =
    (endpointType ? configs[endpointType]?.baseUrl : undefined) ??
    (Object.values(configs).find((config) => config?.baseUrl)?.baseUrl ?? '')

  return { endpointType, api: endpointToPiApi(endpointType), baseUrl }
}

/** True when a model row can serve agent chat traffic. */
export function isChatModel(model: Model): boolean {
  if (!model.isEnabled || model.isHidden || model.isDeprecated) return false

  const capabilities = model.capabilities ?? []
  if (capabilities.length > 0 && capabilities.every((cap) => NON_CHAT_CAPABILITIES.has(cap))) {
    return false
  }

  const endpointTypes = model.endpointTypes
  if (endpointTypes && endpointTypes.length > 0) {
    return endpointTypes.some((ep) => CHAT_ENDPOINT_TYPES.has(ep))
  }
  return true
}

/** Builds the wire id sent to the provider API. */
export function resolvePiModelId(model: Model): string {
  if (model.apiModelId) return model.apiModelId
  return isUniqueModelId(model.id) ? parseUniqueModelId(model.id).modelId : model.id
}

/**
 * Maps one Nexus model row to a pi model entry. `providerLevel` supplies the
 * provider-wide api/baseUrl so per-model overrides are only emitted when the
 * model routes through a different endpoint (relay providers).
 */
export function toPiModelEntry(model: Model, providerLevel: ResolvedPiEndpoint): PiModelEntry {
  const capabilities = model.capabilities ?? []
  const modalities = model.inputModalities ?? []

  const input: Array<'text' | 'image'> = []
  if (modalities.length === 0 || modalities.includes('text')) input.push('text')
  if (modalities.includes('image') || capabilities.includes(MODEL_CAPABILITY.IMAGE_RECOGNITION)) {
    input.push('image')
  }

  const entry: PiModelEntry = {
    id: resolvePiModelId(model),
    name: model.name,
    reasoning: capabilities.includes(MODEL_CAPABILITY.REASONING) || model.reasoning != null,
    input,
    contextWindow: model.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: model.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  }

  // Per-model endpoint routing (e.g. relay providers that serve some models on
  // /responses and others on /chat/completions).
  const modelEndpointType = model.endpointTypes?.[0]
  if (modelEndpointType && modelEndpointType !== providerLevel.endpointType) {
    entry.api = endpointToPiApi(modelEndpointType)
  }

  // Cost (required by pi): USD per million tokens; map only unambiguous
  // pricing, otherwise leave the zero default.
  const pricing = model.pricing
  const currency = pricing?.input.currency ?? pricing?.output.currency
  if (
    pricing &&
    pricing.input.perMillionTokens != null &&
    pricing.output.perMillionTokens != null &&
    (currency === undefined || currency === CURRENCY.USD)
  ) {
    entry.cost = {
      input: pricing.input.perMillionTokens,
      output: pricing.output.perMillionTokens,
      cacheRead: pricing.cacheRead?.perMillionTokens ?? 0,
      cacheWrite: pricing.cacheWrite?.perMillionTokens ?? 0
    }
  }

  return entry
}

/** pi OpenAI-completions `compat` subset the bridge emits (see pi-ai types). */
/** pi `compat` shape emitted per model (alias of the shared runtime type). */
export type PiOpenAICompat = PiCompat

/**
 * Derives pi `compat` defaults for a provider on a given pi protocol from the
 * shared per-vendor table (only pi-catalog-confirmed vendors). Returns
 * `undefined` for everything else so pi auto-detection stays authoritative for
 * standard providers (openai/anthropic/deepseek/…).
 */
export function buildPiCompat(provider: Provider, api: string): PiOpenAICompat | undefined {
  if (api !== 'openai-completions') return undefined
  return vendorPiCompat(
    provider.id,
    provider.presetProviderId,
    resolveProviderPiEndpoint(provider).baseUrl
  )
}

/**
 * Builds one pi provider registration from a Nexus provider row plus its
 * chat-capable models. Returns `undefined` when the provider has no usable
 * endpoint at all (nothing for pi to talk to).
 *
 * An empty `models` array is intentional for preset providers that map onto a
 * pi built-in id (e.g. `anthropic`): composition then keeps pi's own catalog
 * while applying Nexus baseUrl/headers/auth.
 */
export function buildProviderPiConfig(
  provider: Provider,
  models: Model[],
  apiKey: string
): PiProviderConfig | undefined {
  const level = resolveProviderPiEndpoint(provider)
  if (!level.baseUrl && !provider.authOptional) return undefined

  const isNewApi = provider.id === 'newapi' || provider.presetProviderId === 'newapi'
  const baseUrl = formatPiBaseUrl(level.baseUrl, level.api, {
    noApiVersion: isNewApi,
    ollama: level.endpointType === ENDPOINT_TYPE.OLLAMA_CHAT
  })

  // pi holds one credential per provider registration: take a deterministic
  // first enabled key (callers pass it in); per-request rotation is not
  // expressible on the pi side.
  const effectiveKey = apiKey || (provider.authOptional ? LOCAL_PROVIDER_PLACEHOLDER_KEY : '')

  const headers: Record<string, string> = { ...(provider.settings?.extraHeaders ?? {}) }

  return {
    name: provider.name,
    api: level.api,
    ...(baseUrl ? { baseUrl } : {}),
    ...(effectiveKey ? { apiKey: effectiveKey } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    models: models.map((model) => {
      const entry = toPiModelEntry(model, level)
      // Endpoint-stored piCompat (data-driven) overrides the curated fallback so
      // new providers' quirks are configurable without an app release.
      const configured = level.endpointType
        ? provider.endpointConfigs?.[level.endpointType]?.piCompat
        : undefined
      const compat = { ...buildPiCompat(provider, entry.api ?? level.api), ...configured }
      if (Object.keys(compat).length > 0) entry.compat = compat as PiModelEntry['compat']
      return entry
    })
  }
}

/**
 * Builds registrations for every given provider. `listModels` / `getApiKey`
 * are injected so this stays pure; callers filter to enabled providers.
 */
export function buildPiProviderRegistrations(
  providers: Provider[],
  listModels: (providerId: string) => Model[],
  getApiKey: (providerId: string) => string
): PiProviderRegistration[] {
  const registrations: PiProviderRegistration[] = []
  for (const provider of providers) {
    const models = listModels(provider.id).filter(isChatModel)
    const config = buildProviderPiConfig(provider, models, getApiKey(provider.id))
    if (!config) continue
    registrations.push({ providerId: provider.id, config })
  }
  return registrations
}
