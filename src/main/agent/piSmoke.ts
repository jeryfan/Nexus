import { loggerService } from '@logger'

import { loadPi } from './PiLoader'

const logger = loggerService.withContext('PiSmoke')

/**
 * US-001 smoke check: verifies pi loads from the (possibly packaged) main
 * process, that the rebrand patch redirects the agent dir to `~/.nexus/agent`,
 * and — when credentials are available — that a minimal prompt round-trips
 * through a real model.
 *
 * Trigger with `NEXUS_PI_SMOKE=1`. Credentials: place an auth.json in
 * `~/.nexus/agent/` or export a provider API key env var.
 */
export async function runPiSmoke(): Promise<void> {
  try {
    const pi = await loadPi()
    logger.info('pi loaded:', pi.VERSION, pi.CONFIG_DIR_NAME)

    const agentDir = pi.getAgentDir()
    logger.info('agent dir:', agentDir)
    if (!agentDir.endsWith('.nexus/agent')) {
      logger.error('rebrand check FAILED, unexpected agent dir:', agentDir)
      return
    }

    const modelRuntime = await pi.ModelRuntime.create()
    logger.info('ModelRuntime created, providers:', modelRuntime.getProviders().length)

    const available = await modelRuntime.getAvailable()
    const model = available[0]
    if (!model) {
      logger.warn(
        'no available model (no credentials); skipping prompt smoke. ' +
          'Provide credentials in ~/.nexus/agent/auth.json or via env API key.'
      )
      return
    }

    const startedAt = performance.now()
    const result = await modelRuntime.completeSimple(model, {
      messages: [{ role: 'user', content: 'Reply with exactly: OK', timestamp: Date.now() }]
    })
    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
    logger.info(
      'prompt smoke OK:',
      `${model.provider}/${model.id}`,
      `${Math.round(performance.now() - startedAt)}ms`,
      text.slice(0, 80)
    )
  } catch (error) {
    logger.error('pi smoke FAILED:', error)
  }
}
