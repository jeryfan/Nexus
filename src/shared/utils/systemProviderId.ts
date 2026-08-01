// Built-in provider whitelist. Keep this in the same order as
// packages/provider-registry/data/providers.json.

import * as z from 'zod'

export const SystemProviderIdSchema = z.enum([
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
])

export type SystemProviderId = z.infer<typeof SystemProviderIdSchema>

export const isSystemProviderId = (id: string): id is SystemProviderId => {
  return SystemProviderIdSchema.safeParse(id).success
}

export const SystemProviderIds = {
  silicon: 'silicon',
  zhipu: 'zhipu',
  deepseek: 'deepseek',
  openrouter: 'openrouter',
  ollama: 'ollama',
  'new-api': 'new-api',
  anthropic: 'anthropic',
  openai: 'openai',
  gemini: 'gemini',
  moonshot: 'moonshot',
  'kimi-for-coding': 'kimi-for-coding',
  dashscope: 'dashscope',
  doubao: 'doubao',
  minimax: 'minimax',
  nvidia: 'nvidia',
  grok: 'grok',
  modelscope: 'modelscope',
  tokenhub: 'tokenhub',
  mimo: 'mimo',
  zai: 'zai',
  'minimax-global': 'minimax-global'
} as const satisfies Record<SystemProviderId, SystemProviderId>
