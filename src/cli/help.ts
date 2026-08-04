// 裁剪:
// - ROOT_HELP_TEXT 仅保留 Browser Automation 命令面（Startup/Diagnostics/Accounts/
//   Skills/Environments/Automations/Projects/Repos/Worktrees/Files/Terminals/
//   Orchestration/Computer Use/Linear/Emulator 等非 browser 域未迁移），命令名 nexus。
// - formatCommandFlagHelp 删除 linear/skills/terminal/worktree/account/computer/
//   orchestration 特例分支；formatFlagHelp 删除 linear 尾部分支。
// - helpByFlag 的 command/direction/name 三项改写为 browser 语义（分别对应
//   agent-browser 透传命令、scroll 方向、设备模拟）。
// - --worktree selector 说明改为裸 agent session id（见 selectors.ts 裁剪）。
import type { CommandSpec } from './args'
import { findCommandSpec, isCommandGroup, supportsBrowserPageFlag } from './args'
import { unknownCommandData } from './command-suggestion'

const ROOT_HELP_TEXT = `nexus

Usage: nexus <command> [options]

Browser Automation:
  tab create                Create a new browser tab (navigates to --url)
  tab list                  List open browser tabs
  tab show                  Show one browser tab by page id
  tab current               Show the current browser tab
  tab profile list          List browser session profiles
  tab profile create        Create a browser session profile
  tab profile delete        Delete a browser session profile
  tab profile set           Switch a browser tab to a different profile
  tab profile show          Show the profile bound to a browser tab
  tab profile use-default   Switch a browser tab back to the default profile
  tab profile clone         Clone a browser tab into another profile
  tab switch                Switch the active browser tab by --index or --page
  tab close                 Close a browser tab by --index/--page or the current tab
  snapshot                  Accessibility snapshot with element refs (e.g. @e1, @e2)
  goto                      Navigate the active tab to --url
  click                     Click element by --element ref
  fill                      Clear and fill input by --element ref with --value
  type                      Type --input text at the current focus (no element needed)
  select                    Select dropdown option by --element ref and --value
  hover                     Hover element by --element ref
  keypress                  Press a key (e.g. --key Enter, --key Tab)
  scroll                    Scroll --direction (up/down) by --amount pixels
  back                      Navigate back in browser history
  reload                    Reload the active browser tab
  screenshot                Capture viewport screenshot (--format png|jpeg)
  eval                      Evaluate --expression JavaScript in the page context
  wait                      Wait for page idle or --timeout ms
  check                     Check a checkbox by --element ref
  uncheck                   Uncheck a checkbox by --element ref
  focus                     Focus an element by --element ref
  clear                     Clear an input by --element ref
  drag                      Drag --from ref to --to ref
  upload                    Upload --files to a file input by --element ref
  dblclick                  Double-click element by --element ref
  forward                   Navigate forward in browser history
  scrollintoview            Scroll --element into view
  get                       Get element property (--what: text, html, value, url, title)
  is                        Check element state (--what: visible, enabled, checked)
  inserttext                Insert text without key events
  mouse move                Move mouse to --x --y coordinates
  mouse down                Press mouse button
  mouse up                  Release mouse button
  mouse wheel               Scroll wheel --dy [--dx]
  find                      Find element by locator (--locator role|text|label --value <v>)
  set device                Emulate device (--name "iPhone 12")
  set offline               Toggle offline mode (--state on|off)
  set headers               Set HTTP headers (--headers '{"key":"val"}')
  set credentials           Set HTTP auth (--user <u> --pass <p>)
  set media                 Set color scheme (--color-scheme dark|light)
  clipboard read            Read clipboard contents
  clipboard write           Write --text to clipboard
  dialog accept             Accept browser dialog (--text for prompt response)
  dialog dismiss            Dismiss browser dialog
  storage local get         Get localStorage value by --key
  storage local set         Set localStorage --key --value
  storage local clear       Clear localStorage
  storage session get       Get sessionStorage value by --key
  storage session set       Set sessionStorage --key --value
  storage session clear     Clear sessionStorage
  download                  Download file via --selector to --path
  highlight                 Highlight --selector on page
  exec                      Run any agent-browser command (--command "...")

Selectors:
  --worktree <sessionId>    Agent session id owning the target browser tab; omit to
                            target the runtime's active tab
  --page <id>               Stable browser page id from \`nexus tab list --json\`

Output Options:
  --json                    Emit machine-readable JSON instead of human text
  --help                    Show this help message

Behavior:
  All commands require the Nexus app runtime. If Nexus is not open yet, start
  the Nexus app first.

Browser Workflow:
  1. Create or navigate:  nexus tab create --url https://example.com
                          nexus goto --url https://example.com
  2. Inspect the page:    nexus snapshot
     (Returns an accessibility tree with element refs like e1, e2, e3)
     For concurrent workflows, prefer: nexus tab list --json
     then reuse tabs[].browserPageId with --page <id> on later commands.
  3. Interact:            nexus click --element e2
                          nexus fill --element e5 --value "search query"
                          nexus keypress --key Enter
  4. Re-inspect:          nexus snapshot
     (Element refs change after navigation — always re-snapshot before interacting)

Browser Options:
  --element <ref>           Element ref from snapshot (e.g. @e3)
  --url <url>               URL to navigate to
  --value <text>            Value to fill or select
  --input <text>            Text to type at current focus (no element needed)
  --expression <js>         JavaScript expression to evaluate
  --key <key>               Key to press (Enter, Tab, Escape, Control+a, etc.)
  --direction <dir>         Scroll direction: up or down
  --amount <pixels>         Scroll distance in pixels (default: viewport height)
  --index <n>               Tab index (from \`tab list\`)
  --page <id>               Stable browser page id (preferred for concurrent workflows)
  --profile <id>            Browser profile id
  --show-profile            Include the tab's browser profile in text output
  --format <png|jpeg>       Screenshot image format
  --from <ref>              Drag source element ref
  --to <ref>                Drag target element ref
  --files <path,...>        Comma-separated file paths for upload
  --timeout <ms>            Wait timeout in milliseconds
  --worktree <sessionId>    Scope commands to one agent session's browser tabs

Examples:
  $ nexus tab create --url https://example.com --profile work
  $ nexus tab profile clone --page page_123 --profile work --json
  $ nexus tab current --json
  $ nexus tab show --page page_123 --json
  $ nexus snapshot
  $ nexus click --element e3
  $ nexus fill --element e5 --value "hello"
  $ nexus goto --url https://example.com/login
  $ nexus keypress --key Enter
  $ nexus eval --expression "document.title"
  $ nexus tab list --json`

export function printHelp(specs: CommandSpec[], commandPath: string[] = []): void {
  const exactSpec = findCommandSpec(specs, commandPath)
  if (exactSpec) {
    console.log(formatCommandHelp(exactSpec))
    return
  }

  if (isCommandGroup(commandPath)) {
    console.log(formatGroupHelp(specs, commandPath[0]))
    return
  }

  if (commandPath.length > 0) {
    const { nextSteps } = unknownCommandData(specs, commandPath)
    const recovery = nextSteps.map((step) => `Next step: ${step}`).join('\n')
    console.log(`Unknown command: ${commandPath.join(' ')}${recovery ? `\n${recovery}` : ''}\n`)
  }

  console.log(ROOT_HELP_TEXT)
}

export function formatCommandHelp(spec: CommandSpec): string {
  const lines = [`nexus ${spec.path.join(' ')}`, '', `Usage: ${spec.usage}`, '', spec.summary]
  const displayedFlags =
    spec.argumentMode === 'passthrough'
      ? []
      : supportsBrowserPageFlag(spec.path)
        ? [...spec.allowedFlags, 'page']
        : spec.allowedFlags

  if (displayedFlags.length > 0) {
    lines.push('', 'Options:')
    for (const flag of displayedFlags) {
      lines.push(`  ${formatCommandFlagHelp(flag, spec.path)}`)
    }
  }

  if (spec.notes && spec.notes.length > 0) {
    lines.push('', 'Notes:')
    for (const note of spec.notes) {
      lines.push(`  ${note}`)
    }
  }

  if (spec.examples && spec.examples.length > 0) {
    lines.push('', 'Examples:')
    for (const example of spec.examples) {
      lines.push(`  $ ${example}`)
    }
  }

  return lines.join('\n')
}

export function formatGroupHelp(specs: CommandSpec[], group: string): string {
  const groupSpecs = specs.filter((spec) => spec.path[0] === group)
  const lines = [`nexus ${group}`, '', `Usage: nexus ${group} <command> [options]`, '', 'Commands:']
  for (const spec of groupSpecs) {
    lines.push(`  ${spec.path.slice(1).join(' ').padEnd(18)} ${spec.summary}`)
  }
  lines.push('', `Run \`nexus ${group} <command> --help\` for command-specific usage.`)
  return lines.join('\n')
}

function formatCommandFlagHelp(flag: string, _commandPath: string[]): string {
  return formatFlagHelp(flag)
}

export function formatFlagHelp(flag: string): string {
  const helpByFlag: Record<string, string> = {
    command: '--command <text>       agent-browser command to run against the active tab',
    direction: '--direction <dir>      Scroll direction: up or down',
    help: '--help                 Show this help message',
    json: '--json                 Emit machine-readable JSON',
    key: '--key <key>            Key argument for this command',
    limit: '--limit <n>            Maximum number of rows to return',
    name: '--name <device>        Device name to emulate (e.g. "iPhone 12")',
    path: '--path <path>          Path argument for the command',
    text: '--text <text>          Text payload to send or type',
    worktree:
      '--worktree <sessionId> Agent session id owning the target browser tab; omit for the active tab',
    // Browser automation flags
    element: '--element <ref>        Element ref from snapshot (e.g. e3)',
    url: '--url <url>            URL to navigate to',
    value: '--value <text>         Value to fill or select',
    input: '--input <text>         Text to type at current focus',
    expression: '--expression <js>     JavaScript expression to evaluate',
    amount: '--amount <pixels>      Scroll distance in pixels',
    index: '--index <n>            Tab index to switch to',
    page: '--page <id>            Stable browser page id from `nexus tab list --json`',
    profile: '--profile <id>        Browser profile id',
    'show-profile': '--show-profile        Include tab profile in text output',
    format: '--format <png|jpeg>    Screenshot image format'
  }

  return helpByFlag[flag] ?? `--${flag}`
}
