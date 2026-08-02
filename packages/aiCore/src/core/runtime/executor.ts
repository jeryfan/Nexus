import type { JSONObject, LanguageModelV3, ProviderV3 } from '@ai-sdk/provider'
import {
  createProviderRegistry,
  embedMany as runEmbedMany,
  generateText as runGenerateText,
  rerank as runRerank
} from 'ai'

import { ModelResolutionError } from '../errors'
import type { CoreProviderSettingsMap, StringKeys } from '../providers/types'
import type {
  EmbedManyParams,
  EmbedManyResult,
  GenerateTextParams,
  GenerateTextResult,
  RerankParams,
  RerankResult,
  RuntimeConfig
} from './types'

/** Minimal AI SDK executor used by model connection checks. */
export class RuntimeExecutor<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>
> {
  private readonly registry: ReturnType<typeof createProviderRegistry>

  constructor(private readonly config: RuntimeConfig<TSettingsMap, T>) {
    const provider = config.provider

    // Some V3 providers expose only textEmbeddingModel. AI SDK's registry reads
    // embeddingModel, so bridge the two for connection checks.
    if (!provider.embeddingModel && provider.textEmbeddingModel) {
      provider.embeddingModel = (modelId: string) => provider.textEmbeddingModel!(modelId)
    }

    this.registry = createProviderRegistry({ [config.providerId]: provider })
  }

  async generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
    const { model: modelOrId, ...options } = params
    const model = this.resolveLanguageModel(modelOrId)
    return runGenerateText({ ...options, model } as Parameters<typeof runGenerateText>[0])
  }

  async embedMany(params: EmbedManyParams): Promise<EmbedManyResult> {
    const { model: modelOrId, ...options } = params
    const model =
      typeof modelOrId === 'string'
        ? this.registry.embeddingModel(
            `${this.config.providerId}:${modelOrId}` as `${string}:${string}`
          )
        : modelOrId

    return runEmbedMany({ ...options, model })
  }

  async rerank<VALUE extends JSONObject | string = string>(
    params: RerankParams<VALUE>
  ): Promise<RerankResult<VALUE>> {
    const { model: modelOrId, ...options } = params
    const model =
      typeof modelOrId === 'string'
        ? this.registry.rerankingModel(
            `${this.config.providerId}:${modelOrId}` as `${string}:${string}`
          )
        : modelOrId

    return runRerank<VALUE>({ ...options, model })
  }

  private resolveLanguageModel(modelOrId: string | LanguageModelV3): LanguageModelV3 {
    if (typeof modelOrId !== 'string') return modelOrId

    try {
      return (this.config.modelResolver?.(modelOrId) ??
        this.registry.languageModel(
          `${this.config.providerId}:${modelOrId}` as `${string}:${string}`
        )) as LanguageModelV3
    } catch (error) {
      throw new ModelResolutionError(
        modelOrId,
        this.config.providerId,
        error instanceof Error ? error : undefined
      )
    }
  }

  static create<
    TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
    T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>
  >(
    providerId: T,
    provider: ProviderV3,
    providerSettings: TSettingsMap[T],
    modelResolver?: (modelId: string) => LanguageModelV3
  ): RuntimeExecutor<TSettingsMap, T> {
    return new RuntimeExecutor({ providerId, provider, providerSettings, modelResolver })
  }
}
