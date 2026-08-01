/** Minimal AI SDK runtime retained for provider/model connection checks. */
export { createExecutor, embedMany, generateText, rerank } from './core/runtime'
export type {
  EmbedManyParams,
  EmbedManyResult,
  GenerateTextParams,
  GenerateTextResult,
  RerankParams,
  RerankResult
} from './core/runtime'

export { isV2Model, isV3Model } from './core/models'

export type { AiSdkModel, ProviderId } from './core/providers'

export { AiCoreError, ModelResolutionError } from './core/errors'
