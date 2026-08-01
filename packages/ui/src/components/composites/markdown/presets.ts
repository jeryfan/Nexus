/**
 * Plugin presets for Streamdown's `plugins` prop.
 *
 * Defaults to `code` + `cjk`. Math is opt-in via `withMath()` so consumers
 * that only need plain notes do not initialize KaTeX.
 */

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { createMathPlugin } from '@streamdown/math'
import type { PluginConfig } from 'streamdown'

export interface WithMathOptions {
  singleDollar?: boolean
}

/** Code (Shiki highlighting) + CJK line-break tweaks. */
export const defaultMarkdownPlugins: PluginConfig = {
  code,
  cjk
}

/** KaTeX math plugin. `singleDollar` enables `$x$` inline math (off by default). */
export function withMath(opts?: WithMathOptions): PluginConfig['math'] {
  return createMathPlugin({ singleDollarTextMath: opts?.singleDollar ?? false })
}
