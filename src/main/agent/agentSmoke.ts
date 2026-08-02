import { application } from '@application'
import { loggerService } from '@logger'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentService } from './index'

const logger = loggerService.withContext('AgentSmoke')

/**
 * US-003/006 integration smoke: exercises AgentSessionService end to end —
 * create session → prompt → event stream → settle → snapshot → delete.
 * Trigger with `NEXUS_AGENT_SMOKE=1`. Requires credentials (same as piSmoke).
 */
export async function runAgentSmoke(): Promise<void> {
  const agent = application.get<AgentService>('AgentService')
  const cwd = mkdtempSync(join(tmpdir(), 'nexus-agent-smoke-'))
  let sessionId: string | undefined
  try {
    // 等 ModelRuntime 就绪（AgentService.initialize 非阻塞）
    for (let i = 0; i < 50; i++) {
      try {
        agent.modelRuntime.get()
        break
      } catch {
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    const available = await agent.modelRuntime.listAvailableModels()
    if (available.length === 0) {
      logger.warn('no available model; skipping agent smoke')
      return
    }

    ;({ sessionId } = await agent.sessions.createSession(cwd, false))
    logger.info('session created:', sessionId, 'cwd:', cwd)

    const settled = new Promise<void>((resolvePromise) => {
      const timer = setTimeout(() => {
        logger.warn('settle wait timeout (90s)')
        resolvePromise()
      }, 90000)
      const origForward = agent.bridge.forward.bind(agent.bridge)
      agent.bridge.forward = (sid, event) => {
        if (sid === sessionId && event.type === 'agent_settled') {
          clearTimeout(timer)
          agent.bridge.forward = origForward
          resolvePromise()
        }
        origForward(sid, event)
      }
    })

    await agent.sessions.prompt(
      sessionId,
      '列出当前目录下的文件（没有文件就说目录为空），一句话回答'
    )
    await settled

    const snapshot = await agent.sessions.openSession(sessionId)
    logger.info(
      'snapshot:',
      'messages:',
      snapshot.messages.length,
      'isStreaming:',
      snapshot.isStreaming,
      'title:',
      snapshot.title
    )
    for (const m of snapshot.messages) {
      const preview =
        typeof m.content === 'string'
          ? m.content
          : m.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join(' ')
      logger.info(`  [${m.role}]`, preview.slice(0, 100))
    }
    logger.info('agent smoke OK')
  } catch (error) {
    logger.error('agent smoke FAILED:', error)
  } finally {
    if (sessionId) {
      await agent.sessions.deleteSession(sessionId).catch(() => undefined)
    }
  }
}
