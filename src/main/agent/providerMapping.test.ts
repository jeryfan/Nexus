import { describe, expect, it } from 'vitest'
import { ENDPOINT_TYPE, MODEL_CAPABILITY, type Model, type Provider } from '@shared/data/types/model'

import {
  buildPiProviderRegistrations,
  buildPiCompat,
  buildProviderPiConfig,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_OUTPUT_TOKENS,
  endpointToPiApi,
  formatPiBaseUrl,
  isChatModel,
  LOCAL_PROVIDER_PLACEHOLDER_KEY,
  resolvePiModelId,
  resolveProviderPiEndpoint,
  toPiModelEntry
} from './providerMapping'

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'test',
    name: 'Test Provider',
    apiKeys: [],
    authType: 'api-key',
    apiFeatures: {
      arrayContent: true,
      streamOptions: true,
      developerRole: false,
      serviceTier: false,
      verbosity: false
    },
    settings: {},
    isEnabled: true,
    ...overrides
  }
}

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'test::m1',
    providerId: 'test',
    name: 'Model 1',
    capabilities: [],
    supportsStreaming: true,
    isEnabled: true,
    isHidden: false,
    ...overrides
  }
}

describe('endpointToPiApi', () => {
  it('maps each chat endpoint to its pi protocol', () => {
    expect(endpointToPiApi(ENDPOINT_TYPE.ANTHROPIC_MESSAGES)).toBe('anthropic-messages')
    expect(endpointToPiApi(ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT)).toBe('google-generative-ai')
    expect(endpointToPiApi(ENDPOINT_TYPE.OPENAI_RESPONSES)).toBe('openai-responses')
    expect(endpointToPiApi(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS)).toBe('openai-completions')
    expect(endpointToPiApi(ENDPOINT_TYPE.OLLAMA_CHAT)).toBe('openai-completions')
  })

  it('falls back to openai-completions without an endpoint', () => {
    expect(endpointToPiApi(undefined)).toBe('openai-completions')
  })
})

describe('formatPiBaseUrl', () => {
  it('appends /v1 for openai-family bases missing a version', () => {
    expect(formatPiBaseUrl('https://api.openai.com', 'openai-completions')).toBe(
      'https://api.openai.com/v1'
    )
    expect(formatPiBaseUrl('https://api.openai.com/v1', 'openai-responses')).toBe(
      'https://api.openai.com/v1'
    )
  })

  it('honors the trailing-# opt-out and strips the marker', () => {
    expect(formatPiBaseUrl('https://relay.example.com/base#', 'openai-completions')).toBe(
      'https://relay.example.com/base'
    )
  })

  it('skips the version segment when noApiVersion is set', () => {
    expect(formatPiBaseUrl('http://localhost:3000', 'openai-completions', { noApiVersion: true })).toBe(
      'http://localhost:3000'
    )
  })

  it('keeps anthropic bases version-less (pi appends /v1/messages)', () => {
    expect(formatPiBaseUrl('https://api.anthropic.com/v1', 'anthropic-messages')).toBe(
      'https://api.anthropic.com'
    )
    expect(formatPiBaseUrl('https://api.deepseek.com/anthropic/', 'anthropic-messages')).toBe(
      'https://api.deepseek.com/anthropic'
    )
  })

  it('bakes /v1beta into google bases', () => {
    expect(
      formatPiBaseUrl('https://generativelanguage.googleapis.com', 'google-generative-ai')
    ).toBe('https://generativelanguage.googleapis.com/v1beta')
  })

  it('normalizes ollama hosts to the OpenAI-compatible /v1', () => {
    expect(formatPiBaseUrl('http://localhost:11434/api', 'openai-completions', { ollama: true })).toBe(
      'http://localhost:11434/v1'
    )
  })
})

describe('resolveProviderPiEndpoint', () => {
  it('prefers defaultChatEndpoint when configured', () => {
    const provider = makeProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      endpointConfigs: {
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://api.anthropic.com' },
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.openai.com' }
      }
    })
    const resolved = resolveProviderPiEndpoint(provider)
    expect(resolved.endpointType).toBe(ENDPOINT_TYPE.ANTHROPIC_MESSAGES)
    expect(resolved.api).toBe('anthropic-messages')
    expect(resolved.baseUrl).toBe('https://api.anthropic.com')
  })

  it('falls back to the first configured chat endpoint', () => {
    const provider = makeProvider({
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_EMBEDDINGS]: { baseUrl: 'https://api.example.com/embed' },
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com' }
      }
    })
    const resolved = resolveProviderPiEndpoint(provider)
    expect(resolved.endpointType).toBe(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS)
    expect(resolved.baseUrl).toBe('https://api.example.com')
  })
})

describe('isChatModel', () => {
  it('accepts a plain enabled chat model', () => {
    expect(isChatModel(makeModel())).toBe(true)
  })

  it('rejects disabled, hidden or deprecated models', () => {
    expect(isChatModel(makeModel({ isEnabled: false }))).toBe(false)
    expect(isChatModel(makeModel({ isHidden: true }))).toBe(false)
    expect(isChatModel(makeModel({ isDeprecated: true }))).toBe(false)
  })

  it('rejects models whose capabilities are all non-chat', () => {
    expect(isChatModel(makeModel({ capabilities: [MODEL_CAPABILITY.EMBEDDING] }))).toBe(false)
    expect(
      isChatModel(makeModel({ capabilities: [MODEL_CAPABILITY.EMBEDDING, MODEL_CAPABILITY.RERANK] }))
    ).toBe(false)
    expect(
      isChatModel(
        makeModel({ capabilities: [MODEL_CAPABILITY.EMBEDDING, MODEL_CAPABILITY.FUNCTION_CALL] })
      )
    ).toBe(true)
  })

  it('rejects models whose endpoints carry no chat traffic', () => {
    expect(
      isChatModel(makeModel({ endpointTypes: [ENDPOINT_TYPE.OPENAI_EMBEDDINGS] }))
    ).toBe(false)
    expect(
      isChatModel(
        makeModel({
          endpointTypes: [ENDPOINT_TYPE.OPENAI_EMBEDDINGS, ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]
        })
      )
    ).toBe(true)
  })
})

describe('resolvePiModelId', () => {
  it('prefers apiModelId over the unique id half', () => {
    expect(resolvePiModelId(makeModel({ id: 'p::display', apiModelId: 'wire-id' }))).toBe('wire-id')
  })

  it('falls back to the modelId half of the unique id', () => {
    expect(resolvePiModelId(makeModel({ id: 'p::gpt-x' }))).toBe('gpt-x')
  })
})

describe('toPiModelEntry', () => {
  const level = resolveProviderPiEndpoint(
    makeProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com' }
      }
    })
  )

  it('maps capabilities, modalities and limits', () => {
    const entry = toPiModelEntry(
      makeModel({
        capabilities: [MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.IMAGE_RECOGNITION],
        contextWindow: 200_000,
        maxOutputTokens: 16_384
      }),
      level
    )
    expect(entry).toMatchObject({
      id: 'm1',
      reasoning: true,
      input: ['text', 'image'],
      contextWindow: 200_000,
      maxTokens: 16_384
    })
  })

  it('applies defaults for missing limits and text-only input', () => {
    const entry = toPiModelEntry(makeModel(), level)
    expect(entry.contextWindow).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(entry.maxTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(entry.input).toEqual(['text'])
    expect(entry.reasoning).toBe(false)
  })

  it('emits a per-model api override when the model routes elsewhere', () => {
    const entry = toPiModelEntry(
      makeModel({ endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES] }),
      level
    )
    expect(entry.api).toBe('openai-responses')
  })

  it('omits the override when the model endpoint matches the provider level', () => {
    const entry = toPiModelEntry(
      makeModel({ endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS] }),
      level
    )
    expect(entry.api).toBeUndefined()
  })

  it('maps USD pricing into pi cost rates', () => {
    const entry = toPiModelEntry(
      makeModel({
        pricing: {
          input: { perMillionTokens: 3 },
          output: { perMillionTokens: 15 },
          cacheRead: { perMillionTokens: 0.3 }
        }
      }),
      level
    )
    expect(entry.cost).toEqual({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 })
  })

  it('keeps the zero-cost default for non-USD pricing', () => {
    const entry = toPiModelEntry(
      makeModel({
        pricing: {
          input: { perMillionTokens: 2, currency: 'CNY' },
          output: { perMillionTokens: 8, currency: 'CNY' }
        }
      }),
      level
    )
    expect(entry.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  })
})

describe('buildProviderPiConfig', () => {
  it('builds an anthropic registration with key and extra headers', () => {
    const provider = makeProvider({
      id: 'anthropic',
      defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      endpointConfigs: {
        [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://api.anthropic.com' }
      },
      settings: { extraHeaders: { 'User-Agent': 'nexus' } }
    })
    const config = buildProviderPiConfig(provider, [makeModel()], 'sk-key')
    expect(config).toMatchObject({
      name: 'Test Provider',
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-key',
      headers: { 'User-Agent': 'nexus' }
    })
    expect(config?.models).toHaveLength(1)
  })

  it('uses a placeholder key for authOptional providers without keys', () => {
    const provider = makeProvider({
      id: 'ollama',
      authOptional: true,
      defaultChatEndpoint: ENDPOINT_TYPE.OLLAMA_CHAT,
      endpointConfigs: {
        [ENDPOINT_TYPE.OLLAMA_CHAT]: { baseUrl: 'http://localhost:11434' }
      }
    })
    const config = buildProviderPiConfig(provider, [], '')
    expect(config?.apiKey).toBe(LOCAL_PROVIDER_PLACEHOLDER_KEY)
    expect(config?.baseUrl).toBe('http://localhost:11434/v1')
    expect(config?.models).toEqual([])
  })

  it('registers key-less remote providers without an apiKey', () => {
    const provider = makeProvider({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.example.com' }
      }
    })
    const config = buildProviderPiConfig(provider, [], '')
    expect(config?.apiKey).toBeUndefined()
  })

  it('returns undefined when no endpoint is usable', () => {
    expect(buildProviderPiConfig(makeProvider(), [], 'sk-key')).toBeUndefined()
  })
})

describe('buildPiCompat', () => {
  it('emits qwen compat for dashscope/bailian providers', () => {
    const provider = makeProvider({
      id: 'dashscope',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/'
        }
      }
    })
    expect(buildPiCompat(provider, 'openai-completions')).toEqual({
      thinkingFormat: 'qwen',
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: false
    })
  })

  it('matches custom providers pointing at aliyuncs by baseUrl', () => {
    const provider = makeProvider({
      id: 'my-relay',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://dashscope.aliyuncs.com/v1' }
      }
    })
    expect(buildPiCompat(provider, 'openai-completions')?.thinkingFormat).toBe('qwen')
  })

  it('maps only pi-catalog-confirmed vendors (qwen, xiaomi)', () => {
    const at = (id: string, baseUrl: string) =>
      makeProvider({
        id,
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        endpointConfigs: { [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl } }
      })

    expect(buildPiCompat(at('mimo', 'https://api.xiaomimimo.com'), 'openai-completions'))
      .toMatchObject({ thinkingFormat: 'deepseek', requiresReasoningContentOnAssistantMessages: true })
  })

  it('leaves unconfirmed relays to pi auto-detection / user override', () => {
    const at = (id: string, baseUrl: string) =>
      makeProvider({
        id,
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        endpointConfigs: { [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl } }
      })
    expect(buildPiCompat(at('modelscope', 'https://api-inference.modelscope.cn/v1/'), 'openai-completions')).toBeUndefined()
    expect(buildPiCompat(at('doubao', 'https://ark.cn-beijing.volces.com/api/v3/'), 'openai-completions')).toBeUndefined()
    expect(buildPiCompat(at('silicon', 'https://api.siliconflow.cn/v1'), 'openai-completions')).toBeUndefined()
  })

  it('leaves pi-auto-detected vendors untouched', () => {
    const at = (id: string, baseUrl: string) =>
      makeProvider({
        id,
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        endpointConfigs: { [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl } }
      })
    expect(buildPiCompat(at('deepseek', 'https://api.deepseek.com'), 'openai-completions')).toBeUndefined()
    expect(buildPiCompat(at('zhipu', 'https://open.bigmodel.cn/api/paas/v4/'), 'openai-completions')).toBeUndefined()
    expect(buildPiCompat(at('moonshot', 'https://api.moonshot.cn'), 'openai-completions')).toBeUndefined()
    expect(buildPiCompat(at('nvidia', 'https://integrate.api.nvidia.com'), 'openai-completions')).toBeUndefined()
  })

  it('leaves standard providers to pi auto-detection', () => {
    const provider = makeProvider({
      id: 'openai',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.openai.com' }
      }
    })
    expect(buildPiCompat(provider, 'openai-completions')).toBeUndefined()
  })

  it('only applies to openai-completions', () => {
    const provider = makeProvider({ id: 'dashscope' })
    expect(buildPiCompat(provider, 'openai-responses')).toBeUndefined()
    expect(buildPiCompat(provider, 'anthropic-messages')).toBeUndefined()
  })
})

describe('buildPiProviderRegistrations', () => {
  it('endpoint piCompat overrides the curated fallback', () => {
    const provider = makeProvider({
      id: 'dashscope',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
          piCompat: { thinkingFormat: 'openai', supportsDeveloperRole: true }
        }
      }
    })
    const config = buildProviderPiConfig(provider, [makeModel({ id: 'dashscope::qwen3-max' })], 'k')
    expect(config?.models?.[0].compat).toEqual({
      // curated defaults…
      supportsStore: false,
      supportsReasoningEffort: false,
      // …overridden by stored piCompat
      thinkingFormat: 'openai',
      supportsDeveloperRole: true
    })
  })

  it('wires injected lookups and drops unusable providers', () => {
    const openai = makeProvider({
      id: 'openai',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.openai.com' }
      }
    })
    const unusable = makeProvider({ id: 'no-endpoint' })
    const models = [makeModel({ id: 'openai::gpt-4o' }), makeModel({ id: 'openai::emb', capabilities: [MODEL_CAPABILITY.EMBEDDING] })]

    const registrations = buildPiProviderRegistrations(
      [openai, unusable],
      () => models,
      (providerId) => (providerId === 'openai' ? 'sk-test' : '')
    )

    expect(registrations).toHaveLength(1)
    expect(registrations[0].providerId).toBe('openai')
    expect(registrations[0].config.apiKey).toBe('sk-test')
    expect(registrations[0].config.models).toHaveLength(1)
    expect(registrations[0].config.models?.[0].id).toBe('gpt-4o')
  })
})
