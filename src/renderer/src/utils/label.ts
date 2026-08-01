/**
 * 内置供应商的显示名映射（i18n 剥离前为 i18n/label.ts 的 providerKeyMap 查表，
 * 现改为硬编码中文，保留原函数签名）。
 */

import { loggerService } from '@logger'

const logger = loggerService.withContext('label')

const providerLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  dashscope: '阿里云百炼',
  deepseek: '深度求索',
  doubao: '火山引擎',
  gemini: 'Gemini',
  grok: 'Grok',
  'kimi-for-coding': 'Kimi For Coding',
  minimax: 'MiniMax',
  'minimax-global': 'MiniMax 海外版',
  mimo: 'Xiaomi MiMo',
  modelscope: 'ModelScope 魔搭',
  moonshot: '月之暗面',
  'new-api': 'New API',
  nvidia: '英伟达',
  ollama: 'Ollama',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  silicon: '硅基流动',
  tokenhub: 'TokenHub',
  zhipu: '智谱开放平台',
  zai: 'Z.ai'
}

/**
 * 获取内置供应商的本地化标签
 * @param id - 供应商的id
 * @returns 供应商的中文名称；未命中时返回 id 本身
 * @remarks
 * 该函数仅用于获取内置供应商的显示名。
 *
 * 对于可能处理自定义供应商的情况，使用 getProviderName 或 getFancyProviderName 更安全
 */
export const getProviderLabelKey = (id: string): string => {
  const label = providerLabels[id]
  if (label) {
    return label
  }
  logger.error(`Missing key ${id}`)
  return id
}
