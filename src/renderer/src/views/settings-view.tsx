import { useState } from 'react'
import { ArrowLeft, Bot, Globe, Palette, Puzzle, Search, Settings2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Shell } from '@renderer/components/shell'
import { BrowserSettingsPane } from '@renderer/features/browser/settings/BrowserSettingsPane'
import PluginSettingsPage from '@renderer/pages/settings/PluginSettings/PluginSettingsPage'
import ProviderSettingsPage from '@renderer/pages/settings/ProviderSettings/ProviderSettingsPage'
import { useNavigationStore } from '@renderer/stores/navigation'

// 设置分组占位：具体设置项后续随功能添加
const SECTIONS = [
  { id: 'model-services', label: '模型服务', icon: Bot },
  { id: 'agent', label: '插件', icon: Puzzle },
  { id: 'browser', label: '浏览器', icon: Globe },
  { id: 'general', label: '常规', icon: Settings2 },
  { id: 'appearance', label: '外观', icon: Palette }
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** 设置视图：与首页共用 Shell，边栏为 返回应用 + 搜索 + 分组导航 */
function SettingsView(): React.JSX.Element {
  const goBack = useNavigationStore((state) => state.goBack)
  const [active, setActive] = useState<SectionId>('model-services')
  const [query, setQuery] = useState('')

  const sections = SECTIONS.filter((section) => section.label.includes(query.trim()))
  const activeSection = SECTIONS.find((section) => section.id === active)

  return (
    <Shell
      sidebar={
        <>
          {/* 返回应用 */}
          <div className="px-2 pb-1">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <ArrowLeft className="size-4" />
              返回应用
            </button>
          </div>

          {/* 搜索设置 */}
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索设置…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* 分组导航 */}
          <nav className="flex flex-col gap-0.5 overflow-y-auto px-2 pb-2">
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActive(section.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                    active === section.id
                      ? 'bg-sidebar-accent font-medium'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60'
                  )}
                >
                  <Icon className="size-4" />
                  {section.label}
                </button>
              )
            })}
          </nav>
        </>
      }
    >
      {/* 右侧内容：设置项后续随功能添加（交互控件需单独标注 app-no-drag，否则会遮挡窗口拖拽区） */}
      {active === 'model-services' ? (
        <div className="app-no-drag h-full min-h-0 overflow-hidden">
          <ProviderSettingsPage />
        </div>
      ) : active === 'agent' ? (
        // Why: flex flex-col —— SettingsContentColumn 靠 flex-1 + min-h-0 + overflow-y-auto 内部滚动，
        // 父容器必须是 flex 才能限高（否则内容被 overflow-hidden 裁掉、无法滚动）。
        <div className="app-no-drag flex h-full min-h-0 flex-col overflow-hidden">
          <PluginSettingsPage />
        </div>
      ) : active === 'browser' ? (
        // 同 agent 分区：flex flex-col 使 SettingsContentColumn 的内部滚动生效。
        <div className="app-no-drag flex h-full min-h-0 flex-col overflow-hidden">
          <BrowserSettingsPane />
        </div>
      ) : (
        <div className="h-full overflow-y-auto px-10 py-8">
          <h1 className="text-xl font-semibold">{activeSection?.label}</h1>
        </div>
      )}
    </Shell>
  )
}

export { SettingsView }
