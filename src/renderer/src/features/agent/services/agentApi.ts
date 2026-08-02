import type { AgentDataApi, LocalCapabilitiesApi } from '@shared/agent/api/AgentDataApi'

import { LocalAgentApiService, LocalCapabilitiesService } from './LocalAgentApiService'

/**
 * Agent 数据面服务单例 —— 后端选择点。
 *
 * - 本地个人客户端：`Local*`（IPC → 主进程 → SQLite 元数据索引）
 * - 团队云端（未来）：替换为 Cloud 实现（HTTP → 团队后端），UI 层零改动
 *
 * 所有方法返回统一信封 `{ code, msg, data }`；异常流用 `unwrap()`。
 */
export const agentApi: AgentDataApi = new LocalAgentApiService()

/** 本地专属能力（目录选择/访达显示/产物打开；云端语义不同，不进 AgentDataApi） */
export const localCapabilities: LocalCapabilitiesApi = new LocalCapabilitiesService()
