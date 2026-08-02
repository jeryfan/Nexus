import { Input } from '@nexus/ui'
import {
  SettingDescription,
  SettingTitle,
  SettingsContentColumn
} from '@renderer/components/SettingsPrimitives'
import { cn } from '@renderer/lib/utils'
import { useAgentMcpStore } from '@renderer/stores/agentMcp'
import { useAgentPackagesStore } from '@renderer/stores/agentPackages'
import { useAgentSkillsStore } from '@renderer/stores/agentSkills'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { McpPanel } from './components/McpPanel'
import { PackagesPanel } from './components/PackagesPanel'
import { SkillsPanel } from './components/SkillsPanel'

const TABS = [
  { id: 'packages', label: '插件', searchPlaceholder: '搜索扩展包' },
  { id: 'mcp', label: 'MCP', searchPlaceholder: '搜索 MCP 服务器' },
  { id: 'skills', label: '技能', searchPlaceholder: '搜索技能' }
] as const

type TabId = (typeof TABS)[number]['id']

/** 插件设置：插件（pi packages）/ MCP 服务器 / 技能 三个面板的统一入口。 */
export default function PluginSettingsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('packages')
  const [query, setQuery] = useState('')

  const initializePackages = useAgentPackagesStore((state) => state.initialize)
  const initializeMcp = useAgentMcpStore((state) => state.initialize)
  const initializeSkills = useAgentSkillsStore((state) => state.initialize)
  const packageCount = useAgentPackagesStore((state) => state.packages.length)
  const mcpCount = useAgentMcpStore((state) => state.servers.length)
  const skillCount = useAgentSkillsStore((state) => state.skills.length)

  useEffect(() => {
    void initializePackages()
    void initializeMcp()
    void initializeSkills()
  }, [initializePackages, initializeMcp, initializeSkills])

  const counts: Record<TabId, number> = {
    packages: packageCount,
    mcp: mcpCount,
    skills: skillCount
  }
  const activeTabDef = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  return (
    <SettingsContentColumn>
      <SettingTitle>插件</SettingTitle>
      <SettingDescription>管理插件、技能和 MCP，变更将在新会话生效。</SettingDescription>

      {/* tab 栏 + 搜索 */}
      <div className="mt-4 mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              )}
            >
              {tab.label} {counts[tab.id]}
            </button>
          ))}
        </div>
        <div className="relative w-64 shrink-0">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeTabDef.searchPlaceholder}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {activeTab === 'packages' && <PackagesPanel query={query} />}
      {activeTab === 'mcp' && <McpPanel query={query} />}
      {activeTab === 'skills' && <SkillsPanel query={query} />}
    </SettingsContentColumn>
  )
}
