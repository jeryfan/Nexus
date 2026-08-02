/**
 * VS Code 启动器识别（ported from orca src/shared/vscode-remote-ssh-launcher.ts，
 * 仅保留本地分支使用的 isVsCodeLauncherExecutable；SSH remote 判定未迁移）。
 */
const VSCODE_LAUNCHER_NAMES = new Set(['code', 'code-insiders', 'code - insiders'])

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function isVsCodeLauncherExecutable(command: string): boolean {
  const unquoted = stripMatchingQuotes(command)
  const segments = unquoted.split(/[\\/]/)
  const fileName = segments.at(-1) ?? ''
  const launcherName = fileName.replace(/\.(?:cmd|exe|bat)$/i, '').toLowerCase()
  return VSCODE_LAUNCHER_NAMES.has(launcherName)
}
