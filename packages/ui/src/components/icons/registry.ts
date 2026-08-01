import { MODEL_ICON_META_CATALOG, type ModelIconKey } from './models/meta-catalog'
import { PROVIDER_ICON_META_CATALOG, type ProviderIconKey } from './providers/meta-catalog'
import type { IconMeta } from './types'

// These model-family expressions mirror the provider registry's vendor patterns where applicable.
// Keep this file limited to icons retained by the current provider/model catalog.

/**
 * Model ID regex patterns mapped to dedicated model icons.
 * Order matters: more specific patterns must come before general ones.
 */
const MODEL_ICON_PATTERNS: ReadonlyArray<readonly [RegExp, ModelIconKey]> = [
  // GPT 5.6 series
  [/gpt-5[.-]6-luna/i, 'gpt-5-6-luna'],
  [/gpt-5[.-]6-sol/i, 'gpt-5-6-sol'],
  [/gpt-5[.-]6-terra/i, 'gpt-5-6-terra'],
  // GPT 5.5 series
  [/gpt-5[.-]5-pro/i, 'gpt-5-5-pro'],
  [/gpt-5[.-]5/i, 'gpt-5-5'],
  // GPT 5.4 series
  [/gpt-5[.-]4-mini/i, 'gpt-5-4-mini'],
  [/gpt-5[.-]4-nano/i, 'gpt-5-4-nano'],
  [/gpt-5[.-]4-pro/i, 'gpt-5-4-pro'],
  [/gpt-5[.-]4/i, 'gpt-5-4'],
  // GPT 5.3 series
  [/gpt-5[.-]3-codex/i, 'gpt-5-3-codex'],
  [/gpt-5[.-]3-chat/i, 'gpt-5-3-chat-latest'],
  // GPT 5.2 series
  [/gpt-5[.-]2-chat/i, 'gpt-5-2-chat-latest'],
  [/gpt-5[.-]2-codex/i, 'gpt-5-2-codex'],
  [/gpt-5[.-]2-pro/i, 'gpt-5-2-pro'],
  [/gpt-5[.-]2/i, 'gpt-5-2'],
  // GPT 5.1 series
  [/gpt-5[.-]1-codex-max/i, 'gpt-5-1-codex-max'],
  [/gpt-5[.-]1-codex-mini/i, 'gpt-5-1-codex-mini'],
  [/gpt-5[.-]1-codex/i, 'gpt-5-1-codex'],
  [/gpt-5[.-]1-chat/i, 'gpt-5-1-chat'],
  [/gpt-5[.-]1/i, 'gpt-5-1'],
  // GPT 5 series
  [/gpt-5-mini/i, 'gpt-5-mini'],
  [/gpt-5-nano/i, 'gpt-5-nano'],
  [/gpt-5-pro/i, 'gpt-5-pro'],
  [/gpt-5-codex/i, 'gpt-5-codex'],
  [/gpt-5/i, 'gpt-5'],
  // GPT 4 and 3.5 series
  [/gpt-4o-mini/i, 'gpt-4o-mini'],
  [/gpt-4o/i, 'gpt-4o'],
  [/gpt-4[.-]1-mini/i, 'gpt-4-1-mini'],
  [/gpt-4[.-]1-nano/i, 'gpt-4-1-nano'],
  [/gpt-4[.-]1/i, 'gpt-4-1'],
  [/gpt-4-turbo-preview/i, 'gpt-4-turbo-preview'],
  [/gpt-4-turbo/i, 'gpt-4-turbo'],
  [/gpt-4(?:-|$)/i, 'gpt-4'],
  [/gpt-3[.-]5-turbo/i, 'gpt-3-5-turbo'],
  // GPT open-weight, image, and audio models
  [/gpt-oss-120b/i, 'gpt-oss-120b'],
  [/gpt-oss-20b/i, 'gpt-oss-20b'],
  [/gpt-image-2/i, 'gpt-image-2'],
  [/gpt-image-1-mini/i, 'gpt-image-1-mini'],
  [/gpt-image/i, 'gpt-image-1'],
  [/gpt-audio-mini/i, 'gpt-audio-mini'],
  [/gpt-audio/i, 'gpt-audio'],
  // Major model families represented by the retained registry data
  [/(claude|anthropic-)/i, 'claude'],
  [/gemini|veo|imagen|lyria/i, 'gemini'],
  [/gemma/i, 'gemma'],
  [/deepseek/i, 'deepseek'],
  [/nous-|hermes|deephermes/i, 'nousresearch'],
  [/llama|meta-/i, 'meta'],
  [/mistral|pixtral|codestral|ministral|voxtral|devstral|mixtral|magistral/i, 'mistral'],
  [/minimax|abab/i, 'minimax'],
  [/jamba|j2-/i, 'ai21'],
  [/command-r|command-a|c4ai-|cohere|north-/i, 'cohere'],
  [/nemotron|nvidia/i, 'nvidia'],
  [/solar/i, 'upstage'],
  [/bge/i, 'baai'],
  [/cogito/i, 'deepcogito'],
  [/mercury/i, 'inception'],
  [/relace/i, 'relace'],
  [/(?:^|[-_/])(?:pplx|sonar)(?:[-_/]|$)/i, 'perplexity'],
  [/(?:^|[-_/])flux(?:[-_.\d]|$)/i, 'flux'],
  [/(?:^|[-_/])longcat(?:[-_/]|$)/i, 'longcat'],
  // Chinese model families
  [/qwen|qwq|qvq|(?:^|[-_/])wan(?:[-_\d]|$)|z-image/i, 'qwen'],
  [/cogview|cogvideo/i, 'cogview'],
  [/glm[-_.\d]*v(?:[-_/.\d]|$)/i, 'glmv'],
  [/glm/i, 'glm'],
  [/ernie|wenxin/i, 'wenxin'],
  [/(?:^|[-_/])step(?:[-_/]|$)/i, 'stepfun'],
  [/doubao|seedream|seedance|ep-202|(?:^|[-_/])seed(?:[-_\d]|$)/i, 'doubao'],
  [/^(?:hunyuan|hy-|hy\d)/i, 'hunyuan'],
  [/kimi|moonshot/i, 'kimi'],
  // Other retained model marks
  [/grok/i, 'grok'],
  [/mimo/i, 'mimo'],
  [/palm|bison/i, 'palm'],
  [/trinity/i, 'trinity'],
  [/nova/i, 'nova'],
  [/(?:^|[-_/])(?:ling|ring)(?:[-_]|$)/i, 'ling']
]

/**
 * Model ID regex mapped to retained provider-brand fallbacks.
 * These cover catalog models without a dedicated model mark.
 */
const MODEL_TO_PROVIDER_PATTERNS: ReadonlyArray<readonly [RegExp, ProviderIconKey]> = [
  [
    /\bgpt\b|(?:^|[-_/])o[134](?:[-_]|$)|chatgpt|dall-e|sora|whisper|tts-|text-embedding-ada|text-embedding-3|babbage|davinci/i,
    'openai'
  ],
  [/palm|veo|imagen|learnlm|text-embedding-00|text-multilingual-embedding-00/i, 'google'],
  [/deepseek/i, 'deepseek'],
  [/command-r|command-a|c4ai-|cohere|embed-|rerank-|north-/i, 'cohere'],
  [/nemotron|nvidia/i, 'nvidia'],
  [/phi-|orca|wizardlm|microsoft/i, 'azureai'],
  [/olmo|molmo|tulu/i, 'allenai'],
  [/moonshot/i, 'moonshot'],
  [/chatglm|cogview|cogvideo/i, 'zhipu'],
  [/minimax|abab/i, 'minimax'],
  [/arcee|spotlight|virtuoso|coder-large/i, 'arcee-ai'],
  [/skylark|ui-tars/i, 'volcengine'],
  [/kat/i, 'streamlake'],
  [/riverflow/i, 'riverflow'],
  [/kling|kolors/i, 'kling'],
  [/aion/i, 'aionlabs'],
  [/recraft/i, 'recraft']
]

/** Provider IDs whose registry ID differs from the retained icon catalog key. */
const PROVIDER_ID_ALIASES: Readonly<Record<string, ProviderIconKey>> = {
  'kimi-for-coding': 'moonshot',
  'new-api': 'newapi',
  tokenhub: 'tencent-cloud-ti',
  gemini: 'google',
  doubao: 'volcengine',
  dashscope: 'bailian',
  zai: 'z-ai',
  'minimax-global': 'minimax'
}

/**
 * Synchronous handle for an icon: which catalog it lives in, its key, and its
 * meta. Resolving a ref touches only the light meta catalogs; the component
 * loads asynchronously through loadIcon/useIcon.
 */
export type IconRef =
  | { kind: 'provider'; key: ProviderIconKey; meta: IconMeta }
  | { kind: 'model'; key: ModelIconKey; meta: IconMeta }

function providerRef(key: string): IconRef | undefined {
  const meta = (PROVIDER_ICON_META_CATALOG as Record<string, IconMeta>)[key]
  return meta ? { kind: 'provider', key: key as ProviderIconKey, meta } : undefined
}

function modelRef(key: string): IconRef | undefined {
  const meta = (MODEL_ICON_META_CATALOG as Record<string, IconMeta>)[key]
  return meta ? { kind: 'model', key: key as ModelIconKey, meta } : undefined
}

/** Exact-key ref constructor with compile-time catalog validation. */
export function providerIconRef(key: ProviderIconKey): IconRef {
  return { kind: 'provider', key, meta: PROVIDER_ICON_META_CATALOG[key] }
}

/** Exact-key ref constructor with compile-time catalog validation. */
export function modelIconRef(key: ModelIconKey): IconRef {
  return { kind: 'model', key, meta: MODEL_ICON_META_CATALOG[key] }
}

/** Resolve a dedicated model icon by matching modelId against retained patterns. */
export function resolveModelIconRef(modelId: string): IconRef | undefined {
  if (!modelId) return undefined
  for (const [regex, catalogKey] of MODEL_ICON_PATTERNS) {
    if (regex.test(modelId)) return modelRef(catalogKey)
  }
  return undefined
}

/** Resolve a retained provider-brand fallback from a model ID. */
export function resolveModelToProviderIconRef(modelId: string): IconRef | undefined {
  if (!modelId) return undefined
  for (const [regex, catalogKey] of MODEL_TO_PROVIDER_PATTERNS) {
    if (regex.test(modelId)) return providerRef(catalogKey)
  }
  return undefined
}

/** Resolve a provider icon by provider ID, including the selected-provider aliases. */
export function resolveProviderIconRef(providerId: string): IconRef | undefined {
  if (!providerId) return undefined
  const key = PROVIDER_ID_ALIASES[providerId] ?? providerId
  return providerRef(key) ?? modelRef(key)
}

/** Resolve model icon, model-derived provider brand, then explicit provider brand. */
export function resolveIconRef(modelId: string, providerId: string): IconRef | undefined {
  return (
    resolveModelIconRef(modelId) ??
    resolveModelToProviderIconRef(modelId) ??
    resolveProviderIconRef(providerId)
  )
}
