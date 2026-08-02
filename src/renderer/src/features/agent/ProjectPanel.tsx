import { TooltipIconButton } from '@renderer/components/assistant-ui/tooltip-icon-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import {
  useProjectPanelStore,
  type PanelTab,
  type PanelTabType
} from '@renderer/stores/projectPanel'
import {
  FileIcon,
  FolderIcon,
  GlobeIcon,
  Maximize2Icon,
  MessageCirclePlusIcon,
  Minimize2Icon,
  PanelRightIcon,
  PlusIcon,
  SquarePlusIcon,
  SquareTerminalIcon,
  XIcon,
  type LucideIcon
} from 'lucide-react'
import { useState, type FC } from 'react'
import { FileTreeDock, TreeToggleButton } from './files/explorer/FileTreeDock'
import { getFileTypeIcon } from './files/lib/file-type-icons'
import { basename } from './files/lib/path'
import { FilePreviewPanel } from './files/preview/FilePreviewPanel'

/** 「+」菜单/空态列表中打开标签页的入口；shortcut 仅为展示提示（未绑定快捷键） */
const PANEL_TAB_TYPES: { type: PanelTabType; label: string; icon: LucideIcon; shortcut?: string }[] =
  [
    { type: 'review', label: '审阅', icon: SquarePlusIcon, shortcut: '^⇧G' },
    { type: 'terminal', label: '终端', icon: SquareTerminalIcon },
    { type: 'browser', label: '浏览器', icon: GlobeIcon, shortcut: '⌘T' },
    { type: 'chat', label: '侧边聊天', icon: MessageCirclePlusIcon, shortcut: '⌥⌘S' }
  ]

/** 「文件」入口：打开「打开文件」标签页并展示文件树 */
const FILE_MENU_ENTRY = { label: '文件', icon: FolderIcon, shortcut: '⌘P' }

function tabLabel(type: PanelTabType): string {
  if (type === 'file-browser') return '打开文件'
  return PANEL_TAB_TYPES.find((item) => item.type === type)?.label ?? type
}

function tabIcon(type: PanelTabType): LucideIcon {
  if (type === 'file-browser') return FileIcon
  return PANEL_TAB_TYPES.find((item) => item.type === type)?.icon ?? SquarePlusIcon
}

/** 标签页名称：文件标签取文件名，菜单标签取入口名 */
function getTabLabel(tab: PanelTab): string {
  return tab.type === 'file' && tab.filePath ? basename(tab.filePath) : tabLabel(tab.type)
}

/** 标签页图标：文件标签按文件类型推断，菜单标签取入口图标 */
function getTabIcon(tab: PanelTab): LucideIcon {
  return tab.type === 'file' ? getFileTypeIcon(tab.filePath) : tabIcon(tab.type)
}

/** 点击菜单「文件」：打开「打开文件」页（已存在则激活）并确保文件树展示 */
function useOpenFileBrowser(): () => void {
  const openTab = useProjectPanelStore((s) => s.openTab)
  const treeVisible = useProjectPanelStore((s) => s.treeVisible)
  const toggleTreeVisible = useProjectPanelStore((s) => s.toggleTreeVisible)
  return () => {
    openTab('file-browser')
    if (!treeVisible) toggleTreeVisible()
  }
}

/** 单个标签页：图标 + 名称 + 关闭 ×；点击激活；预览文件标签斜体（orca 惯例）；
 *  有未保存修改时关闭位显示圆点（hover 时 reveal ×，对齐 orca EditorFileTab） */
const TabButton: FC<{ tab: PanelTab; active: boolean }> = ({ tab, active }) => {
  const setActiveTab = useProjectPanelStore((s) => s.setActiveTab)
  const closeTab = useProjectPanelStore((s) => s.closeTab)
  const dirty = useProjectPanelStore((s) => s.dirtyTabIds[tab.id] === true)
  const Icon = getTabIcon(tab)
  return (
    <div
      className={cn(
        'group flex max-w-40 items-center gap-1 rounded-md py-1 pr-1 pl-2 text-sm select-none',
        active ? 'bg-muted' : 'hover:bg-muted/60'
      )}
    >
      <button
        type="button"
        onClick={() => setActiveTab(tab.id)}
        className="flex min-w-0 items-center gap-1.5"
      >
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className={cn('truncate', tab.isPreview && 'italic')}>{getTabLabel(tab)}</span>
      </button>
      {/* dirty 圆点与关闭 × 共用同一槽位（orca EditorFileTabCloseButton 语义）：
          dirty 时显示圆点，hover 标签时换成 ×，避免宽度抖动 */}
      <div className="relative flex size-4 shrink-0 items-center justify-center">
        {dirty && (
          <span className="bg-foreground/60 absolute size-1.5 rounded-full group-hover:hidden group-focus-within:hidden" />
        )}
        <button
          type="button"
          aria-label="关闭标签页"
          onClick={() => closeTab(tab.id)}
          className={cn(
            'hover:bg-muted-foreground/20 flex size-4 items-center justify-center rounded',
            dirty && 'hidden group-hover:flex'
          )}
        >
          <XIcon className="size-3" />
        </button>
      </div>
    </div>
  )
}

/** 「+」新建标签页菜单（与空态菜单列表同一组入口；「文件」为打开「打开文件」页） */
const AddTabMenu: FC = () => {
  const openTab = useProjectPanelStore((s) => s.openTab)
  const openFileBrowser = useOpenFileBrowser()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="新建标签页"
          className="hover:bg-muted flex size-7 items-center justify-center rounded-md"
        >
          <PlusIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {PANEL_TAB_TYPES.slice(0, 2).map(({ type, label, icon: Icon, shortcut }) => (
          <DropdownMenuItem key={type} onClick={() => openTab(type)} className="gap-2">
            <Icon className="text-muted-foreground size-4" />
            <span>{label}</span>
            {shortcut && <span className="text-muted-foreground ml-auto text-xs">{shortcut}</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={openFileBrowser} className="gap-2">
          <FILE_MENU_ENTRY.icon className="text-muted-foreground size-4" />
          <span>{FILE_MENU_ENTRY.label}</span>
          <span className="text-muted-foreground ml-auto text-xs">{FILE_MENU_ENTRY.shortcut}</span>
        </DropdownMenuItem>
        {PANEL_TAB_TYPES.slice(2).map(({ type, label, icon: Icon, shortcut }) => (
          <DropdownMenuItem key={type} onClick={() => openTab(type)} className="gap-2">
            <Icon className="text-muted-foreground size-4" />
            <span>{label}</span>
            {shortcut && <span className="text-muted-foreground ml-auto text-xs">{shortcut}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 空态（无标签页）：纵向菜单列表；「文件」为打开「打开文件」页，其余打开对应标签页 */
const EmptyMenu: FC = () => {
  const openTab = useProjectPanelStore((s) => s.openTab)
  const openFileBrowser = useOpenFileBrowser()
  const items: (
    | { kind: 'tab'; type: PanelTabType; label: string; icon: LucideIcon; shortcut?: string }
    | { kind: 'browser'; label: string; icon: LucideIcon; shortcut?: string }
  )[] = [
    ...PANEL_TAB_TYPES.slice(0, 2).map((item) => ({ kind: 'tab' as const, ...item })),
    { kind: 'browser' as const, ...FILE_MENU_ENTRY },
    ...PANEL_TAB_TYPES.slice(2).map((item) => ({ kind: 'tab' as const, ...item }))
  ]
  return (
    <div className="flex flex-1 flex-col justify-center gap-1 px-3">
      {items.map((item) => (
        <button
          key={item.kind === 'tab' ? item.type : 'browser'}
          type="button"
          onClick={() => (item.kind === 'tab' ? openTab(item.type) : openFileBrowser())}
          className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm"
        >
          <item.icon className="text-muted-foreground size-4 shrink-0" />
          <span>{item.label}</span>
          {item.shortcut && (
            <span className="text-muted-foreground ml-auto text-xs">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * 「打开文件」标签页（未选择文件时）：面包屑行（"/" + 文件树开关）
 * + 占位提示 + 右侧文件树（可显隐/调宽）。选中文件后被该文件的标签原位替换。
 */
const FileBrowserPanel: FC = () => {
  // 「打开文件」页中树即内容，不受窄面板让位规则影响（占位提示可压缩）
  const treeVisible = useProjectPanelStore((s) => s.treeVisible)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex h-8 min-h-8 items-center gap-2 border-b px-2">
        <span className="text-muted-foreground flex-1 text-xs">/</span>
        <TreeToggleButton />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
          <FolderIcon className="text-muted-foreground size-8" />
          <div className="text-sm font-medium">打开文件</div>
          <div className="text-muted-foreground text-xs">从工作区目录树中选择文件</div>
        </div>
        {treeVisible && <FileTreeDock />}
      </div>
    </div>
  )
}

/**
 * 标签页内容：file-browser → 「打开文件」页；file → 文件预览/编辑面板
 * （面包屑行内含文件树开关，树停靠在面包屑行之下）；其余菜单类型暂为占位。
 * 注意 flex/min-h-0 链：Monaco automaticLayout 需要真实尺寸的有界父容器。
 */
const TabContent: FC<{ tab: PanelTab }> = ({ tab }) => {
  if (tab.type === 'file-browser') {
    return <FileBrowserPanel />
  }
  if (tab.type === 'file' && tab.filePath) {
    return <FilePreviewPanel filePath={tab.filePath} tabId={tab.id} />
  }
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
      {tabLabel(tab.type)}
    </div>
  )
}

/**
 * 项目面板：仅本地项目会话渲染（AgentPage 保证仅在 cwd 非空且 open 时挂载）。
 * 顶部标签栏（标签页 + 「+」菜单 + 最大化/收起按钮），主体为标签页内容；
 * 无标签页时只显示菜单列表。左缘可拖拽调整面板宽度（最大化时隐藏手柄）。
 */
export const ProjectPanel: FC<{ maximized: boolean }> = ({ maximized }) => {
  const width = useProjectPanelStore((s) => s.width)
  const setWidth = useProjectPanelStore((s) => s.setWidth)
  const tabs = useProjectPanelStore((s) => s.tabs)
  const activeTabId = useProjectPanelStore((s) => s.activeTabId)
  const toggleOpen = useProjectPanelStore((s) => s.toggleOpen)
  const toggleMaximized = useProjectPanelStore((s) => s.toggleMaximized)
  const [dragging, setDragging] = useState(false)

  // 拖拽左缘调整面板宽度：面板在右侧，向左拖变宽（区间限制在 store 的 setWidth 中处理）
  const startResize = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    setDragging(true)
    document.body.style.cursor = 'col-resize'

    const handleMove = (e: MouseEvent): void => {
      setWidth(startWidth + (startX - e.clientX))
    }
    const handleUp = (): void => {
      setDragging(false)
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null

  // orca 移植的组件（FileExplorerToolbar 等）直接使用裸 Tooltip，依赖外层 Provider
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'bg-background relative flex min-w-0 flex-col overflow-hidden rounded-lg',
          maximized ? 'flex-1' : 'ml-2 shrink-0'
        )}
        style={maximized ? undefined : { width }}
      >
        {/* 标签栏：标签页 + 「+」菜单（无标签时只留右侧按钮）；pr-4 与对话头部 px-4 对齐，使 PanelRight 开合面板时位置不动 */}
        <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto pr-4 pl-2">
          {tabs.map((tab) => (
            <TabButton key={tab.id} tab={tab} active={tab.id === activeTabId} />
          ))}
          {tabs.length > 0 && <AddTabMenu />}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <TooltipIconButton
              variant="ghost"
              size="icon"
              tooltip={maximized ? '还原面板' : '最大化面板'}
              side="bottom"
              onClick={toggleMaximized}
              className="size-8"
            >
              {maximized ? (
                <Minimize2Icon className="size-4" />
              ) : (
                <Maximize2Icon className="size-4" />
              )}
            </TooltipIconButton>
            <TooltipIconButton
              variant="ghost"
              size="icon"
              tooltip="收起面板"
              side="bottom"
              onClick={toggleOpen}
              className="size-8"
            >
              <PanelRightIcon className="size-4" />
            </TooltipIconButton>
          </div>
        </div>

        {/* 主体：标签页内容（无标签时只有菜单列表） */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeTab ? <TabContent tab={activeTab} /> : <EmptyMenu />}
        </div>

        {/* 左缘拖拽手柄：5px 热区 + 1px 高亮线（最大化时隐藏） */}
        {!maximized && (
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startResize}
            className="group absolute inset-y-0 left-0 z-10 w-[5px] cursor-col-resize"
          >
            <div
              className={cn(
                'mx-auto h-full w-px transition-colors',
                dragging ? 'bg-primary/40' : 'group-hover:bg-primary/25'
              )}
            />
          </div>
        )}
      </aside>
    </TooltipProvider>
  )
}
