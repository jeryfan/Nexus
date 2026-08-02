import { AccountMenu } from '@renderer/components/account-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import { popupService } from '@renderer/services/popup'
import type { ProjectTreeNode } from '@shared/agent/api/AgentDataApi'
import type { SessionSummaryDto } from '@shared/agent/types'
import {
  ArchiveIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderIcon,
  MoreHorizontalIcon,
  PinIcon,
  PlusIcon,
  SquarePenIcon,
  XIcon
} from 'lucide-react'
import { useRef, useState, type FC, type ReactNode } from 'react'

import { useAgentStore } from './agentStore'
import { localCapabilities } from './services/agentApi'

/** 行基础样式：项目/会话行统一；hover 动作绝对定位 + opacity 切换（不占布局，不抖动） */
const ROW_CLASS =
  'group relative flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors'
const ROW_ACTIONS_CLASS =
  'absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'

/** 行内精致小图标按钮（参考图风格：小尺寸、弱色、hover 加深） */
const RowIconButton: FC<{
  label: string
  onClick?: (event: React.MouseEvent) => void
  children: ReactNode
  active?: boolean
}> = ({ label, onClick, children, active }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={(event) => {
      event.stopPropagation()
      onClick?.(event)
    }}
    className={cn(
      'inline-flex size-6 items-center justify-center rounded transition-colors',
      active
        ? 'text-foreground'
        : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground'
    )}
  >
    {children}
  </button>
)

/** 对话区默认展示条数，超出折叠为"查看全部"（避免长列表把项目挤出首屏） */
const CHATS_PREVIEW_COUNT = 5

/** 主侧边栏的 Agent 区：新会话按钮 + 对话列表 + 按项目分组的会话列表 + 账户菜单。
 *  数据来自本地 DB（agentStore projects/chats，变更经推送自动刷新）。 */
export const AgentSidebar: FC = () => {
  const projects = useAgentStore((s) => s.projects)
  const chats = useAgentStore((s) => s.chats)
  const sessionStates = useAgentStore((s) => s.sessionStates)
  const createSession = useAgentStore((s) => s.createSession)
  // 折叠状态（组件内存，默认展开）
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showAllChats, setShowAllChats] = useState(false)

  const toggle = (projectId: string): void => {
    setExpanded((prev) => ({ ...prev, [projectId]: !(prev[projectId] ?? true) }))
  }

  const chatsOverflow = chats.length > CHATS_PREVIEW_COUNT
  const visibleChats = showAllChats ? chats : chats.slice(0, CHATS_PREVIEW_COUNT)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={() => createSession()}
          className="hover:bg-sidebar-accent/60 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors"
        >
          <PlusIcon className="size-4 shrink-0" />
          新会话
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {chats.length > 0 && (
          <>
            <div className="text-muted-foreground px-2.5 pt-2 pb-1 text-xs font-medium">对话</div>
            {visibleChats.map((session) => (
              <SessionRow key={session.sessionId} session={session} />
            ))}
            {chatsOverflow && (
              <button
                type="button"
                onClick={() => setShowAllChats((v) => !v)}
                className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
              >
                <ChevronDownIcon
                  className={cn('size-3.5 transition-transform', showAllChats && 'rotate-180')}
                />
                {showAllChats ? '收起' : `查看全部（${chats.length}）`}
              </button>
            )}
          </>
        )}
        {projects.length > 0 && (
          <div className="text-muted-foreground px-2.5 pt-2 pb-1 text-xs font-medium">项目</div>
        )}
        {projects.map((project) => (
          <ProjectSection
            key={project.id}
            project={project}
            streaming={project.sessions.some((s) => sessionStates[s.sessionId]?.isStreaming)}
            expanded={expanded[project.id] ?? true}
            onToggle={() => toggle(project.id)}
          />
        ))}
      </div>

      <div className="shrink-0 p-2">
        <AccountMenu />
      </div>
    </div>
  )
}

const ProjectSection: FC<{
  project: ProjectTreeNode
  streaming: boolean
  expanded: boolean
  onToggle: () => void
}> = ({ project, streaming, expanded, onToggle }) => {
  const createSession = useAgentStore((s) => s.createSession)
  const setProjectPinned = useAgentStore((s) => s.setProjectPinned)
  const setProjectRemoved = useAgentStore((s) => s.setProjectRemoved)
  const archiveProjectSessions = useAgentStore((s) => s.archiveProjectSessions)

  const confirmArchive = async (): Promise<void> => {
    const ok = await popupService.showConfirm('confirm', {
      title: '归档聊天',
      content: `归档「${project.name}」下的全部会话？（会话数据保留，暂不展示）`,
      okText: '归档',
      cancelText: '取消'
    })
    if (ok) await archiveProjectSessions(project.cwd)
  }

  const confirmRemove = async (): Promise<void> => {
    const ok = await popupService.showConfirm('warning', {
      title: '移除项目',
      content: `将「${project.name}」从列表移除？会话文件保留在磁盘上。`,
      okText: '移除',
      cancelText: '取消',
      okButtonProps: { danger: true }
    })
    if (ok) await setProjectRemoved(project.cwd, true)
  }

  return (
    <div className="mb-0.5">
      {/* 项目行：点击整行切换折叠；运行中右缘转圈；hover 显示 … 与 ✎ */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        className={cn(ROW_CLASS, 'hover:bg-sidebar-accent/50')}
      >
        <FolderIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate pr-16 font-medium" title={project.cwd}>
          {project.name}
        </span>
        {streaming && (
          <LoaderIcon className="text-muted-foreground absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin group-hover:hidden" />
        )}
        <div className={ROW_ACTIONS_CLASS}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <RowIconButton label="更多">
                  <MoreHorizontalIcon className="size-4" />
                </RowIconButton>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem
                onClick={() => void setProjectPinned(project.cwd, !project.pinned)}
              >
                <PinIcon className={cn('size-4', project.pinned && 'fill-current')} />
                {project.pinned ? '取消置顶' : '置顶项目'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void localCapabilities.revealInFinder(project.cwd)}>
                <FolderOpenIcon className="size-4" />
                在访达中显示
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void confirmArchive()}>
                <ArchiveIcon className="size-4" />
                归档聊天
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => void confirmRemove()}
              >
                <XIcon className="size-4" />
                移除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <RowIconButton label="在此项目下新建会话" onClick={() => createSession(project.cwd)}>
            <SquarePenIcon className="size-3.5" />
          </RowIconButton>
        </div>
      </div>

      {/* 组内会话（缩进与项目名对齐，形成层级） */}
      {expanded && (
        <div className="flex flex-col gap-0.5 pt-0.5 pl-6">
          {project.sessions.map((session) => (
            <SessionRow key={session.sessionId} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 悬浮时横向滚动显示完整标题（仅当文字溢出时）；滚动终点停在右侧按钮区之前，离开时复位 */
const MarqueeTitle: FC<{ text: string; className?: string }> = ({ text, className }) => {
  const containerRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  const measure = (): void => {
    const container = containerRef.current
    const inner = textRef.current
    if (!container || !inner) return
    const paddingRight = parseFloat(getComputedStyle(container).paddingRight) || 0
    const available = container.clientWidth - paddingRight
    setShift(Math.max(0, inner.scrollWidth - available))
  }

  return (
    <span
      ref={containerRef}
      className={cn('min-w-0 flex-1 overflow-hidden', className)}
      onMouseEnter={measure}
      onMouseLeave={() => setShift(0)}
      title={text}
    >
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap transition-transform ease-linear"
        style={{
          transform: shift > 0 ? `translateX(-${shift}px)` : undefined,
          transitionDuration: `${Math.max(0.4, shift / 40)}s`,
          transitionDelay: shift > 0 ? '200ms' : '0ms'
        }}
      >
        {text}
      </span>
    </span>
  )
}

const SessionRow: FC<{ session: SessionSummaryDto }> = ({ session }) => {
  const activeSessionId = useAgentStore((s) => s.activeSessionId)
  const sessionStates = useAgentStore((s) => s.sessionStates)
  const openSession = useAgentStore((s) => s.openSession)
  const setPinned = useAgentStore((s) => s.setPinned)
  const setArchived = useAgentStore((s) => s.setArchived)

  const active = activeSessionId === session.sessionId
  const streaming = sessionStates[session.sessionId]?.isStreaming ?? false

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void openSession(session.sessionId)}
      onKeyDown={(e) => e.key === 'Enter' && void openSession(session.sessionId)}
      className={cn(
        ROW_CLASS,
        'mx-1',
        active ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'
      )}
    >
      <MarqueeTitle text={session.title} className="pr-14" />
      {/* 置顶标记（常显）/ 运行蓝点（hover 时让位） */}
      {session.pinned && !streaming && (
        <PinIcon className="text-muted-foreground absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 fill-current group-hover:hidden" />
      )}
      {streaming && (
        <span className="absolute right-3 top-1/2 size-2 -translate-y-1/2 rounded-full bg-blue-500 group-hover:hidden" />
      )}
      {/* 滚动文字会被右侧不透明动作区遮挡；底色与行 hover/选中背景精确一致，避免接缝 */}
      <div
        className={cn(
          ROW_ACTIONS_CLASS,
          'rounded-md',
          active
            ? 'bg-sidebar-accent'
            : '[background-color:color-mix(in_oklab,var(--sidebar-accent)_50%,var(--sidebar))]'
        )}
      >
        <RowIconButton
          label={session.pinned ? '取消置顶' : '置顶聊天'}
          active={session.pinned}
          onClick={() => void setPinned(session.sessionId, !session.pinned)}
        >
          <PinIcon className={cn('size-3.5', session.pinned && 'fill-current')} />
        </RowIconButton>
        <RowIconButton label="归档聊天" onClick={() => void setArchived(session.sessionId, true)}>
          <ArchiveIcon className="size-3.5" />
        </RowIconButton>
      </div>
    </div>
  )
}
