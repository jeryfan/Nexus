/**
 * 文件预览面板（header + 主体）。
 *
 * Header：面包屑 `项目名 > 相对/路径/文件.ts`（点击复制完整路径）+ 右侧
 * 文件树开关（文件夹图标）+「打开」按钮（shell.openInExternalEditor，默认 code / VS Code）。
 * 主体：loading / error / 二进制不可预览 / 图片 / Monaco 编辑器；
 * 文件树停靠在面包屑行之下（预览区与树的边框从该行下面开始）。
 *
 * 文本文件可编辑：Monaco readOnly=false + draft/
 * 基线双状态，dirty = normalize(draft) !== normalize(content)（markdown 按
 * trimEnd 归一），Cmd/Ctrl+S 保存（编辑器内 Monaco 命令 + window 级兜底），
 * dirty 状态经 tabId 上报 projectPanel store 供标签栏显示圆点。
 * 限制：外部修改冲突不做复杂处理 —— 仅在标签重开时重新读盘；
 * 切换标签时 TabContent 卸载，未保存草稿随之丢弃（不做 hot-exit
 * 草稿恢复）—— 刻意保留的限制。
 */
import '@nexus/ui/components/composites/markdown/styles'

import { defaultMarkdownPlugins, Markdown, withMath } from '@nexus/ui'
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileWarning, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { ipcApi } from '@renderer/ipc/ipcApi'
import { toast } from '@renderer/services/toast'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { selectActiveCwd, useAgentStore } from '../../agentStore'
import { FileTreeLayout, TreeToggleButton } from '../explorer/FileTreeDock'
import { readFile, writeFile, type FsReadFileResult } from '../fsClient'
import { detectLanguage } from '../lib/language-detect'
import { basename, getRelativePathInsideRoot } from '../lib/path'
import MonacoEditor from './MonacoEditor'

type FilePreviewPanelProps = {
  filePath: string
  /** 对应的项目面板标签 id（用于上报 dirty 状态；缺省时不上报） */
  tabId?: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; result: FsReadFileResult }

/** markdown / HTML 支持渲染预览，默认预览模式，可切换回源代码 */
type RenderableLanguage = 'markdown' | 'html'

function asRenderable(language: string): RenderableLanguage | null {
  return language === 'markdown' || language === 'html' ? language : null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function FilePreviewPanel({ filePath, tabId }: FilePreviewPanelProps): React.JSX.Element {
  const rootPath = useAgentStore(selectActiveCwd)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // 磁盘基线 content（保存成功后更新）与编辑器草稿 draft；未加载完成时为 null
  const [content, setContent] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  // 基线镜像 ref 与「上一个基线」ref：后者作为 expectedModelValue 传给
  // Monaco 同步 effect —— 保存 resolve 推进基线时，模型若仍持有上一个基线
  // （无用户新输入）才允许 setValue 回写，否则跳过以保留写入期间的输入。
  const contentRef = useRef<string | null>(null)
  const previousBaselineRef = useRef<string | null>(null)
  const setBaseline = useCallback((next: string | null): void => {
    previousBaselineRef.current = contentRef.current
    contentRef.current = next
    setContent(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    // 切换文件时重置基线与草稿（dirty 随之清零）；previousBaseline 经
    // setBaseline(null) → setBaseline(新内容) 归位为 null（初始加载语义，
    // Monaco 同步 effect 此时总是回写）
    setBaseline(null)
    setDraft(null)
    readFile(filePath)
      .then((result) => {
        if (!cancelled) {
          setBaseline(result.content)
          setDraft(result.content)
          setState({ status: 'loaded', result })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: getErrorMessage(error) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [filePath, setBaseline])

  const language = useMemo(() => detectLanguage(filePath), [filePath])
  const renderable = asRenderable(language)
  const markdownId = useId()
  // markdown / HTML 默认渲染预览，可切回源代码；切换文件时归位为预览
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  useEffect(() => {
    setViewMode('preview')
  }, [filePath])

  // dirty 判定（normalize 比较）：
  // markdown 按 trimEnd 归一后比较，其余语言原样比较。
  const dirty = useMemo(() => {
    if (draft === null || content === null) {
      return false
    }
    const normalize =
      language === 'markdown' ? (value: string): string => value.trimEnd() : (value: string): string => value
    return normalize(draft) !== normalize(content)
  }, [draft, content, language])

  // 上报 dirty 到面板 store（标签栏圆点）；卸载/dirty 变化时先清后设
  const setTabDirty = useProjectPanelStore((s) => s.setTabDirty)
  useEffect(() => {
    if (!tabId) {
      return
    }
    setTabDirty(tabId, dirty)
    return () => setTabDirty(tabId, false)
  }, [tabId, dirty, setTabDirty])

  // 写入在途守卫：快速连按 Cmd+S 不会并发多个写请求
  const savingRef = useRef(false)
  const handleSave = useCallback((): void => {
    if (draft === null || !dirty || savingRef.current) {
      return
    }
    savingRef.current = true
    writeFile(filePath, draft)
      .then(() => {
        // 保存成功：基线总是更新为已保存的草稿（dirty 对新基线重算）。
        // 若写入期间用户继续输入（模型 ≠ 上一个基线），Monaco 同步 effect
        // 的 expectedModelValue 守卫会跳过 setValue，新输入不会被回冲。
        setBaseline(draft)
        toast.success('已保存')
      })
      .catch((error: unknown) => toast.error(getErrorMessage(error)))
      .finally(() => {
        savingRef.current = false
      })
  }, [filePath, draft, dirty, setBaseline])

  // window 级 Cmd/Ctrl+S 兜底：Monaco 未聚焦时也能保存
  // （仅当前标签激活且 dirty 时接管按键）
  const isActiveTab = useProjectPanelStore((s) => tabId !== undefined && s.activeTabId === tabId)
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  useEffect(() => {
    if (!isActiveTab || !dirty) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault()
        handleSaveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isActiveTab, dirty])

  // 面包屑：项目名 > 相对路径各段（文件在 root 外时退化为完整路径）
  const breadcrumbSegments = useMemo(() => {
    const relativePath = getRelativePathInsideRoot(filePath, rootPath)
    if (rootPath && relativePath !== null) {
      return [basename(rootPath), ...relativePath.split('/').filter(Boolean)]
    }
    return filePath.split(/[\\/]/).filter(Boolean)
  }, [filePath, rootPath])

  const handleCopyPath = (): void => {
    // click-to-copy-path 行为
    navigator.clipboard
      .writeText(filePath)
      .then(() => toast.success('已复制路径'))
      .catch((error: unknown) => toast.error(getErrorMessage(error)))
  }

  const handleOpenInEditor = (): void => {
    ipcApi
      .request('shell.openInExternalEditor', { path: filePath })
      .catch((error: unknown) => toast.error(getErrorMessage(error)))
  }

  const renderBody = (): React.JSX.Element => {
    if (state.status === 'loading') {
      return (
        <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          加载中...
        </div>
      )
    }
    if (state.status === 'error') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-xs text-muted-foreground">
          <FileWarning className="size-8" />
          <span className="max-w-md break-all">{state.message}</span>
        </div>
      )
    }

    const { result } = state
    const isPreviewableImage = result.isImage === true && result.mimeType?.startsWith('image/')
    if (result.isBinary && !isPreviewableImage) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <FileWarning className="size-8" />
          二进制文件不可预览
        </div>
      )
    }
    if (isPreviewableImage) {
      // 图片预览：布局方式（滚动容器内居中、object-contain）
      return (
        <div className="h-full overflow-auto bg-muted/20">
          <div className="flex h-max min-h-full w-max min-w-full items-center justify-center p-4">
            <img
              src={`data:${result.mimeType};base64,${result.content}`}
              alt={basename(filePath)}
              className="block max-w-full object-contain"
            />
          </div>
        </div>
      )
    }
    // markdown / HTML：默认渲染预览（预览显示草稿内容，源代码模式下的修改即时反映）
    if (renderable && viewMode === 'preview') {
      const source = draft ?? content ?? result.content
      if (renderable === 'markdown') {
        return (
          <div className="markdown h-full overflow-auto px-4 py-3">
            <Markdown id={markdownId} plugins={{ cjk: defaultMarkdownPlugins.cjk, math: withMath() }}>
              {source}
            </Markdown>
          </div>
        )
      }
      return (
        <iframe
          sandbox=""
          srcDoc={source}
          title={basename(filePath)}
          className="block h-full w-full bg-white"
        />
      )
    }
    return (
      <MonacoEditor
        filePath={filePath}
        content={content ?? result.content}
        language={language}
        readOnly={false}
        expectedModelValue={previousBaselineRef.current ?? undefined}
        onContentChange={setDraft}
        onSave={handleSave}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 min-h-8 items-center gap-2 border-b border-border px-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          title={`${filePath}\n点击复制路径`}
          onClick={handleCopyPath}
        >
          {breadcrumbSegments.map((segment, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="shrink-0 text-muted-foreground/50">&gt;</span>}
              <span className={index === 0 ? 'shrink-0 font-medium text-foreground' : 'truncate'}>
                {segment}
              </span>
            </React.Fragment>
          ))}
        </button>
        {renderable && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setViewMode((mode) => (mode === 'preview' ? 'source' : 'preview'))}
          >
            {viewMode === 'preview' ? '查看源代码' : '查看预览'}
          </Button>
        )}
        <TreeToggleButton />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 gap-1 text-muted-foreground hover:text-foreground"
          onClick={handleOpenInEditor}
        >
          <ExternalLink className="size-3" />
          打开
        </Button>
      </div>
      {/* 文件树停靠在面包屑行之下：预览区与树之间的边框从「打开」一行下面开始 */}
      <FileTreeLayout>
        <div className="h-full w-full min-w-0">{renderBody()}</div>
      </FileTreeLayout>
    </div>
  )
}

export default React.memo(FilePreviewPanel)
