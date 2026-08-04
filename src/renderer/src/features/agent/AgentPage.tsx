import { useProjectPanelStore, PANEL_DEFAULT_WIDTH, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from '@renderer/stores/projectPanel'
import type { FC } from 'react'

import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
  useDefaultLayout
} from '@renderer/components/ui/resizable'
import { AgentHeader, AgentThread } from './AgentThread'
import { selectActiveCwd, useAgentStore } from './agentStore'
import { ProjectPanel } from './ProjectPanel'

/** Agent 对话区（runtime 由 AgentRuntimeProvider 在 Shell 外层提供）。
 *  对话区与项目面板经 react-resizable-panels 调宽（宽度 localStorage 记忆）。 */
export const AgentPage: FC = () => {
  const cwd = useAgentStore(selectActiveCwd)
  const panelOpen = useProjectPanelStore((s) => s.open)
  const maximized = useProjectPanelStore((s) => s.maximized)
  const showPanel = cwd !== null && panelOpen
  // 最大化时对话区整体隐藏（保留组件状态），面板占满内容区
  const conversationHidden = showPanel && maximized
  const layout = useDefaultLayout({ id: 'nexus-agent-page', onlySaveAfterUserInteractions: true })

  const conversation = (
    <div className="bg-background flex h-full w-full flex-1 flex-col overflow-hidden rounded-lg">
      <AgentHeader />
      <main className="flex-1 overflow-hidden">
        <AgentThread />
      </main>
    </div>
  )

  // 外层 Shell 的 <main> 是 app-drag（窗口拖拽区），对话区整体需 app-no-drag 才能交互
  return (
    <div className="app-no-drag h-full">
      <div className="bg-muted/30 flex h-full overflow-hidden p-2">
        {conversationHidden ? (
          <ProjectPanel maximized />
        ) : showPanel ? (
          <ResizableGroup
            id="nexus-agent-page"
            className="min-w-0 flex-1"
            defaultLayout={layout.defaultLayout}
            onLayoutChanged={layout.onLayoutChanged}
          >
            <ResizablePanel id="thread" groupResizeBehavior="preserve-pixel-size">
              {conversation}
            </ResizablePanel>
            <ResizableSeparator />
            <ResizablePanel
              id="project"
              defaultSize={PANEL_DEFAULT_WIDTH}
              minSize={PANEL_MIN_WIDTH}
              maxSize={PANEL_MAX_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
            >
              <ProjectPanel />
            </ResizablePanel>
          </ResizableGroup>
        ) : (
          conversation
        )}
      </div>
    </div>
  )
}
