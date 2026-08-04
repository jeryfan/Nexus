#!/usr/bin/env node
// 裁剪:
// - 删除 agent-teams-tmux / claude-teams 特例入口（agent 命令域，未迁移）。
// - 删除远程配对 / environment 选择（--pairing-code / --environment、
//   shouldIgnoreRemoteSelection）——Nexus CLI 只连本地 runtime。
// 保留 parseArgs → help 短路 → validateCommandAndFlags → 懒加载 RuntimeClient → dispatch 主链。
import {
  findCommandSpec,
  isCommandGroup,
  normalizeCommandPositionals,
  parseArgs,
  resolveHelpPath,
  specPaths,
  validateCommandAndFlags
} from './args'
import { dispatch } from './dispatch'
import { reportCliError } from './format'
import { printHelp } from './help'
import type { RuntimeClient } from './runtime-client'
import { COMMAND_SPECS } from './specs'

export { COMMAND_SPECS } from './specs'

const COMMAND_PATHS = COMMAND_SPECS.flatMap((spec) => specPaths(spec))

// Why: the RuntimeClient graph is only loaded after syntax validation. Loading
// it here rather than at module scope means --help, `help <cmd>`, and
// command/flag errors — which all return before this call — never pay for it.
// Awaited before dispatch so `ctx.client` stays a synchronous getter.
async function loadRuntimeClientClass(): Promise<typeof RuntimeClient> {
  return (await import('./runtime-client.js')).RuntimeClient
}

// Why: the SSH relay bridge executes this CLI on the Nexus host while the
// caller's shell cwd lives on the remote machine (which cannot be chdir'd
// into). NEXUS_CLI_CWD carries that remote cwd so cwd-based resolution works.
function resolveInvocationCwd(): string {
  const override = process.env.NEXUS_CLI_CWD
  return typeof override === 'string' && override.length > 0 ? override : process.cwd()
}

export async function main(
  argv = process.argv.slice(2),
  cwd = resolveInvocationCwd()
): Promise<void> {
  const parsed = normalizeCommandPositionals(COMMAND_SPECS, parseArgs(argv, COMMAND_PATHS))
  const helpPath = resolveHelpPath(parsed)
  if (helpPath !== null) {
    printHelp(COMMAND_SPECS, helpPath)
    if (
      helpPath.length > 0 &&
      !findCommandSpec(COMMAND_SPECS, helpPath) &&
      !isCommandGroup(helpPath)
    ) {
      process.exitCode = 1
    }
    return
  }
  if (parsed.commandPath.length === 0) {
    printHelp(COMMAND_SPECS, [])
    return
  }
  const json = parsed.flags.has('json')

  try {
    // Why: CLI syntax and flag errors should be reported before any runtime
    // lookup so users do not get misleading "Nexus is not running" failures for
    // simple command typos or unsupported flags.
    validateCommandAndFlags(COMMAND_SPECS, parsed)
    const RuntimeClientClass = await loadRuntimeClientClass()
    // Why: local-only handlers must not resolve runtime metadata just to dispatch.
    let client: RuntimeClient | undefined
    await dispatch(parsed.commandPath, {
      flags: parsed.flags,
      get client() {
        client ??= new RuntimeClientClass()
        return client
      },
      cwd,
      json
    })
  } catch (error) {
    reportCliError(error, json, { commandPath: parsed.commandPath })
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main()
}
