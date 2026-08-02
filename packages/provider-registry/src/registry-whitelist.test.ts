import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { CREATORS } from './creators'
import { PROVIDERS } from './providers'

const EXPECTED_PROVIDER_IDS = [
  'silicon',
  'zhipu',
  'deepseek',
  'openrouter',
  'ollama',
  'new-api',
  'anthropic',
  'openai',
  'gemini',
  'moonshot',
  'kimi-for-coding',
  'dashscope',
  'doubao',
  'minimax',
  'nvidia',
  'grok',
  'modelscope',
  'tokenhub',
  'mimo',
  'zai',
  'minimax-global'
] as const

type ProviderData = { providers: Array<{ id: string }> }
type ModelData = { models: Array<{ id: string; ownedBy: string }> }
type ProviderModelData = { overrides: Array<{ modelId: string; providerId: string }> }

function readRegistryData<T>(fileName: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../resources/provider/${fileName}`, import.meta.url), 'utf8')
  ) as T
}

const providerData = readRegistryData<ProviderData>('providers.json')
const modelData = readRegistryData<ModelData>('models.json')
const providerModelData = readRegistryData<ProviderModelData>('provider-models.json')

describe('provider registry whitelist', () => {
  it('keeps the source and generated provider registries on the selected 21 providers', () => {
    expect(PROVIDERS.map((provider) => provider.id)).toEqual(EXPECTED_PROVIDER_IDS)
    expect(providerData.providers.map((provider) => provider.id)).toEqual(EXPECTED_PROVIDER_IDS)
  })

  it('does not emit provider-model overrides for removed providers', () => {
    const allowed = new Set<string>(EXPECTED_PROVIDER_IDS)
    const removedProviderIds = new Set(
      providerModelData.overrides
        .map((override) => override.providerId)
        .filter((providerId) => !allowed.has(providerId))
    )

    expect([...removedProviderIds]).toEqual([])
  })

  it('keeps only creators that own a generated model', () => {
    const creatorIds = CREATORS.map((creator) => creator.id).sort()
    const usedCreatorIds = [...new Set(modelData.models.map((model) => model.ownedBy))].sort()

    expect(creatorIds).toEqual(usedCreatorIds)
  })

  it('keeps every generated model reachable from at least one selected provider', () => {
    const referencedModelIds = new Set(
      providerModelData.overrides.map((override) => override.modelId)
    )
    const unreachableModelIds = modelData.models
      .map((model) => model.id)
      .filter((modelId) => !referencedModelIds.has(modelId))

    expect(unreachableModelIds).toEqual([])
  })
})
