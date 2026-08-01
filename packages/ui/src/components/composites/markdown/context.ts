import { createContext, use } from 'react'

/**
 * Carries the raw markdown source to sub-components rendered inside a
 * `<Markdown>` (e.g. a table action may need the original source for
 * "copy as markdown").
 */
export interface MarkdownBlockContextValue {
  content: string
}

export const MarkdownBlockContext = createContext<MarkdownBlockContextValue | null>(null)

export function useMarkdownBlockContext(): MarkdownBlockContextValue | null {
  return use(MarkdownBlockContext)
}
