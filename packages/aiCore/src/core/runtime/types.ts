import type {
  EmbeddingModelV3,
  JSONObject,
  LanguageModelV3,
  ProviderV3,
  RerankingModelV3
} from '@ai-sdk/provider'
import type { embedMany, generateText, rerank } from 'ai'

import type { CoreProviderSettingsMap, StringKeys } from '../providers/types'

export interface RuntimeConfig<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>
> {
  providerId: T
  provider: ProviderV3
  providerSettings: TSettingsMap[T]
  /** Variant-specific language-model resolver, such as OpenAI Chat or xAI Responses. */
  modelResolver?: (modelId: string) => LanguageModelV3
}

export type GenerateTextParams = Omit<Parameters<typeof generateText>[0], 'model'> & {
  model: string | LanguageModelV3
}
export type GenerateTextResult = Awaited<ReturnType<typeof generateText>>

export type EmbedManyParams = Omit<Parameters<typeof embedMany>[0], 'model'> & {
  model: string | EmbeddingModelV3
}
export type EmbedManyResult = Awaited<ReturnType<typeof embedMany>>

export type RerankParams<VALUE extends JSONObject | string = string> = Omit<
  Parameters<typeof rerank<VALUE>>[0],
  'model'
> & {
  model: string | RerankingModelV3
}
export type RerankResult<VALUE extends JSONObject | string = string> = Awaited<
  ReturnType<typeof rerank<VALUE>>
>
