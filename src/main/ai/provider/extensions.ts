/** App-specific AI SDK provider adapters used by model connection checks. */
import type { ProviderV3 } from '@ai-sdk/provider'
import { ProviderExtension, type ProviderExtensionConfig } from '@nexus/ai-core/provider'
import {
  createOllama,
  type OllamaProvider,
  type OllamaProviderSettings
} from 'ollama-ai-provider-v2'

import {
  createDashScopeProvider,
  type DashScopeProviderSettings
} from './custom/dashscope/dashscopeProvider'
import { createNewApi, type NewApiProviderSettings } from './custom/newapiProvider'

export const OllamaExtension = ProviderExtension.create({
  name: 'ollama',
  create: createOllama
} as const satisfies ProviderExtensionConfig<OllamaProviderSettings, OllamaProvider, 'ollama'>)

export const NewApiExtension = ProviderExtension.create({
  name: 'newapi',
  aliases: ['new-api', 'o3'] as const,
  create: createNewApi
} as const satisfies ProviderExtensionConfig<NewApiProviderSettings, ProviderV3, 'newapi'>)

export const DashScopeExtension = ProviderExtension.create({
  name: 'dashscope',
  aliases: ['bailian'] as const,
  create: createDashScopeProvider
} as const satisfies ProviderExtensionConfig<DashScopeProviderSettings, ProviderV3, 'dashscope'>)

export const extensions = [OllamaExtension, NewApiExtension, DashScopeExtension] as const
