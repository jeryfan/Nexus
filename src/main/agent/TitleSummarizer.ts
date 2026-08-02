import type { AgentSession, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { loggerService } from '@logger'
import { agentSessionStore } from '@main/data/services/AgentSessionStore'

import { broadcastSessionMeta } from './AgentEventBridge'
import { extractUserText } from './utils'

const logger = loggerService.withContext('TitleSummarizer')

const SUMMARIZE_TIMEOUT_MS = 5000
const FALLBACK_TITLE_LENGTH = 20

const SUMMARIZE_PROMPT =
  '用一句不超过 15 个字的话概括以下对话的主题。只输出这句话本身，不要引号、不要标点结尾、不要解释。\n\n用户：'

/**
 * Generates an LLM session title after the first completed run (phase-1
 * decision 3B). Falls back to truncating the first user message on any
 * failure. Title is persisted through pi's native session naming
 * (`appendSessionInfo`), so it survives restarts and shows in
 * `SessionManager.listAll()`.
 */
export class TitleSummarizer {
  constructor(private readonly getModelRuntime: () => ModelRuntime) {}

  /** Fire-and-forget entry point called on `agent_end`. */
  async maybeSummarize(session: AgentSession, sessionManager: SessionManager): Promise<void> {
    if (sessionManager.getSessionName()) return
    const model = session.model
    if (!model) return

    const firstUserText = session.messages
      .filter((m) => m.role === 'user')
      .map((m) => extractUserText(m.content))
      .find((t) => t.trim().length > 0)
    if (!firstUserText) return

    try {
      const result = await Promise.race([
        this.getModelRuntime().completeSimple(model, {
          messages: [
            {
              role: 'user' as const,
              content: SUMMARIZE_PROMPT + firstUserText.slice(0, 500),
              timestamp: Date.now()
            }
          ]
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('title summarize timeout')), SUMMARIZE_TIMEOUT_MS)
        )
      ])
      const title = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('')
        .trim()
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 30)
      this.persist(session, sessionManager, title || firstUserText.slice(0, FALLBACK_TITLE_LENGTH))
    } catch (error) {
      logger.warn('title summarize failed, falling back to truncation:', error)
      this.persist(session, sessionManager, firstUserText.slice(0, FALLBACK_TITLE_LENGTH))
    }
  }

  private persist(session: AgentSession, sessionManager: SessionManager, title: string): void {
    sessionManager.appendSessionInfo(title)
    broadcastSessionMeta({ sessionId: session.sessionId, title })
    // 写穿透：标题入 DB 索引（驱动列表/项目树展示）
    void agentSessionStore.setTitle(session.sessionId, title).catch((error) => {
      logger.warn('setTitle failed', error)
    })
  }
}
