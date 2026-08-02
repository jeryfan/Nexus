import { cn } from '@renderer/lib/utils'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import type { FC } from 'react'

import { AgentHeader, AgentThread } from './AgentThread'
import { selectActiveCwd, useAgentStore } from './agentStore'
import { ProjectPanel } from './ProjectPanel'

/** Agent 对话区（runtime 由 AgentRuntimeProvider 在 Shell 外层提供）。 */
export const AgentPage: FC = () => {
  const cwd = useAgentStore(selectActiveCwd)
  const panelOpen = useProjectPanelStore((s) => s.open)
  const maximized = useProjectPanelStore((s) => s.maximized)
  const showPanel = cwd !== null && panelOpen
  // 最大化时对话区整体隐藏（保留组件状态），面板占满内容区
  const conversationHidden = showPanel && maximized

  // 外层 Shell 的 <main> 是 app-drag（窗口拖拽区），对话区整体需 app-no-drag 才能交互
  return (
    <div className="app-no-drag h-full">
      <div className="bg-muted/30 flex h-full overflow-hidden p-2">
        <div
          className={cn(
            'bg-background flex flex-1 flex-col overflow-hidden rounded-lg',
            conversationHidden && 'hidden'
          )}
        >
          <AgentHeader />
          <main className="flex-1 overflow-hidden">
            <AgentThread />
          </main>
        </div>
        {showPanel && <ProjectPanel maximized={maximized} />}
      </div>
    </div>
  )
}
