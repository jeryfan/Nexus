import { Shell } from '@renderer/components/shell'
import { AgentRuntimeProvider } from '@renderer/features/agent/AgentRuntimeProvider'
import { AgentPage } from '@renderer/features/agent/AgentPage'
import { AgentSidebar } from '@renderer/features/agent/AgentSidebar'

/** 首页视图：主侧边栏承载会话历史（新会话 + 列表 + 账户），内容为 Agent 对话页 */
function HomeView(): React.JSX.Element {
  return (
    <AgentRuntimeProvider>
      <Shell sidebar={<AgentSidebar />}>
        <AgentPage />
      </Shell>
    </AgentRuntimeProvider>
  )
}

export { HomeView }
