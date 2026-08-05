import type { CacheService } from '@main/data/CacheService'
import { loggerService } from '@logger'
import { agentSessionStore } from '@main/data/services/AgentSessionStore'
import { join } from 'node:path'

import { AgentEventBridge, broadcastSessionListsChanged } from './AgentEventBridge'
import { AgentResourceService } from './AgentResourceService'
import { AgentSessionService } from './AgentSessionService'
import { ArtifactService } from './ArtifactService'
import { McpConfigService } from './McpConfigService'
import { ModelRuntimeService } from './ModelRuntimeService'
import { loadPi } from './PiLoader'
import { TitleSummarizer } from './TitleSummarizer'
import { WorkspaceService } from './WorkspaceService'

const logger = loggerService.withContext('AgentService')

/**
 * Facade wiring the pi-based agent services. Registered in the
 * application container at startup; IPC handlers resolve it from there.
 */
export class AgentService {
  readonly modelRuntime = new ModelRuntimeService()
  readonly bridge = new AgentEventBridge()
  readonly resources = new AgentResourceService()
  readonly mcp = new McpConfigService(() => this.resources.getAgentDir())
  readonly titles = new TitleSummarizer(() => this.modelRuntime.get())
  readonly workspace: WorkspaceService
  readonly artifacts = new ArtifactService()
  readonly sessions: AgentSessionService

  constructor(cache: CacheService) {
    this.workspace = new WorkspaceService(cache)
    this.sessions = new AgentSessionService({
      getModelRuntime: () => this.modelRuntime.get(),
      syncModelRuntime: () => this.modelRuntime.syncNexusProviders(),
      getResources: async (cwd) => ({
        resourceLoader: await this.resources.acquireLoader(cwd),
        settingsManager: this.resources.getSettingsManager()
      }),
      bridge: this.bridge,
      cache,
      onAgentEnd: (session, sessionManager) => {
        void this.titles.maybeSummarize(session, sessionManager)
      }
    })
  }

  /** Async init is intentionally non-blocking: handlers degrade gracefully until ready. */
  async initialize(): Promise<void> {
    try {
      // 会话列表变更 → IPC 广播（多窗口同步）
      agentSessionStore.onChanged = (lists) => broadcastSessionListsChanged(lists)
      // resources 先于 modelRuntime：它设置 PI_CODING_AGENT_DIR（pi-mcp-adapter
      // 兼容），且会话创建依赖其 loader；内置包 reconcile 在其内部异步执行。
      await this.resources.initialize()
      // 启动对账：清理 jsonl 已消失的 DB 行（含旧版 nexus-flags.json 迁移），不从文件补录
      const pi = await loadPi()
      await agentSessionStore.reconcile({
        listSessionFiles: () => pi.SessionManager.listAll(),
        legacyFlagsPath: join(pi.getAgentDir(), 'nexus-flags.json')
      })
      await this.modelRuntime.initialize()
      logger.info('AgentService initialized')
    } catch (error) {
      logger.error(
        'AgentService initialization failed (agent routes will error until fixed)',
        error
      )
    }
  }

  dispose(): void {
    this.sessions.disposeAll()
    this.bridge.detachAll()
  }
}
