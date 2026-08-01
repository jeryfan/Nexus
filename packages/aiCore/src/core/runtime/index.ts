import type { LanguageModelV3 } from '@ai-sdk/provider'

import { extensionRegistry } from '../providers'
import type { CoreProviderSettingsMap, StringKeys } from '../providers/types'
import { RuntimeExecutor } from './executor'

export { RuntimeExecutor } from './executor'
export type {
  EmbedManyParams,
  EmbedManyResult,
  GenerateTextParams,
  GenerateTextResult,
  RerankParams,
  RerankResult,
  RuntimeConfig
} from './types'

export async function createExecutor<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>
>(providerId: T, settings: TSettingsMap[T]): Promise<RuntimeExecutor<TSettingsMap, T>> {
  if (!extensionRegistry.has(providerId)) {
    throw new Error(`Provider extension "${providerId}" not registered`)
  }

  const provider = await extensionRegistry.createProvider(providerId, settings || {})
  const resolver = extensionRegistry.getModelResolver(providerId as string)
  const modelResolver = resolver
    ? (modelId: string) => resolver(provider, modelId) as LanguageModelV3
    : undefined

  return RuntimeExecutor.create(providerId, provider, settings, modelResolver)
}

export async function generateText<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>
>(
  providerId: T,
  settings: TSettingsMap[T],
  params: Parameters<RuntimeExecutor<TSettingsMap, T>['generateText']>[0]
): Promise<ReturnType<RuntimeExecutor<TSettingsMap, T>['generateText']>> {
  const executor = await createExecutor<TSettingsMap, T>(providerId, settings)
  return executor.generateText(params)
}

export async function embedMany<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>
>(
  providerId: T,
  settings: TSettingsMap[T],
  params: Parameters<RuntimeExecutor<TSettingsMap, T>['embedMany']>[0]
): Promise<ReturnType<RuntimeExecutor<TSettingsMap, T>['embedMany']>> {
  const executor = await createExecutor<TSettingsMap, T>(providerId, settings)
  return executor.embedMany(params)
}

export async function rerank<
  TSettingsMap extends Record<string, any> = CoreProviderSettingsMap,
  T extends StringKeys<TSettingsMap> = StringKeys<TSettingsMap>
>(
  providerId: T,
  settings: TSettingsMap[T],
  params: Parameters<RuntimeExecutor<TSettingsMap, T>['rerank']>[0]
): Promise<ReturnType<RuntimeExecutor<TSettingsMap, T>['rerank']>> {
  const executor = await createExecutor<TSettingsMap, T>(providerId, settings)
  return executor.rerank(params)
}
