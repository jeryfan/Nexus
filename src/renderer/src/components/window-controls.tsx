import { useState } from 'react'
import { ArrowLeft, ArrowRight, PanelLeft, Search } from 'lucide-react'
import { useSidebarStore } from '@renderer/stores/sidebar'
import { SearchDialog } from '@renderer/components/search-dialog'
import {
  selectCanGoBack,
  selectCanGoForward,
  useNavigationStore
} from '@renderer/stores/navigation'

// 在边栏与内容区两种底色上都适用的中性 hover 色
const buttonClass =
  'app-no-drag rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/[0.08]'

/** 窗口顶部控制按钮组：切换侧边栏 + 前进/后退 + 搜索 */
function WindowControls(): React.JSX.Element {
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed)
  const canGoBack = useNavigationStore(selectCanGoBack)
  const canGoForward = useNavigationStore(selectCanGoForward)
  const goBack = useNavigationStore((state) => state.goBack)
  const goForward = useNavigationStore((state) => state.goForward)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="切换侧边栏"
        onClick={toggleCollapsed}
        className={buttonClass}
      >
        <PanelLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="后退"
        disabled={!canGoBack}
        onClick={goBack}
        className={buttonClass}
      >
        <ArrowLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="前进"
        disabled={!canGoForward}
        onClick={goForward}
        className={buttonClass}
      >
        <ArrowRight className="size-4" />
      </button>
      <button
        type="button"
        aria-label="搜索"
        onClick={() => setSearchOpen(true)}
        className={buttonClass}
      >
        <Search className="size-4" />
      </button>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}

export { WindowControls }
