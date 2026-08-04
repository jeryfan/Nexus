// 裁剪: 仅 browser 命令组
// （core/account/project/file/automations/orchestration/computer/agent-hooks/
// diagnostics/introspection/environment/linear/vm/emulator/skills 未迁移）。
import { BROWSER_ADVANCED_COMMAND_SPECS } from './browser-advanced'
import { BROWSER_BASIC_COMMAND_SPECS } from './browser-basic'

export const COMMAND_SPECS = [...BROWSER_BASIC_COMMAND_SPECS, ...BROWSER_ADVANCED_COMMAND_SPECS]
