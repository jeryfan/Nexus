import p_anthropic from './anthropic'
import p_dashscope from './dashscope'
import p_deepseek from './deepseek'
import p_doubao from './doubao'
import p_gemini from './gemini'
import p_grok from './grok'
import p_kimi_for_coding from './kimi-for-coding'
import p_mimo from './mimo'
import p_minimax from './minimax'
import p_minimax_global from './minimax-global'
import p_modelscope from './modelscope'
import p_moonshot from './moonshot'
import p_new_api from './new-api'
import p_nvidia from './nvidia'
import p_ollama from './ollama'
import p_openai from './openai'
import p_openrouter from './openrouter'
import p_silicon from './silicon'
import p_tokenhub from './tokenhub'
import type { Provider } from './types'
import p_zai from './zai'
import p_zhipu from './zhipu'

/** Every provider, in registry order. Source of truth for resources/provider/providers.json + resources/provider/provider-models.json. */
export const PROVIDERS: Provider[] = [
  p_silicon,
  p_zhipu,
  p_deepseek,
  p_openrouter,
  p_ollama,
  p_new_api,
  p_anthropic,
  p_openai,
  p_gemini,
  p_moonshot,
  // Adjacent to p_moonshot so the sidebar group (anchored at its first member)
  // renders as [Moonshot AI, Kimi For Coding].
  p_kimi_for_coding,
  p_dashscope,
  p_doubao,
  p_minimax,
  p_nvidia,
  p_grok,
  p_modelscope,
  p_tokenhub,
  p_mimo,
  p_zai,
  p_minimax_global
]
