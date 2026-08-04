// 裁剪: 仅保留 browser 方法组，其余方法域
// （status/terminal/git/orchestration/pairing/mobile 等）未迁移。
// 注：聚合为 BROWSER_CORE_METHODS + BROWSER_SCREENCAST_METHODS +
// BROWSER_EXTRA_METHODS —— BROWSER_TEXT_METHODS 已在 browser-core.ts 内部展开，
// 再次展开会触发 buildRegistry 的 duplicate_rpc_method 守卫。
import type { RpcAnyMethod } from '../core'
import { BROWSER_CORE_METHODS } from './browser-core'
import { BROWSER_EXTRA_METHODS } from './browser-extras'
import { BROWSER_SCREENCAST_METHODS } from './browser-screencast'

// Why: a flat manifest keeps registration order explicit and provides one
// grep-point for "what methods does the RPC server expose?" — useful when
// auditing the security boundary or wiring new CLI commands.
export const ALL_RPC_METHODS: readonly RpcAnyMethod[] = [
  ...BROWSER_CORE_METHODS,
  ...BROWSER_SCREENCAST_METHODS,
  ...BROWSER_EXTRA_METHODS
]
