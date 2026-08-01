import '@nexus/ui/components/composites/markdown/styles'

import { defaultMarkdownPlugins, Markdown, withMath } from '@nexus/ui'
import type { FC } from 'react'
import React, { useEffect, useId, useState } from 'react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  height?: string | number
  autoFocus?: boolean
}

const MarkdownEditor: FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = '请输入Markdown格式文本...',
  height = '300px',
  autoFocus = false
}) => {
  const markdownId = useId()
  const [inputValue, setInputValue] = useState(value || '')

  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
  }

  return (
    <div className="flex w-full overflow-hidden rounded-lg border border-border" style={{ height }}>
      <textarea
        className="flex-1 resize-none border-0 border-border border-r bg-background p-3 font-[var(--font-family)] text-foreground text-sm leading-[1.5] outline-none placeholder:text-foreground-muted focus:outline-none"
        value={inputValue}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <div className="markdown flex-1 overflow-auto bg-background p-3">
        <Markdown id={markdownId} plugins={{ cjk: defaultMarkdownPlugins.cjk, math: withMath() }}>
          {inputValue || '预览区域'}
        </Markdown>
      </div>
    </div>
  )
}

export default MarkdownEditor

