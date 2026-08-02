import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useEffect, type FC, type ReactNode } from 'react'

import { useAgentStore } from './agentStore'
import { usePiRuntime } from './PiRuntimeAdapter'

/**
 * Agent runtime 提供者：初始化 store 并创建 assistant-ui runtime。
 * 位于 Shell 之外，让主侧边栏（会话列表）与对话区共享同一 runtime 上下文。
 */
export const AgentRuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const initialize = useAgentStore((s) => s.initialize)
  useEffect(() => {
    void initialize()
  }, [initialize])

  const runtime = usePiRuntime()

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
