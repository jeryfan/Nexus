/**
 * Public barrel for the generic markdown composites.
 *
 * - `<Markdown>` — static content such as settings descriptions and notes.
 * - Plugin presets keep code, CJK line breaking, and math opt-in at the call site.
 * - Rehype plugins + sanitize schema remain available to static consumers.
 * Side-effect styles: `import '@nexus/ui/components/composites/markdown/styles'`
 * once at app entry to pick up Streamdown / KaTeX / remark-alert CSS.
 */

export {
  MarkdownBlockContext,
  type MarkdownBlockContextValue,
  useMarkdownBlockContext
} from './context'
export { Markdown, type MarkdownProps } from './markdown'
export * from './plugins'
export { defaultMarkdownPlugins, withMath } from './presets'
export * from './utils'
