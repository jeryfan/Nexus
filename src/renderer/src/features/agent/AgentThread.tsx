/**
 * AgentThread — adapted from assistant-ui's official full example (base.tsx,
 * assistant-ui repo apps/docs), keeping its complete feature set: Thread
 * viewport, welcome + suggestions, Lexical composer with attachments, quote
 * preview/selection toolbar, slash commands, reasoning fold,
 * ToolFallback/ToolGroup, branch picker, edit/reload action bars, working
 * indicator, model selector.
 *
 * Adaptations: docs data sources replaced with the real agent store
 * (ModelPicker → ModelRuntime 可用模型；slash commands → 发送真实 prompt），
 * CloneThreadShell → AgentShell（本目录），next/image 移除，文案中文化。
 */
import { MarkdownText } from '@renderer/components/assistant-ui/markdown-text'
import { DotMatrix } from '@renderer/components/assistant-ui/dot-matrix'
import { MessageTiming } from '@renderer/components/assistant-ui/message-timing'
import { ToolFallback } from '@renderer/components/assistant-ui/tool-fallback'
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger
} from '@renderer/components/assistant-ui/tool-group'
import { TooltipIconButton } from '@renderer/components/assistant-ui/tooltip-icon-button'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { useNavigationStore } from '@renderer/stores/navigation'
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger
} from '@renderer/components/assistant-ui/reasoning'
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments
} from '@renderer/components/assistant-ui/attachment'
import {
  ComposerQuotePreview,
  QuoteBlock,
  SelectionToolbar
} from '@renderer/components/assistant-ui/quote'
import { ComposerTriggerPopover } from '@renderer/components/assistant-ui/composer-trigger-popover'
import { DirectiveText } from '@renderer/components/assistant-ui/directive-text'
import { ModelSelector, type ModelOption } from '@renderer/components/assistant-ui/model-selector'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  useAuiState,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  unstable_useMentionAdapter,
  unstable_useSlashCommandAdapter,
  useAui,
  type Unstable_SlashCommand
} from '@assistant-ui/react'
import { LexicalComposerInput, type DirectiveChipProps } from '@assistant-ui/react-lexical'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  FolderSearchIcon,
  HelpCircleIcon,
  LanguagesIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PencilIcon,
  RefreshCwIcon,
  SlashIcon,
  SquareIcon,
  TableIcon,
  WrenchIcon
} from 'lucide-react'
import { useMemo, type FC } from 'react'

import { selectActiveCwd, useAgentStore } from './agentStore'
import { WorkspaceTray } from './WorkspaceTray'

const isNewChatView = (s: AssistantState): boolean =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading)

const ThreadTitle: FC = () => {
  const title = useAuiState(
    (s) => s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)?.title
  )
  return <span className="min-w-0 truncate text-sm font-medium">{title ?? '新会话'}</span>
}

export const AgentHeader: FC = () => {
  const cwd = useAgentStore(selectActiveCwd)
  const panelOpen = useProjectPanelStore((s) => s.open)
  const toggleOpen = useProjectPanelStore((s) => s.toggleOpen)
  return (
    <header className="app-drag flex h-12 shrink-0 items-center gap-2 px-4">
      <ThreadTitle />
      {cwd !== null && !panelOpen && (
        // 面板开关固定在窗口右上角：面板打开后此按钮由面板标签栏的同一位置按钮
        // 接管（此处隐藏，避免对话区收窄后头部再出现一组重复按钮）
        <TooltipIconButton
          variant="ghost"
          size="icon"
          tooltip="项目面板"
          side="bottom"
          onClick={toggleOpen}
          className="app-no-drag ml-auto size-8"
        >
          <PanelRightIcon className="size-4" />
        </TooltipIconButton>
      )}
    </header>
  )
}

export const AgentThread: FC = () => {
  const isEmpty = useAuiState(isNewChatView)

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ['--thread-max-width' as string]: '44rem',
        ['--composer-bg' as string]:
          'color-mix(in oklab, var(--color-muted) 30%, var(--color-background))',
        ['--composer-radius' as string]: '1.5rem',
        ['--composer-padding' as string]: '8px'
      }}
    >
      <ThreadPrimitive.Viewport
        className={cn(
          'relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth px-4 pt-4',
          isEmpty && 'justify-center'
        )}
      >
        <AuiIf condition={isNewChatView}>
          <ThreadWelcome />
        </AuiIf>

        <div className="mb-14 flex flex-col gap-y-6 empty:hidden">
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.composer.isEditing) return <EditComposer />
              if (message.role === 'user') return <UserMessage />
              return <AssistantMessage />
            }}
          </ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter
          className={cn(
            'aui-thread-viewport-footer bg-background mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible pb-4 md:pb-6',
            !isEmpty && 'sticky bottom-0 mt-auto rounded-t-(--composer-radius)'
          )}
        >
          <ThreadScrollToBottom />
          <Composer />
          <AuiIf condition={isNewChatView}>
            <div className="min-h-19">
              <AuiIf condition={(s) => s.composer.isEmpty}>
                <ThreadSuggestions />
              </AuiIf>
            </div>
          </AuiIf>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>

      <SelectionToolbar />
    </ThreadPrimitive.Root>
  )
}

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="滚动到底部"
        variant="outline"
        className="dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  )
}

const ThreadWelcome: FC = () => {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-(--thread-max-width) flex-col items-center px-4 text-center">
      <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-semibold duration-200">
        有什么可以帮你的？
      </h1>
    </div>
  )
}

const SUGGESTIONS: { icon: FC<{ className?: string }>; label: string; prompt: string }[] = [
  {
    icon: FolderSearchIcon,
    label: '看看工作区里有什么',
    prompt: '列出当前工作区里的文件和目录，简单介绍每个文件'
  },
  {
    icon: FileTextIcon,
    label: '写一份周报模板',
    prompt: '在当前目录创建一份中文周报模板 markdown 文件'
  },
  {
    icon: TableIcon,
    label: '整理数据成表格',
    prompt: '把当前目录里的 csv 文件汇总成一个表格'
  }
]

const ThreadSuggestions: FC = () => {
  const aui = useAui()

  const sendPrompt = (prompt: string): void => {
    if (aui.thread.getState().isRunning) return
    aui.thread.append({
      content: [{ type: 'text', text: prompt }],
      runConfig: aui.composer.getState().runConfig
    })
  }

  return (
    <div className="flex w-full flex-col gap-2 px-4">
      <div className="scrollbar-none w-full overflow-x-auto">
        <div className="mx-auto flex w-max items-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion.label}
              variant="ghost"
              className="text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors [&_svg]:size-4"
              onClick={() => sendPrompt(suggestion.prompt)}
            >
              <suggestion.icon />
              {suggestion.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function DirectiveChip(props: DirectiveChipProps): React.JSX.Element {
  const { directiveId, directiveType, label } = props
  const showWrench = directiveType !== 'command'
  return (
    <span
      className="aui-directive-chip"
      data-directive-type={directiveType}
      data-directive-id={directiveId}
    >
      {showWrench && (
        <span className="aui-directive-chip-icon">
          <WrenchIcon className="size-3" />
        </span>
      )}
      <span className="aui-directive-chip-label">{label}</span>
    </span>
  )
}

const slashIconMap: Record<string, FC<{ className?: string }>> = {
  FileText: FileTextIcon,
  Languages: LanguagesIcon,
  HelpCircle: HelpCircleIcon
}

const Composer: FC = () => {
  const aui = useAui()
  const mention = unstable_useMentionAdapter({ fallbackIcon: WrenchIcon })

  const slashCommands: readonly Unstable_SlashCommand[] = useMemo(
    () => [
      {
        id: 'summarize',
        description: '总结当前对话',
        icon: 'FileText',
        execute: () =>
          aui.thread.append({ content: [{ type: 'text', text: '请总结到目前为止的对话内容' }] })
      },
      {
        id: 'translate',
        description: '把最近的内容翻译成英文',
        icon: 'Languages',
        execute: () =>
          aui.thread.append({
            content: [{ type: 'text', text: '请把最近的回复内容翻译成英文' }]
          })
      },
      {
        id: 'help',
        description: '你能做什么',
        icon: 'HelpCircle',
        execute: () =>
          aui.thread.append({
            content: [{ type: 'text', text: '你能做什么？请简单介绍你的能力' }]
          })
      }
    ],
    [aui]
  )
  const slash = unstable_useSlashCommandAdapter({
    commands: slashCommands,
    iconMap: slashIconMap,
    fallbackIcon: SlashIcon
  })

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root className="relative flex w-full flex-col">
        <ComposerPrimitive.AttachmentDropzone asChild>
          <div
            data-slot="aui_composer-shell"
            className="border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-within:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.05)] data-[dragging=true]:border-dashed dark:shadow-none"
          >
            <ComposerQuotePreview />
            <ComposerAttachments />
            <LexicalComposerInput
              directiveChip={DirectiveChip}
              placeholder="发消息给 Nexus…（@ 提及，/ 命令）"
              className="[&_.aui-lexical-placeholder]:text-muted-foreground/80 relative max-h-40 min-h-20 w-full resize-none bg-transparent px-2.5 py-1 text-base outline-none [&_.aui-directive-chip]:inline-flex [&_.aui-directive-chip]:items-baseline [&_.aui-directive-chip]:gap-1 [&_.aui-directive-chip]:rounded-md [&_.aui-directive-chip]:bg-blue-100 [&_.aui-directive-chip]:px-1.5 [&_.aui-directive-chip]:py-0.5 [&_.aui-directive-chip]:text-[13px] [&_.aui-directive-chip]:leading-none [&_.aui-directive-chip]:font-medium [&_.aui-directive-chip]:text-blue-700 dark:[&_.aui-directive-chip]:bg-blue-900/50 dark:[&_.aui-directive-chip]:text-blue-300 [&_.aui-directive-chip-icon]:self-center [&_.aui-lexical-input]:min-h-lh [&_.aui-lexical-input]:outline-none [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:top-0 [&_.aui-lexical-placeholder]:right-0 [&_.aui-lexical-placeholder]:left-0 [&_.aui-lexical-placeholder]:truncate [&_.aui-lexical-placeholder]:px-2.5 [&_.aui-lexical-placeholder]:py-1"
            />
            <ComposerAction />
            <WorkspaceTray />
          </div>
        </ComposerPrimitive.AttachmentDropzone>

        <ComposerTriggerPopover char="@" {...mention} />
        <ComposerTriggerPopover char="/" {...slash} emptyItemsLabel="没有匹配的命令" />
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  )
}

const ModelPicker: FC = () => {
  const models = useAgentStore((s) => s.models)
  const activeModel = useAgentStore((s) => s.activeModel)
  const setModel = useAgentStore((s) => s.setModel)
  const activeEffort = useAgentStore((s) => s.activeEffort)
  const setEffort = useAgentStore((s) => s.setEffort)

  const options: ModelOption[] = useMemo(
    () =>
      models.map((m) => ({
        id: `${m.provider}/${m.modelId}`,
        name: m.name,
        description: m.provider,
        keywords: [m.provider, m.modelId],
        efforts: m.reasoning
      })),
    [models]
  )

  if (options.length === 0) return null

  return (
    <ModelSelector
      models={options}
      {...(activeModel ? { value: `${activeModel.provider}/${activeModel.modelId}` } : {})}
      onValueChange={(value) => {
        const [provider, ...rest] = value.split('/')
        const modelId = rest.join('/')
        if (provider && modelId) void setModel({ provider, modelId })
      }}
      {...(activeEffort ? { effort: activeEffort } : {})}
      onEffortChange={(effort) => setEffort(effort)}
      variant="ghost"
      size="sm"
      searchable
      align="end"
      className="h-7 rounded-full"
    />
  )
}

const ComposerAction: FC = () => {
  const hasModels = useAgentStore((s) => s.models.length > 0)
  const navigate = useNavigationStore((s) => s.navigate)

  return (
    <div className="relative flex items-center justify-between">
      <div className="flex items-center gap-1">
        <ComposerAddAttachment />
      </div>
      <div className="flex items-center gap-1.5">
        <ModelPicker />
        {!hasModels && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 gap-1 rounded-full px-2.5 text-xs"
            onClick={() => navigate('settings')}
            aria-label="配置模型"
          >
            配置模型
          </Button>
        )}
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="size-7 rounded-full"
              disabled={!hasModels}
              aria-label="发送"
            >
              <ArrowUpIcon className="size-4.5 lucide-custom" />
            </Button>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="size-7 rounded-full"
              aria-label="停止生成"
            >
              <SquareIcon className="size-3.5 lucide-custom fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  )
}

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  )
}

const AssistantWorkingIndicator: FC = () => {
  const isEmpty = useAuiState((s) => s.message.content.length === 0)
  if (isEmpty) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-2 align-middle">
        <DotMatrix state="connecting" aria-hidden />
        <span className="text-sm">正在连接</span>
      </span>
    )
  }
  return (
    <span className="animate-pulse font-sans" aria-label="Assistant is working">
      ●
    </span>
  )
}

const AssistantMessage: FC = () => {
  const ACTION_BAR_HEIGHT = '-mb-7.5 min-h-7.5 pt-1.5'

  return (
    <MessagePrimitive.Root
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative mx-auto w-full max-w-(--thread-max-width) duration-150"
    >
      <div className="text-foreground px-2 leading-relaxed wrap-break-word">
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ['group-chainOfThought', 'group-reasoning'],
            'tool-call': ['group-chainOfThought', 'group-tool'],
            'standalone-tool-call': []
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case 'group-chainOfThought':
                return <div>{children}</div>
              case 'group-tool':
                return (
                  <ToolGroupRoot variant="ghost" streaming={part.status.type === 'running'}>
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === 'running'}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                )
              case 'group-reasoning': {
                const running = part.status.type === 'running'
                return (
                  <ReasoningRoot streaming={running}>
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                )
              }
              case 'text':
                return <MarkdownText />
              case 'reasoning':
                return <Reasoning {...part} />
              case 'tool-call':
                return part.toolUI ?? <ToolFallback {...part} />
              case 'indicator':
                return <AssistantWorkingIndicator />
              case 'data':
                return part.dataRendererUI
              default:
                return null
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>

      <div className={cn('ml-2 flex items-center', ACTION_BAR_HEIGHT)}>
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  )
}

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ml-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="复制">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="重新生成">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton tooltip="更多" className="data-[state=open]:bg-accent">
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              导出为 Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      <MessageTiming />
    </ActionBarPrimitive.Root>
  )
}

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-role="user"
      className="fade-in slide-in-from-bottom-1 animate-in mx-auto grid w-full max-w-(--thread-max-width) auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
    >
      <UserMessageAttachments />

      <div className="relative col-start-2 min-w-0">
        <div className="peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          <MessagePrimitive.Quote>{(quote) => <QuoteBlock {...quote} />}</MessagePrimitive.Quote>
          <MessagePrimitive.Parts components={{ Text: DirectiveText }} />
        </div>
        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  )
}

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end"
    >
      <EditUserMessageButton />
    </ActionBarPrimitive.Root>
  )
}

const EditUserMessageButton: FC = () => {
  // 直接调用消息级 edit composer 的 beginEdit（ActionBarPrimitive.Edit 在
  // external-store 下不渲染，原因见其源码 useActionBarEdit 的状态解析）
  const aui = useAui()
  return (
    <TooltipIconButton tooltip="编辑" onClick={() => aui.composer.beginEdit()}>
      <PencilIcon />
    </TooltipIconButton>
  )
}

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2">
      <ComposerPrimitive.Root className="border-border/60 dark:border-muted-foreground/15 ml-auto flex w-full max-w-[85%] flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
        <LexicalComposerInput
          directiveChip={DirectiveChip}
          autoFocus
          className="text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none [&_.aui-directive-chip]:inline-flex [&_.aui-directive-chip]:items-baseline [&_.aui-directive-chip]:gap-1 [&_.aui-directive-chip]:rounded-md [&_.aui-directive-chip]:bg-blue-100 [&_.aui-directive-chip]:px-1.5 [&_.aui-directive-chip]:py-0.5 [&_.aui-directive-chip]:text-[13px] [&_.aui-directive-chip]:leading-none [&_.aui-directive-chip]:font-medium [&_.aui-directive-chip]:text-blue-700 dark:[&_.aui-directive-chip]:bg-blue-900/50 dark:[&_.aui-directive-chip]:text-blue-300 [&_.aui-directive-chip-icon]:self-center [&_.aui-lexical-input]:min-h-lh [&_.aui-lexical-input]:outline-none"
        />
        <div className="mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3.5">
              取消
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 rounded-full px-3.5">
              更新
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  )
}

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn('text-muted-foreground mr-2 -ml-2 inline-flex items-center text-xs', className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="上一个">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="下一个">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  )
}
