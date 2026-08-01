import p_anthropic from './anthropic'
import p_azure_openai from './azure-openai'
import p_baichuan from './baichuan'
import p_baidu_cloud from './baidu-cloud'
import p_dashscope from './dashscope'
import p_deepseek from './deepseek'
import p_doubao from './doubao'
import p_fireworks from './fireworks'
import p_gateway from './gateway'
import p_gemini from './gemini'
import p_github from './github'
import p_grok from './grok'
import p_groq from './groq'
import p_huggingface from './huggingface'
import p_jina from './jina'
import p_kimi_for_coding from './kimi-for-coding'
import p_lmstudio from './lmstudio'
import p_mimo from './mimo'
import p_minimax from './minimax'
import p_minimax_global from './minimax-global'
import p_mistral from './mistral'
import p_modelscope from './modelscope'
import p_moonshot from './moonshot'
import p_new_api from './new-api'
import p_nvidia from './nvidia'
import p_ollama from './ollama'
import p_openai from './openai'
import p_opencode from './opencode'
import p_openrouter from './openrouter'
import p_ovms from './ovms'
import p_perplexity from './perplexity'
import p_qiniu from './qiniu'
import p_silicon from './silicon'
import p_stepfun from './stepfun'
import p_together from './together'
import p_tokenhub from './tokenhub'
import type { Provider } from './types'
import p_xirang from './xirang'
import p_zai from './zai'
import p_zhipu from './zhipu'

/** Every provider, in registry order. Source of truth for data/providers.json + data/provider-models.json. */
export const PROVIDERS: Provider[] = [
  p_silicon,
  p_ovms,
  p_zhipu,
  p_deepseek,
  p_qiniu,
  p_openrouter,
  p_ollama,
  p_new_api,
  p_lmstudio,
  p_anthropic,
  p_openai,
  p_opencode,
  p_azure_openai,
  p_gemini,
  p_github,
  p_moonshot,
  // Adjacent to p_moonshot so the sidebar group (anchored at its first member)
  // renders as [Moonshot AI, Kimi For Coding].
  p_kimi_for_coding,
  p_baichuan,
  p_dashscope,
  p_stepfun,
  p_doubao,
  p_minimax,
  p_groq,
  p_together,
  p_fireworks,
  p_nvidia,
  p_grok,
  p_mistral,
  p_jina,
  p_perplexity,
  p_modelscope,
  p_xirang,
  p_tokenhub,
  p_baidu_cloud,
  p_huggingface,
  p_gateway,
  p_mimo,
  p_zai,
  p_minimax_global
]

