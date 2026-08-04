import { useEffect } from 'react'
import {
  PANEL_DEFAULT_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  useProjectPanelStore
} from '@renderer/stores/projectPanel'
import type { FC } from 'react'

import { cn } from '@renderer/lib/utils'
import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
  useDefaultLayout,
  usePanelRef
} from '@renderer/components/ui/resizable'
import { AgentHeader, AgentThread } from './AgentThread'
import { selectActiveCwd, useAgentStore } from './agentStore'
import { ProjectPanel } from './ProjectPanel'

/** Agent 对话区（runtime 由 AgentRuntimeProvider 在 Shell 外层提供）。
 *  对话区与项目面板经 react-resizable-panels 调宽（宽度 localStorage 记忆）。
 *  挂载语义对齐旧实现：对话区始终挂载；面板仅随 open 条件挂载（关闭销毁 webview
 *  guest 为既有已记录限制）；最大化 = 对话 Panel 折叠到 0 + 内容 hidden 类隐藏。 */
export const AgentPage: FC = () => {
  const cwd = useAgentStore(selectActiveCwd)
  const panelOpen = useProjectPanelStore((s) => s.open)
  const maximized = useProjectPanelStore((s) => s.maximized)
  const showPanel = cwd !== null && panelOpen
  // 最大化时对话区整体隐藏（保留组件状态），面板占满内容区
  const conversationHidden = showPanel && maximized
  const layout = useDefaultLayout({ id: 'nexus-agent-page', onlySaveAfterUserInteractions: true })
  const threadPanelRef = usePanelRef()

  // 最大化：折叠对话 Panel；还原时 expand() 回到折叠前尺寸。面板 maxSize 封顶 640，
  // 常规拖拽/键盘不会把对话区压到折叠，仅 maximized 命令式路径会。
  useEffect(() => {
    const panel = threadPanelRef.current
    if (!panel) return
    if (conversationHidden) panel.collapse()
    else panel.expand()
  }, [conversationHidden, threadPanelRef])

  // 外层 Shell 的 <main> 是 app-drag（窗口拖拽区），对话区整体需 app-no-drag 才能交互
  return (
    <div className="app-no-drag h-full">
      <div className="bg-muted/30 flex h-full overflow-hidden p-2">
        <ResizableGroup
          id="nexus-agent-page"
          className="min-w-0 flex-1"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel
            id="thread"
            collapsible
            groupResizeBehavior="preserve-pixel-size"
            panelRef={threadPanelRef}
          >
            <div
              className={cn(
                'bg-background flex h-full w-full flex-col overflow-hidden rounded-lg',
                conversationHidden && 'hidden'
              )}
            >
              <AgentHeader />
              <main className="flex-1 overflow-hidden">
                <AgentThread />
              </main>
            </div>
          </ResizablePanel>
          {/* 最大化时隐藏分隔条（对齐旧实现「最大化时隐藏手柄」） */}
          {showPanel && !maximized && <ResizableSeparator />}
          {showPanel && (
            <ResizablePanel
              id="project"
              defaultSize={PANEL_DEFAULT_WIDTH}
              minSize={PANEL_MIN_WIDTH}
              // 最大化（对话区折叠）期间解除上限，project 才能吸收到 100%；
              // 还原时 expand() 回到折叠前尺寸，maxSize 约束随之恢复
              maxSize={conversationHidden ? undefined : PANEL_MAX_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
            >
              <ProjectPanel />
            </ResizablePanel>
          )}
        </ResizableGroup>
      </div>
    </div>
  )
}
