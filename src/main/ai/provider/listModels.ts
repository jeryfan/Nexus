/**
 * Model listing service for Main process (v2 types).
 *
 * Uses Strategy Registry pattern: first matching fetcher wins.
 * All HTTP calls use @ai-sdk/provider-utils for consistent error handling.
 */

import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi as aiSdkGetFromApi,
  zodSchema
} from '@ai-sdk/provider-utils'
import { loggerService } from '@logger'
import { providerService } from '@main/data/services/ProviderService'
import { defaultAppHeaders } from '@main/utils/http'
import type { EndpointType, Model } from '@shared/data/types/model'
import {
  createUniqueModelId,
  ENDPOINT_TYPE,
  endpointImpliedCapability,
  MODEL_CAPABILITY
} from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { formatApiHost, withoutTrailingSlash } from '@shared/utils/api'
import {
  isGeminiProvider,
  isOllamaProvider,
  matchesPreset
} from '@shared/utils/provider'
import { SystemProviderIds } from '@shared/utils/systemProviderId'
import * as z from 'zod'

import { defaultHeaders, getBaseUrl } from '../utils/provider'
import {
  AnthropicModelsResponseSchema,
  GeminiModelsResponseSchema,
  NewApiModelsResponseSchema,
  OllamaTagsResponseSchema,
  OpenAIModelsResponseSchema
} from './listModelsSchemas'

const logger = loggerService.withContext('ModelListService')

// ── Types ──

type ModelFetcher = {
  match: (provider: Provider) => boolean
  fetch: (
    provider: Provider,
    signal?: AbortSignal,
    options?: { throwOnError?: boolean }
  ) => Promise<Partial<Model>[]>
}

function handleOptionalModelListFailure<T>(
  error: unknown,
  options: { throwOnError?: boolean } | undefined,
  context: Record<string, string>
): { data: T[] } {
  if (options?.throwOnError) {
    throw error
  }

  return recoverOptionalModelListFailure(error, context)
}

function recoverOptionalModelListFailure<T>(
  error: unknown,
  context: Record<string, string>
): { data: T[] } {
  logger.warn('Optional model list endpoint failed; continuing with primary models', {
    ...context,
    error
  })
  return { data: [] }
}

// ── API Layer ──

const ApiErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional()
    })
    .optional(),
  message: z.string().optional()
})

type ApiError = z.infer<typeof ApiErrorSchema>
type OpenAIModelResponseItem = z.infer<typeof OpenAIModelsResponseSchema>['data'][number]

async function getFromApi<T>({
  url,
  headers,
  responseSchema,
  abortSignal
}: {
  url: string
  headers?: Record<string, string>
  responseSchema: z.ZodType<T>
  abortSignal?: AbortSignal
}): Promise<T> {
  const { value } = await aiSdkGetFromApi({
    url,
    headers,
    successfulResponseHandler: createJsonResponseHandler(zodSchema(responseSchema)),
    failedResponseHandler: createJsonErrorResponseHandler({
      errorSchema: zodSchema(ApiErrorSchema),
      errorToMessage: (error: ApiError) => error.error?.message || error.message || 'Unknown error'
    }),
    abortSignal
  })

  return value
}

/** Build default headers with rotated API key */

function defaultGroup(modelId: string, providerId: string): string {
  const parts = modelId.split('/')
  return parts.length > 1 ? parts[0] : providerId
}

/** Build a partial v2 Model from API response */
function toModel(apiModelId: string, provider: Provider, extra?: Partial<Model>): Partial<Model> {
  return {
    id: createUniqueModelId(provider.id, apiModelId),
    providerId: provider.id,
    apiModelId,
    name: extra?.name || apiModelId,
    group: extra?.group || defaultGroup(apiModelId, provider.id),
    ownedBy: extra?.ownedBy,
    description: extra?.description,
    capabilities: [],
    supportsStreaming: true,
    isEnabled: true,
    isHidden: false,
    ...extra
  }
}

function dedup<T>(items: T[], getId: (item: T) => string | undefined): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const id = getId(item)?.trim()
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const ollamaFetcher: ModelFetcher = {
  match: (p) => isOllamaProvider(p),
  fetch: async (provider, signal) => {
    const baseUrl = withoutTrailingSlash(getBaseUrl(provider))
      .replace(/\/v1$/, '')
      .replace(/\/api$/, '')
    const response = await getFromApi({
      url: `${baseUrl}/api/tags`,
      headers: defaultHeaders(provider),
      responseSchema: OllamaTagsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.models, (m) => m.name).map((m) =>
      toModel(m.name, provider, { ownedBy: 'ollama' })
    )
  }
}

const EXCLUDED_GEMINI_GENERATION_METHODS = ['predictLongRunning', 'bidiGenerateContent'] as const

const EXCLUDED_GEMINI_MODEL_KEYWORDS = ['tts'] as const

function isSupportedGeminiModel(
  model: z.infer<typeof GeminiModelsResponseSchema>['models'][number]
): boolean {
  const methods = model.supportedGenerationMethods ?? []
  if (EXCLUDED_GEMINI_GENERATION_METHODS.some((method) => methods.includes(method))) {
    return false
  }

  const id = (model.name.startsWith('models/') ? model.name.slice(7) : model.name).toLowerCase()
  return !EXCLUDED_GEMINI_MODEL_KEYWORDS.some((keyword) => id.includes(keyword))
}

const geminiFetcher: ModelFetcher = {
  match: (p) => isGeminiProvider(p),
  fetch: async (provider, signal) => {
    let baseUrl = withoutTrailingSlash(getBaseUrl(provider))
    baseUrl = baseUrl.replace(/\/v1(beta)?$/, '')
    const apiKey = providerService.getRotatedApiKey(provider.id)
    // Pass the key via the `x-goog-api-key` header (same as `@ai-sdk/google`'s chat path)
    // instead of the `?key=` query param: on failure `APICallError.url` is logged, which
    // would persist the key into local logs users attach to bug reports.
    const response = await getFromApi({
      url: `${baseUrl}/v1beta/models`,
      headers: {
        ...defaultAppHeaders(),
        'x-goog-api-key': apiKey,
        ...provider.settings?.extraHeaders
      },
      responseSchema: GeminiModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.models, (m) => m.name)
      .filter(isSupportedGeminiModel)
      .map((m) => {
        const id = m.name.startsWith('models/') ? m.name.slice(7) : m.name
        return toModel(id, provider, { name: m.displayName || id, description: m.description })
      })
  }
}

type NewApiModelResponseItem = z.infer<typeof NewApiModelsResponseSchema>['data'][number]

const ENDPOINT_TYPE_ALIASES: Record<string, EndpointType> = {
  anthropic: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  gemini: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  'image-edit': ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
  'image-generation': ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
  'jina-rerank': ENDPOINT_TYPE.JINA_RERANK,
  openai: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  'openai-response': ENDPOINT_TYPE.OPENAI_RESPONSES,
  'openai-response-compact': ENDPOINT_TYPE.OPENAI_RESPONSES
}

function normalizeEndpointTypes(values: string[] | undefined): EndpointType[] | undefined {
  if (!values?.length) {
    return undefined
  }

  const endpointTypes = dedup(
    values
      .map((value) => ENDPOINT_TYPE_ALIASES[value.trim().toLowerCase()])
      .filter((value): value is EndpointType => Boolean(value)),
    (value) => value
  )

  return endpointTypes.length > 0 ? endpointTypes : undefined
}

const newApiFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds['new-api'] || p.presetProviderId === 'new-api',
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider))
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: defaultHeaders(provider),
      responseSchema: NewApiModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.data, (m) => m.id).map((m: NewApiModelResponseItem) => {
      const endpointTypes = normalizeEndpointTypes(m.supported_endpoint_types)
      const impliedCapability = endpointImpliedCapability(endpointTypes?.[0])

      return toModel(m.id, provider, {
        ownedBy: m.owned_by,
        endpointTypes,
        ...(impliedCapability ? { capabilities: [impliedCapability] } : {})
      })
    })
  }
}

const openRouterFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.openrouter,
  fetch: async (provider, signal, options) => {
    const headers = defaultHeaders(provider)
    const modelsApiUrls =
      provider.endpointConfigs?.[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]?.modelsApiUrls
    const [modelsResponse, embedModelsResponse, imageModelsResponse] = await Promise.all([
      getFromApi({
        url: modelsApiUrls?.default ?? 'https://openrouter.ai/api/v1/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }),
      getFromApi({
        url: modelsApiUrls?.embedding ?? 'https://openrouter.ai/api/v1/embeddings/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }).catch((error) =>
        handleOptionalModelListFailure<OpenAIModelResponseItem>(error, options, {
          providerId: provider.id,
          endpoint: 'openrouter-embedding-models'
        })
      ),
      getFromApi({
        url: modelsApiUrls?.image ?? 'https://openrouter.ai/api/v1/images/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }).catch((error) =>
        recoverOptionalModelListFailure<OpenAIModelResponseItem>(error, {
          providerId: provider.id,
          endpoint: 'openrouter-image-models'
        })
      )
    ])
    const imageModelsById = new Map(imageModelsResponse.data.map((model) => [model.id, model]))
    const all = [...modelsResponse.data, ...embedModelsResponse.data, ...imageModelsResponse.data]
    return dedup(all, (m) => m.id).map((m) => {
      const imageModel = imageModelsById.get(m.id)
      return toModel(m.id, provider, {
        name: imageModel?.name ?? m.name,
        ownedBy: m.owned_by,
        ...(imageModel
          ? {
              capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
              endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]
            }
          : {})
      })
    })
  }
}

const EXCLUDED_OPENAI_MODEL_KEYWORDS = [
  'tts',
  'whisper',
  'transcribe',
  'speech',
  'audio',
  'realtime',
  'sora'
] as const

function isSupportedOpenAIModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return !EXCLUDED_OPENAI_MODEL_KEYWORDS.some((keyword) => id.includes(keyword))
}

// Anthropic authenticates model listing with `x-api-key` + `anthropic-version`, not
// `Authorization: Bearer` — the generic OpenAI fetcher's Bearer header would 401. `/v1/models`
// only returns chat models (no audio/tts), and `limit` maxes at 1000, well above the catalog
// size, so a single page covers it.
const ANTHROPIC_VERSION = '2023-06-01'

const anthropicFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, SystemProviderIds.anthropic),
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider))
    const apiKey = providerService.getRotatedApiKey(provider.id)
    const response = await getFromApi({
      url: `${baseUrl}/models?limit=1000`,
      headers: {
        ...defaultAppHeaders(),
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...provider.settings?.extraHeaders
      },
      responseSchema: AnthropicModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.data, (m) => m.id).map((m) =>
      toModel(m.id, provider, { name: m.display_name || m.id, ownedBy: 'anthropic' })
    )
  }
}

const openAIFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, SystemProviderIds.openai),
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider))
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: defaultHeaders(provider),
      responseSchema: OpenAIModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.data, (m) => m.id)
      .filter((m) => isSupportedOpenAIModel(m.id))
      .map((m) => toModel(m.id, provider, { ownedBy: m.owned_by }))
  }
}

const openAICompatibleFetcher: ModelFetcher = {
  match: () => true,
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider))
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: defaultHeaders(provider),
      responseSchema: OpenAIModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.data, (m) => m.id).map((m) =>
      toModel(m.id, provider, { ownedBy: m.owned_by })
    )
  }
}

// ── Registry (order matters: first match wins) ──

const fetchers: ModelFetcher[] = [
  ollamaFetcher,
  geminiFetcher,
  newApiFetcher,
  openRouterFetcher,
  anthropicFetcher,
  openAIFetcher,
  openAICompatibleFetcher // always-match fallback, must be last
]

// ── Public API ──

export async function listModels(
  provider: Provider,
  abortSignal?: AbortSignal,
  options?: { throwOnError?: boolean }
): Promise<Partial<Model>[]> {
  try {
    const fetcher = fetchers.find((f) => f.match(provider))!
    return await fetcher.fetch(provider, abortSignal, options)
  } catch (error) {
    logger.error('Error listing models', error as Error, { providerId: provider.id })
    if (options?.throwOnError) {
      throw error
    }
    return []
  }
}
