/**
 * 内置供应商的显示名映射（i18n 剥离前为 i18n/label.ts 的 providerKeyMap 查表，
 * 现改为硬编码中文，保留原函数签名）。
 */

import { loggerService } from '@logger'

const logger = loggerService.withContext('label')

const providerLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  'azure-openai': 'Azure OpenAI',
  baichuan: '百川',
  'baidu-cloud': '百度云千帆',
  dashscope: '阿里云百炼',
  deepseek: '深度求索',
  doubao: '火山引擎',
  fireworks: 'Fireworks',
  gemini: 'Gemini',
  'gitee-ai': '模力方舟',
  github: 'GitHub Models',
  grok: 'Grok',
  groq: 'Groq',
  hunyuan: '腾讯混元',
  hyperbolic: 'Hyperbolic',
  infini: '无问芯穹',
  jina: 'Jina',
  lmstudio: 'LM Studio',
  minimax: 'MiniMax',
  mistral: 'Mistral',
  modelscope: 'ModelScope 魔搭',
  moonshot: '月之暗面',
  'new-api': 'New API',
  nvidia: '英伟达',
  o3: 'O3',
  ovms: 'Intel OVMS',
  ollama: 'Ollama',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  perplexity: 'Perplexity',
  qiniu: '七牛云 AI 推理',
  qwenlm: 'QwenLM',
  silicon: '硅基流动',
  stepfun: '阶跃星辰',
  'tencent-cloud-ti': '腾讯云 TI',
  together: 'Together',
  tokenhub: 'TokenHub',
  xirang: '天翼云息壤',
  yi: '零一万物',
  zhinao: '360 智脑',
  zhipu: '智谱开放平台',
  huggingface: 'Hugging Face',
  gateway: 'Vercel AI Gateway',
  mimo: 'Xiaomi MiMo',
  'minimax-global': 'MiniMax 海外版',
  zai: 'Z.ai',
  'local-embedding': 'Qwen3 Embedding 0.6B',
  opencode: 'OpenCode Go'
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

