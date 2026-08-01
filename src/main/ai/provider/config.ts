/**
 * `Provider + Model` → `ProviderConfig` for `@nexus/ai-core`.
 * Always async because `providerService.getRotatedApiKey` is async.
 */

import { hasProviderConfig, type StringKeys } from '@nexus/ai-core/provider'
import { providerService } from '@main/data/services/ProviderService'
import { defaultAppHeaders } from '@main/utils/http'
import type { EndpointType, Model } from '@shared/data/types/model'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { formatApiHost, formatOllamaApiHost, isWithTrailingSharp } from '@shared/utils/api'
import { isGeminiProvider, isOllamaProvider } from '@shared/utils/provider'
import { SystemProviderIds } from '@shared/utils/systemProviderId'
import { isEmpty } from 'es-toolkit/compat'

import type { ProviderConfig } from '../types'
import { type AppProviderId, appProviderIds, type AppProviderSettingsMap } from '../types'
import { customFetch, pickUserAgent, withForcedUserAgent } from '../utils/customFetch'
import { getBaseUrl, getExtraHeaders, routeToEndpoint } from '../utils/provider'
import type { NewApiProviderSettings } from './custom/newapiProvider'
import { type ResolvedEndpoint, resolveAiSdkProviderId, resolveEffectiveEndpoint } from './endpoint'

interface BaseConfig {
  baseURL: string
  apiKey: string
}

interface BuilderContext {
  actualProvider: Provider
  model: Model
  baseConfig: BaseConfig
  endpointType?: EndpointType
  aiSdkProviderId: StringKeys<AppProviderSettingsMap>
}

interface ProviderToAiSdkConfigOptions {
  apiKeyOverride?: string
  resolvedEndpoint?: ResolvedEndpoint
}

/** Applies endpoint-/provider-specific formatting (API version, Ollama/Gemini paths). */
function formatBaseURL(baseURL: string, provider: Provider, endpointType?: EndpointType): string {
  if (!baseURL) return ''

  const appendApiVersion = !isWithTrailingSharp(baseURL)

  // Endpoint-driven formatting
  if (
    endpointType === ENDPOINT_TYPE.OLLAMA_CHAT ||
    endpointType === ENDPOINT_TYPE.OLLAMA_GENERATE
  ) {
    return formatOllamaApiHost(baseURL)
  }
  if (endpointType === ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT) {
    return formatApiHost(baseURL, appendApiVersion, 'v1beta')
  }

  // Provider-driven formatting (for providers without endpoint type info)
  if (isOllamaProvider(provider)) return formatOllamaApiHost(baseURL)
  if (isGeminiProvider(provider)) return formatApiHost(baseURL, appendApiVersion, 'v1beta')

  // Providers that don't append API version
  const noVersionProviders = ['newapi', 'new-api']
  if (
    noVersionProviders.includes(provider.id) ||
    noVersionProviders.includes(provider.presetProviderId ?? '')
  ) {
    return formatApiHost(baseURL, false)
  }

  return formatApiHost(baseURL, appendApiVersion)
}

// ── SDK Config Building ──

type ConfigBuilderEntry = {
  match: (provider: Provider, aiSdkProviderId: AppProviderId) => boolean
  build: (ctx: BuilderContext) => ProviderConfig | Promise<ProviderConfig>
}

/** Endpoint priority: `model.endpointTypes[0]` > `provider.defaultChatEndpoint` > fallback. */
export async function providerToAiSdkConfig(
  provider: Provider,
  model: Model,
  options?: ProviderToAiSdkConfigOptions
): Promise<ProviderConfig> {
  const { endpointType, baseUrl } =
    options?.resolvedEndpoint ?? resolveEffectiveEndpoint(provider, model)

  const aiSdkProviderId = appProviderIds[resolveAiSdkProviderId(provider, endpointType)]

  const formattedBaseUrl = formatBaseURL(baseUrl, provider, endpointType)
  const { baseURL } = routeToEndpoint(formattedBaseUrl)
  const apiKey = options?.apiKeyOverride ?? providerService.getRotatedApiKey(provider.id)

  const ctx: BuilderContext = {
    actualProvider: provider,
    model,
    baseConfig: { baseURL, apiKey },
    endpointType,
    aiSdkProviderId
  }

  const builders: ConfigBuilderEntry[] = [
    { match: (p) => isOllamaProvider(p), build: buildOllamaConfig },
    // DashScope chat is OpenAI-compatible, but Bailian rerank uses a provider-specific URL.
    // Only replace the OpenAI-compatible branch so other DashScope endpoint families stay routed normally.
    {
      match: (p, id) => p.id === SystemProviderIds.dashscope && id === 'openai-compatible',
      build: buildDashScopeConfig
    },
    { match: (_, id) => id === 'newapi', build: buildNewApiConfig }
  ]

  const builder = builders.find((b) => b.match(provider, aiSdkProviderId))
  let config: ProviderConfig
  if (builder) {
    config = await builder.build(ctx)
  } else if (hasProviderConfig(aiSdkProviderId) && aiSdkProviderId !== 'openai-compatible') {
    config = buildGenericProviderConfig(ctx)
  } else {
    config = buildOpenAICompatibleConfig(ctx)
  }

  // Default every provider to the proxy-aware net.fetch base so the app proxy
  // (ProxyService → session.setProxy) applies to provider HTTP traffic. A builder
  // may still install its own fetch wrapper; `??=` preserves it rather than
  // clobbering it.
  config.providerSettings.fetch ??= customFetch

  // A custom `User-Agent` in `extraHeaders` is dropped by the AI SDK's header
  // merge (see `withForcedUserAgent`), so re-apply it at the fetch boundary.
  // Wraps whatever fetch the builder settled on, including a bespoke one.
  const forcedUserAgent = pickUserAgent(getExtraHeaders(provider))
  if (forcedUserAgent) {
    config.providerSettings.fetch = withForcedUserAgent(
      forcedUserAgent,
      config.providerSettings.fetch
    )
  }

  return config
}

// ── Config Builders ──

function buildCommonOptions(ctx: BuilderContext) {
  const options: Record<string, any> = {
    headers: {
      ...defaultAppHeaders(),
      ...getExtraHeaders(ctx.actualProvider)
    }
  }
  if (ctx.aiSdkProviderId === 'openai') {
    options.headers['X-Api-Key'] = ctx.baseConfig.apiKey
  }
  return options
}

function buildOllamaConfig(ctx: BuilderContext): ProviderConfig<'ollama'> {
  const headers: Record<string, string> = {
    ...defaultAppHeaders(),
    ...getExtraHeaders(ctx.actualProvider)
  }
  if (!isEmpty(ctx.baseConfig.apiKey)) {
    headers.Authorization = `Bearer ${ctx.baseConfig.apiKey}`
  }

  return {
    providerId: 'ollama',
    providerSettings: { ...ctx.baseConfig, headers }
  }
}

function buildOpenAICompatibleConfig(ctx: BuilderContext): ProviderConfig<'openai-compatible'> {
  const commonOptions = buildCommonOptions(ctx)

  return {
    providerId: 'openai-compatible',
    providerSettings: {
      ...ctx.baseConfig,
      ...commonOptions,
      name: ctx.actualProvider.id,
      includeUsage: ctx.actualProvider.apiFeatures.streamOptions
    }
  }
}

function buildGenericProviderConfig(ctx: BuilderContext): ProviderConfig {
  const commonOptions = buildCommonOptions(ctx)

  return {
    providerId: ctx.aiSdkProviderId,
    providerSettings: { ...ctx.baseConfig, ...commonOptions }
  }
}

function buildDashScopeConfig(ctx: BuilderContext): ProviderConfig<'dashscope'> {
  return {
    providerId: 'dashscope',
    providerSettings: {
      ...ctx.baseConfig,
      headers: { ...defaultAppHeaders(), ...getExtraHeaders(ctx.actualProvider) },
      includeUsage: ctx.actualProvider.apiFeatures.streamOptions
    }
  }
}

/** NewAPI forwards to different upstream SDKs; per-endpoint suffix rules. */
function formatNewApiBaseURL(baseURL: string, endpointType: EndpointType | undefined): string {
  switch (endpointType) {
    case ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT:
      return formatApiHost(baseURL, true, 'v1beta')
    case ENDPOINT_TYPE.ANTHROPIC_MESSAGES:
      return formatApiHost(baseURL, false)
    default:
      return formatApiHost(baseURL, true)
  }
}

function mapNewApiEndpointType(epType: string | undefined): NewApiProviderSettings['endpointType'] {
  if (!epType) return undefined

  switch (epType) {
    case ENDPOINT_TYPE.ANTHROPIC_MESSAGES:
      return 'anthropic'
    case ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT:
      return 'gemini'
    case ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS:
    case ENDPOINT_TYPE.OLLAMA_CHAT:
      return 'openai'
    case ENDPOINT_TYPE.OPENAI_RESPONSES:
      return 'openai-response'
    case ENDPOINT_TYPE.JINA_RERANK:
      return 'jina-rerank'
    default:
      return 'openai'
  }
}

function buildNewApiConfig(ctx: BuilderContext): ProviderConfig<'newapi'> {
  const endpointType = ctx.endpointType
  let rawBaseURL: string

  if (endpointType === ENDPOINT_TYPE.ANTHROPIC_MESSAGES) {
    const anthropicBaseURL = getBaseUrl(ctx.actualProvider, endpointType)
    rawBaseURL = anthropicBaseURL || ctx.baseConfig.baseURL
  } else {
    rawBaseURL = ctx.baseConfig.baseURL
  }

  const baseURL = formatNewApiBaseURL(rawBaseURL, endpointType)

  return {
    providerId: 'newapi',
    providerSettings: {
      ...ctx.baseConfig,
      baseURL,
      endpointType: mapNewApiEndpointType(endpointType),
      headers: { ...defaultAppHeaders(), ...getExtraHeaders(ctx.actualProvider) }
    }
  }
}
