// 裁剪: 仅保留 8 个 browser 命令组
// （core/account/automations/project/repo/worktree/file/terminal/orchestration/
// emulator/computer/agent-hooks/diagnostics/introspection/environment/linear/
// vm/skills 组未迁移）。
import type { CommandHandler } from './dispatch'
import { BROWSER_HANDLER_GROUPS } from './browser-handler-groups'

export type HandlerGroup = {
  name: string
  // Why: eager string keys let dispatch build (and duplicate-check) the whole
  // command table without loading any group's transitive module graph.
  keys: readonly string[]
  load: () => Promise<Record<string, CommandHandler>>
}

// Why: `keys` mirrors each group's exported record and is verified against the
// real exports by handler-group-manifest.test.ts, so drift fails CI, not dispatch.
export const HANDLER_GROUPS: readonly HandlerGroup[] = [...BROWSER_HANDLER_GROUPS]
