/**
 * Monaco 查看器/编辑器（文件预览面板）。
 *
 * 保留：`@monaco-editor/react` <Editor>、系统明暗主题（vs-dark/vs）、查看器
 * options、`path={filePath}` 一文件一模型、saveViewState={false} +
 * keepCurrentModel、非受控 defaultValue + 只读单向内容同步（磁盘内容变化后
 * 重开同一文件时刷新缓存模型）、onContentChange 变更管线（propsRef 模式）与
 * Cmd/Ctrl+S 保存键绑定（Monaco addCommand → onSave）。
 * 裁剪：分屏回显抑制（Nexus 无 split pane）、自动保存、gutter 右键菜单、
 * markdown 批注、diff 支持、reveal/滚动恢复、settings store 联动。
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { ThemeMode } from '@shared/data/preference/preferenceTypes'
import { useTheme } from '@renderer/hooks/useTheme'
import { monaco } from './monaco-setup'

type MonacoEditorProps = {
  filePath: string
  content: string
  language: string
  readOnly?: boolean
  /**
   * content 变化前的上一个磁盘基线。同步 effect 仅当模型仍持有该值
   * （外部重读/重开场景）时才 setValue 回写；模型持有用户未保存输入时跳过。
   * 缺省时保持「总是同步」的旧行为（初始加载）。
   */
  expectedModelValue?: string
  /** 用户编辑驱动的内容变更（分屏回显抑制已裁剪） */
  onContentChange?: (content: string) => void
  /** Cmd/Ctrl+S 保存（编辑器聚焦时经 Monaco 命令触发；未聚焦由外层兜底） */
  onSave?: () => void
}

/**
 * language-detect 可能返回未注册进 Monaco 的 id（mermaid/notebook/csv/tsv/nim
 * 等）。未注册的语言在 Monaco 里无 token provider，统一回退 plaintext
 * （getLanguages 注册检查）。
 */
function resolveMonacoLanguage(language: string): string {
  return monaco.languages.getLanguages().some((item) => item.id === language)
    ? language
    : 'plaintext'
}

export default function MonacoEditor({
  filePath,
  content,
  language,
  readOnly = true,
  expectedModelValue,
  onContentChange,
  onSave
}: MonacoEditorProps): React.JSX.Element {
  // useTheme 的 theme 已由 ThemeProvider 解析 system → 实际的明暗模式
  const { theme } = useTheme()
  const isDark = theme === ThemeMode.dark
  const monacoLanguage = useMemo(() => resolveMonacoLanguage(language), [language])

  // propsRef 模式：渲染期同步赋值，
  // 保证 Monaco 回调（注册一次、长期存活）永远读到最新的 props。
  const propsRef = useRef({ onSave, onContentChange })
  propsRef.current = { onSave, onContentChange }

  // Why: keepCurrentModel + 非受控 defaultValue 意味着模型按 path 缓存、
  // defaultValue 只在模型首次创建时生效。同一文件经外部编辑器（如「打开」
  // 按钮）改动后重新打开，@monaco-editor/react 会复用旧的缓存模型。
  // 这里以最新读到的 content 为准做单向同步，但用 expectedModelValue（上一个
  // 基线）做回写守卫 —— 保存 resolve 会推进基线，若用户在写入期间继续输入，
  // 无守卫的 setValue 会把新输入回冲掉（静默丢数据）。三种场景：
  // 1) 干净保存：模型 == 保存的草稿 == 新 content → 第一个分支直接 no-op；
  // 2) 保存期间继续输入：模型 = 新输入 ≠ 上一个基线 → 跳过 setValue，
  //    dirty 对新基线重新计算仍为 true，用户内容保留；
  // 3) 外部重读/重开：模型仍持有上一个基线 == expectedModelValue →
  //    setValue(最新磁盘内容)。
  // expectedModelValue 缺省（初始加载）时退化为旧的总是同步行为。
  // 注意：模型 key 必须与 @monaco-editor/react 内部的 Uri.parse(path) 一致。
  useEffect(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(filePath))
    if (!model || model.getValue() === content) {
      return
    }
    if (expectedModelValue !== undefined && model.getValue() !== expectedModelValue) {
      return
    }
    model.setValue(content)
  }, [filePath, content, expectedModelValue])

  // handleChange 裁剪版：无分屏/粘贴抑制，
  // 直接把变更转发给 onContentChange。
  const handleChange = useCallback((value: string | undefined): void => {
    if (value !== undefined) {
      propsRef.current.onContentChange?.(value)
    }
  }, [])

  const handleMount = useCallback(
    (editorInstance: monaco.editor.IStandaloneCodeEditor): void => {
      // Why: Cmd/Ctrl+S 注册为 Monaco 命令，仅在编辑器聚焦时触发
      // （保存快捷键语义，用 addCommand 实现）；
      // 编辑器未聚焦的场景由 FilePreviewPanel 的 window 级监听兜底。
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        propsRef.current.onSave?.()
      })
    },
    []
  )

  return (
    <div className="relative h-full">
      <Editor
        height="100%"
        language={monacoLanguage}
        // Why: defaultValue, not controlled value — 编辑态由 draft 状态承载，
        // 受控 value 会与模型 setValue 重复写入。
        defaultValue={content}
        theme={isDark ? 'vs-dark' : 'vs'}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          automaticLayout: true,
          tabSize: 2,
          readOnly,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'off',
          padding: { top: 0 }
        }}
        path={filePath}
        onChange={handleChange}
        onMount={handleMount}
        // Why: 预览面板不恢复光标/滚动，关掉 @monaco-editor/react 的 view-state Map。
        saveViewState={false}
        keepCurrentModel
      />
    </div>
  )
}
