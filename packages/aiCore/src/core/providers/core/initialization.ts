import type { AnthropicProvider, AnthropicProviderSettings } from '@ai-sdk/anthropic'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { DeepSeekProviderSettings } from '@ai-sdk/deepseek'
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { GoogleGenerativeAIProviderSettings } from '@ai-sdk/google'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { OpenAIProvider, OpenAIProviderSettings } from '@ai-sdk/openai'
import { createOpenAI } from '@ai-sdk/openai'
import type { OpenAICompatibleProviderSettings } from '@ai-sdk/openai-compatible'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { ProviderV3 } from '@ai-sdk/provider'
import type { XaiProvider, XaiProviderSettings } from '@ai-sdk/xai'
import { createXai } from '@ai-sdk/xai'
import type { OpenRouterProviderSettings } from '@openrouter/ai-sdk-provider'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'

import { createOpenAICompatibleRerankingModel } from '../openaiCompatible/rerankingModel'
import type {
  ExtensionConfigToIdResolutionMap,
  ExtractExtensionIds,
  UnionToIntersection
} from '../types'
import { extensionRegistry } from './ExtensionRegistry'
import type { ProviderExtensionConfig } from './ProviderExtension'
import { ProviderExtension } from './ProviderExtension'

const AnthropicExtension = ProviderExtension.create({
  name: 'anthropic',
  aliases: ['claude'] as const,
  create: createAnthropic
} as const satisfies ProviderExtensionConfig<
  AnthropicProviderSettings,
  AnthropicProvider,
  'anthropic'
>)

const DeepSeekExtension = ProviderExtension.create({
  name: 'deepseek',
  create: createDeepSeek
} as const satisfies ProviderExtensionConfig<DeepSeekProviderSettings, ProviderV3, 'deepseek'>)

const GoogleExtension = ProviderExtension.create({
  name: 'google',
  aliases: ['google-ai', 'gemini', 'google-gemini'] as const,
  create: createGoogleGenerativeAI
} as const satisfies ProviderExtensionConfig<
  GoogleGenerativeAIProviderSettings,
  ProviderV3,
  'google'
>)

const OpenAICompatibleExtension = ProviderExtension.create({
  name: 'openai-compatible',
  create: (settings) => {
    if (!settings) throw new Error('OpenAI Compatible provider requires settings')
    return createOpenAICompatible(settings)
  },
  createRerankingModel: (modelId, settings) => {
    if (!settings) throw new Error('OpenAI Compatible provider requires settings')
    return createOpenAICompatibleRerankingModel(modelId, settings)
  }
} as const satisfies ProviderExtensionConfig<
  OpenAICompatibleProviderSettings,
  ProviderV3,
  'openai-compatible'
>)

const OpenAIExtension = ProviderExtension.create({
  name: 'openai',
  aliases: ['openai-response'] as const,
  create: createOpenAI,
  variants: [
    {
      suffix: 'chat',
      name: 'OpenAI Chat',
      resolveModel: (provider: OpenAIProvider, modelId: string): LanguageModel =>
        provider.chat(modelId)
    }
  ] as const
} as const satisfies ProviderExtensionConfig<OpenAIProviderSettings, OpenAIProvider, 'openai'>)

const OpenRouterExtension = ProviderExtension.create({
  name: 'openrouter',
  create: createOpenRouter
} as const satisfies ProviderExtensionConfig<OpenRouterProviderSettings, ProviderV3, 'openrouter'>)

const XaiExtension = ProviderExtension.create({
  name: 'xai',
  aliases: ['grok'] as const,
  create: createXai,
  variants: [
    {
      suffix: 'responses',
      name: 'xAI Responses',
      resolveModel: (provider: XaiProvider, modelId: string) => provider.responses(modelId)
    }
  ] as const
} as const satisfies ProviderExtensionConfig<XaiProviderSettings, XaiProvider, 'xai'>)

type CoreExtensions = readonly [
  typeof OpenAIExtension,
  typeof AnthropicExtension,
  typeof GoogleExtension,
  typeof XaiExtension,
  typeof DeepSeekExtension,
  typeof OpenRouterExtension,
  typeof OpenAICompatibleExtension
]

export const coreExtensions: CoreExtensions = [
  OpenAIExtension,
  AnthropicExtension,
  GoogleExtension,
  XaiExtension,
  DeepSeekExtension,
  OpenRouterExtension,
  OpenAICompatibleExtension
]

export type CoreProviderId = ExtractExtensionIds<(typeof coreExtensions)[number]>
type ExtensionConfigs = (typeof coreExtensions)[number]['config']
type ProviderIdsMap = UnionToIntersection<ExtensionConfigToIdResolutionMap<ExtensionConfigs>>

export const registeredProviderIds: ProviderIdsMap = (() => {
  const map = {} as ProviderIdsMap
  coreExtensions.forEach((ext) => {
    const config = ext.config as ProviderExtensionConfig<any, any, CoreProviderId>
    const name = config.name
    ;(map as Record<string, CoreProviderId>)[name] = name
    config.aliases?.forEach((alias) => {
      ;(map as Record<string, CoreProviderId>)[alias] = name
    })
    config.variants?.forEach((variant) => {
      ;(map as Record<string, CoreProviderId>)[`${name}-${variant.suffix}`] = name
    })
  })
  return map
})()

extensionRegistry.registerAll(coreExtensions)

export function hasProviderConfig(providerId: string): boolean {
  return extensionRegistry.has(providerId)
}
