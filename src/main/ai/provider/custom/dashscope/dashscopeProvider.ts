import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel
} from '@ai-sdk/openai-compatible'
import type {
  EmbeddingModelV3,
  LanguageModelV3,
  ProviderV3,
  RerankingModelV3
} from '@ai-sdk/provider'
import type { FetchFunction } from '@ai-sdk/provider-utils'
import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils'
import { OpenAICompatibleRerankingModel } from '@nexus/ai-sdk-provider'

export const DASHSCOPE_PROVIDER_NAME = 'dashscope' as const

const DASHSCOPE_CHAT_BASE_PATH = '/compatible-mode/v1'
const DASHSCOPE_RERANK_BASE_PATH = '/compatible-api/v1'

export interface DashScopeProviderSettings {
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
  includeUsage?: boolean
}

export interface DashScopeProvider extends ProviderV3 {
  (modelId: string): LanguageModelV3
  languageModel(modelId: string): LanguageModelV3
  embeddingModel(modelId: string): EmbeddingModelV3
  rerankingModel(modelId: string): RerankingModelV3
}

function getDashScopeRerankBaseURL(baseURL: string): string {
  const normalized = withoutTrailingSlash(baseURL) ?? baseURL
  return normalized.endsWith(DASHSCOPE_CHAT_BASE_PATH)
    ? `${normalized.slice(0, -DASHSCOPE_CHAT_BASE_PATH.length)}${DASHSCOPE_RERANK_BASE_PATH}`
    : normalized
}

export function createDashScopeProvider(
  settings: DashScopeProviderSettings = {}
): DashScopeProvider {
  const { baseURL, fetch: customFetch } = settings
  if (!baseURL) throw new Error('DashScope provider requires a non-empty `baseURL`.')

  const resolveApiKey = () =>
    loadApiKey({
      apiKey: settings.apiKey,
      environmentVariableName: 'DASHSCOPE_API_KEY',
      description: 'DashScope'
    })
  const headers = () => ({ Authorization: `Bearer ${resolveApiKey()}`, ...settings.headers })
  const url = ({ path }: { path: string; modelId: string }) =>
    `${withoutTrailingSlash(baseURL)}${path}`
  const rerankBaseURL = getDashScopeRerankBaseURL(baseURL)
  const rerankUrl = ({ path }: { path: string; modelId: string }) =>
    `${rerankBaseURL}${path === '/rerank' ? '/reranks' : path}`

  const createChatModel = (modelId: string) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `${DASHSCOPE_PROVIDER_NAME}.chat`,
      url,
      headers,
      fetch: customFetch,
      includeUsage: settings.includeUsage
    })

  const provider = (modelId: string) => createChatModel(modelId)
  provider.specificationVersion = 'v3' as const
  provider.languageModel = createChatModel
  provider.embeddingModel = (modelId: string) =>
    new OpenAICompatibleEmbeddingModel(modelId, {
      provider: `${DASHSCOPE_PROVIDER_NAME}.embedding`,
      url,
      headers,
      fetch: customFetch
    })
  provider.rerankingModel = (modelId: string) =>
    new OpenAICompatibleRerankingModel(modelId, {
      provider: `${DASHSCOPE_PROVIDER_NAME}.rerank`,
      url: rerankUrl,
      headers,
      fetch: customFetch
    })

  return provider as unknown as DashScopeProvider
}
