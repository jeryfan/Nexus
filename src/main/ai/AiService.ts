import {
  embedMany as aiCoreEmbedMany,
  generateText as aiCoreGenerateText,
  rerank as aiCoreRerank
} from '@nexus/ai-core'
import { providerRegistryService } from '@data/services/ProviderRegistryService'
import { loggerService } from '@logger'
import { modelService } from '@main/data/services/ModelService'
import { providerService } from '@main/data/services/ProviderService'
import { type Model, parseUniqueModelId, type UniqueModelId } from '@shared/data/types/model'
import { isEmbeddingModel, isRerankModel } from '@shared/utils/model'

import { providerToAiSdkConfig } from './provider/config'
import './provider/factory'
import { listModels as listModelsFromProvider } from './provider/listModels'
import type { AppProviderSettingsMap, ListModelsRequest } from './types'
import { installProviderUserAgentInterceptor } from './utils/customFetch'

const logger = loggerService.withContext('AiService')

function bareModelKey(apiModelId: string | undefined): string {
  const id = apiModelId ?? ''
  const afterSlash = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id
  return afterSlash.toLowerCase()
}

export function mergeProviderModelsWithRegistry(
  remote: Partial<Model>[],
  registry: Model[]
): Partial<Model>[] {
  const seen = new Set(remote.map((model) => bareModelKey(model.apiModelId)))
  const missing = registry.filter((model) => !seen.has(bareModelKey(model.apiModelId)))
  return missing.length > 0 ? [...remote, ...missing] : remote
}

export interface ModelCheckRequest {
  uniqueModelId: UniqueModelId
  apiKeyOverride?: string
  timeout?: number
}

export class AiService {
  private disposeUserAgentInterceptor: (() => void) | undefined

  initialize(): void {
    this.disposeUserAgentInterceptor = installProviderUserAgentInterceptor()
    logger.info('AiService initialized')
  }

  dispose(): void {
    this.disposeUserAgentInterceptor?.()
    this.disposeUserAgentInterceptor = undefined
  }

  async listModels(request: ListModelsRequest): Promise<Partial<Model>[]> {
    const provider = providerService.getByProviderId(request.providerId)
    if (provider.modelListSource === 'registry') {
      return providerRegistryService.listProviderRegistryModels({ providerId: request.providerId })
    }

    const remoteModels = await listModelsFromProvider(provider, undefined, {
      throwOnError: request.throwOnError
    })
    const registryModels = providerRegistryService.listProviderRegistryModels({
      providerId: request.providerId
    })
    return mergeProviderModelsWithRegistry(remoteModels, registryModels)
  }

  async checkModel(request: ModelCheckRequest): Promise<{ latency: number }> {
    const { providerId, modelId } = parseUniqueModelId(request.uniqueModelId)
    const provider = providerService.getByProviderId(providerId)
    const model = modelService.getByKey(providerId, modelId)
    const sdkConfig = await providerToAiSdkConfig(provider, model, {
      apiKeyOverride: request.apiKeyOverride
    })
    const sdkModelId = model.apiModelId ?? model.id
    const timeout = request.timeout ?? 15000
    const controller = new AbortController()
    const start = performance.now()

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort()
        reject(new Error('Check model timeout'))
      }, timeout)
    })

    const commonOptions = {
      abortSignal: controller.signal,
      maxRetries: 0
    }
    let probe: Promise<unknown>
    if (isRerankModel(model)) {
      probe = (async () => {
        const result = await aiCoreRerank<AppProviderSettingsMap>(
          sdkConfig.providerId,
          sdkConfig.providerSettings,
          {
            model: sdkModelId,
            query: 'test',
            documents: ['test'],
            topN: 1,
            ...commonOptions
          }
        )
        if (result.ranking.length === 0) {
          throw new Error('Rerank health check returned empty ranking')
        }
      })()
    } else if (isEmbeddingModel(model)) {
      probe = aiCoreEmbedMany<AppProviderSettingsMap>(
        sdkConfig.providerId,
        sdkConfig.providerSettings,
        {
          model: sdkModelId,
          values: ['test'],
          ...commonOptions
        }
      )
    } else {
      probe = aiCoreGenerateText<AppProviderSettingsMap>(
        sdkConfig.providerId,
        sdkConfig.providerSettings,
        {
          model: sdkModelId,
          prompt: 'hi',
          maxOutputTokens: 1,
          ...commonOptions
        }
      )
    }

    try {
      await Promise.race([probe, timeoutPromise])
      return { latency: performance.now() - start }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }
}
