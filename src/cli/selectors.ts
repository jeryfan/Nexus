// 裁剪:
// - 删除 worktree.list RPC 查询与 id:/name:/branch:/issue:/path:/active/current 前缀
//   selector 语法（resolveCurrentWorktreeSelector / buildCurrentWorktreeSelector /
//   normalizeWorktreeSelector / assertLocalCwdWorktreeSelector）——Nexus 的 RPC 面只有
//   browser 组，主进程 resolveWorktreeSelector 只处理显式传入的 agent session id。
// - 删除按 cwd 自动解析当前 worktree 的默认行为：不传 --worktree 的命令走 bridge
//   全局活跃 tab（Task 5 审查定案）。
// - 删除 getTerminalHandle / getComputerCommandTarget / getEmulator*（terminal /
//   computer / emulator 命令域，未迁移）。
// 保留：--worktree <sessionId> 裸 session id 原样直传；--page <pageId>；
// BrowserCliTarget 形状与 handler 调用签名不变。
import type { RuntimeClient } from './runtime-client'
import { getOptionalStringFlag } from './flags'

export type BrowserCliTarget = {
  worktree?: string
  page?: string
}

// Why: there is no worktree registry RPC to auto-resolve the caller's cwd to
// a managed worktree, so an omitted --worktree leaves targeting to the
// runtime bridge's global active tab.
export function getBrowserWorktreeSelector(
  flags: Map<string, string | boolean>,
  _cwd: string,
  _client: RuntimeClient
): string | undefined {
  const value = getOptionalStringFlag(flags, 'worktree')
  // Why: `tab list` / `tab current` document `--worktree all` as "no filter";
  // in Nexus that is the same as omitting the selector.
  if (value === 'all') {
    return undefined
  }
  // Bare agent session id — passed through verbatim to the runtime's
  // resolveWorktreeSelector without any client-side resolution.
  return value
}

export async function getBrowserCommandTarget(
  flags: Map<string, string | boolean>,
  cwd: string,
  client: RuntimeClient
): Promise<BrowserCliTarget> {
  return {
    page: getOptionalStringFlag(flags, 'page'),
    worktree: getBrowserWorktreeSelector(flags, cwd, client)
  }
}
