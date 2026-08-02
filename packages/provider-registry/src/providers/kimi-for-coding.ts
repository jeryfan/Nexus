import { defineProvider } from './types'

/**
 * Kimi For Coding — Moonshot's subscription coding plan, served over the
 * Anthropic Messages protocol (NOT the Kimi open platform's OpenAI-compatible
 * API, which is `moonshot.ts`).
 *
 * Two things separate it from `moonshot`:
 *   - Its own host + credential system (`api.kimi.com/coding`, plan keys — not
 *     `platform.kimi.com` API keys), so it cannot be an endpoint on `moonshot`.
 *   - The upstream only serves coding-agent clients and gates on `User-Agent`.
 *     Registry entries carry no headers, so the `claude-cli/…` UA is seeded as
 *     `providerSettings.extraHeaders` in `presetProviderSeeder`.
 *
 * `presetProviderId: 'moonshot'` folds it under the Moonshot group in the
 * sidebar (same mechanism as zai → zhipu).
 */
export default defineProvider({
  id: 'kimi-for-coding',
  name: 'Kimi For Coding',
  defaultChatEndpoint: 'anthropic-messages',
  endpointConfigs: {
    'anthropic-messages': {
      adapterFamily: 'anthropic',
      baseUrl: 'https://api.kimi.com/coding'
    }
  },
  presetProviderId: 'moonshot',
  metadata: {
    website: {
      apiKey: 'https://www.kimi.com/coding',
      docs: 'https://www.kimi.com/coding',
      models: 'https://www.kimi.com/coding',
      official: 'https://www.kimi.com/coding'
    }
  }
})
