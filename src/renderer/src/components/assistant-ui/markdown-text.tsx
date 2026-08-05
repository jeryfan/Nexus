'use client'

import '@nexus/ui/components/composites/markdown/styles'

import { useAuiState, type AssistantState } from '@assistant-ui/react'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { memo } from 'react'
import { Streamdown, type Components, type PluginConfig } from 'streamdown'

import { selectActiveCwd, useAgentStore } from '@renderer/features/agent/agentStore'
import { ipcApi } from '@renderer/ipc/ipcApi'
import { cn } from '@renderer/lib/utils'
import { useBrowserStore } from '@renderer/stores/browser'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'

/**
 * 聊天 Markdown 渲染：Streamdown 按块（block）memo，流式更新只重解析末尾
 * 未闭合块——替代 react-markdown 的每次提交全量重解析（长消息成本随长度
 * 平方增长）。代码块用 Streamdown 自带 CodeBlock（Shiki 高亮 + 复制控件）。
 */

/**
 * 解析聊天 markdown 链接中的本地文件路径（AI 按约定输出 [名](绝对路径)）。
 * 仅识别绝对路径 / file:// URL / Windows 盘符路径；http(s)、锚点等返回 null 走默认行为。
 */
function resolveLocalFilePath(href: string | undefined): string | null {
  if (!href) return null
  let path: string | null = null
  if (href.startsWith('/')) path = href
  else if (href.startsWith('file://')) path = href.slice('file://'.length)
  else if (/^[a-zA-Z]:[\\/]/.test(href)) path = href
  if (!path) return null
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/** 点击本地文件链接：打开右侧面板并以预览标签展示文件（仅项目会话有面板） */
function openLocalFileInPanel(path: string): void {
  if (selectActiveCwd(useAgentStore.getState()) === null) return
  const panel = useProjectPanelStore.getState()
  if (!panel.open) panel.toggleOpen()
  panel.openFileTab(path, { preview: true })
}

/** 点击 http(s) 链接：优先在内置浏览器打开（当前项目会话建标签），
 *  无项目会话（草稿/无 cwd，面板不渲染）时回退系统浏览器。 */
function openHttpLink(url: string): void {
  const state = useAgentStore.getState()
  const sessionId = state.activeSessionId
  if (sessionId && selectActiveCwd(state) !== null) {
    useBrowserStore.getState().createBrowserTab(sessionId, url, { title: url })
  } else {
    void ipcApi.request('shell.openUrl', { url })
  }
}

const CHAT_MARKDOWN_PLUGINS: PluginConfig = { code, cjk }

/** 文本/推理 part 选择器：模块级常量保持 useAuiState 订阅身份稳定。 */
const selectTextPart = (s: AssistantState) =>
  s.part.type === 'text' || s.part.type === 'reasoning' ? s.part : null

const chatComponents: Components = {
  h1: ({ className, node, ...props }) => (
    <h1
      className={cn(
        'aui-md-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h2: ({ className, node, ...props }) => (
    <h2
      className={cn(
        'aui-md-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h3: ({ className, node, ...props }) => (
    <h3
      className={cn(
        'aui-md-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h4: ({ className, node, ...props }) => (
    <h4
      className={cn(
        'aui-md-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0',
        className
      )}
      {...props}
    />
  ),
  h5: ({ className, node, ...props }) => (
    <h5 className={cn('aui-md-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0', className)} {...props} />
  ),
  h6: ({ className, node, ...props }) => (
    <h6 className={cn('aui-md-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0', className)} {...props} />
  ),
  p: ({ className, node, ...props }) => (
    <p className={cn('aui-md-p my-3 leading-relaxed first:mt-0 last:mb-0', className)} {...props} />
  ),
  a: ({ className, href, node, ...props }) => (
    <a
      className={cn(
        'aui-md-a text-primary hover:text-primary/80 underline underline-offset-2',
        className
      )}
      href={href}
      onClick={(event) => {
        const path = resolveLocalFilePath(href)
        if (path) {
          event.preventDefault()
          openLocalFileInPanel(path)
          return
        }
        // Why: http(s) 链接在内置浏览器打开（无项目会话时回退系统浏览器）。
        // 不拦截的话默认行为会让主窗口直接导航，整个应用被带走（白屏事故）；
        // 主进程 will-navigate 守卫是第二道防线。
        if (href && /^https?:\/\//.test(href)) {
          event.preventDefault()
          openHttpLink(href)
        }
      }}
      {...props}
    />
  ),
  blockquote: ({ className, node, ...props }) => (
    <blockquote
      className={cn(
        'aui-md-blockquote border-muted-foreground/30 text-muted-foreground my-3 border-s-2 ps-4',
        className
      )}
      {...props}
    />
  ),
  ul: ({ className, node, ...props }) => (
    <ul
      className={cn(
        'aui-md-ul marker:text-muted-foreground my-3 ms-5 list-disc [&>li]:mt-1',
        className
      )}
      {...props}
    />
  ),
  ol: ({ className, node, ...props }) => (
    <ol
      className={cn(
        'aui-md-ol marker:text-muted-foreground my-3 ms-5 list-decimal [&>li]:mt-1',
        className
      )}
      {...props}
    />
  ),
  hr: ({ className, node, ...props }) => (
    <hr className={cn('aui-md-hr border-muted-foreground/20 my-3', className)} {...props} />
  ),
  table: ({ className, node, ...props }) => (
    <table
      className={cn(
        'aui-md-table my-3 w-full border-separate border-spacing-0 overflow-y-auto',
        className
      )}
      {...props}
    />
  ),
  th: ({ className, node, ...props }) => (
    <th
      className={cn(
        'aui-md-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  td: ({ className, node, ...props }) => (
    <td
      className={cn(
        'aui-md-td border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  tr: ({ className, node, ...props }) => (
    <tr
      className={cn(
        'aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg',
        className
      )}
      {...props}
    />
  ),
  li: ({ className, node, ...props }) => (
    <li className={cn('aui-md-li leading-relaxed', className)} {...props} />
  ),
  strong: ({ className, node, ...props }) => (
    <strong className={cn('aui-md-strong font-semibold', className)} {...props} />
  ),
  sup: ({ className, node, ...props }) => (
    <sup className={cn('aui-md-sup [&>a]:text-xs [&>a]:no-underline', className)} {...props} />
  ),
  inlineCode: ({ className, node, ...props }) => (
    <code
      className={cn(
        'aui-md-inline-code bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em]',
        className
      )}
      {...props}
    />
  )
}

const MarkdownTextImpl = () => {
  const part = useAuiState(selectTextPart)
  if (!part) return null
  return (
    <Streamdown
      className="aui-md"
      components={chatComponents}
      isAnimating={part.status.type === 'running'}
      lineNumbers={false}
      mode="streaming"
      plugins={CHAT_MARKDOWN_PLUGINS}
    >
      {part.text}
    </Streamdown>
  )
}

export const MarkdownText = memo(MarkdownTextImpl)
