/**
 * CLI 命令解析（ported from orca src/shared/node-cli-command-resolution.ts，
 * 仅保留外部编辑器启动所需的 resolveCliCommand 及其内部辅助函数；
 * resolveCliCommands / resolveCodexCommand / resolveClaudeCommand /
 * getVersionManagerBinPaths 未迁移）。
 */
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

type ResolveCommandOptions = {
  pathEnv?: string | null
  platform?: NodeJS.Platform
  homePath?: string
}

function getExecutableNames(platform: NodeJS.Platform, commandName: string): string[] {
  if (platform === 'win32') {
    return [`${commandName}.cmd`, `${commandName}.exe`, `${commandName}.bat`, commandName]
  }

  return [commandName]
}

function splitPath(pathEnv: string | null | undefined): string[] {
  if (!pathEnv) {
    return []
  }

  return pathEnv
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseVersionSegment(raw: string): number[] {
  return raw
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0))
}

function compareVersionDesc(left: string, right: string): number {
  const leftParts = parseVersionSegment(left)
  const rightParts = parseVersionSegment(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const delta = (rightParts[index] ?? 0) - (leftParts[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }

  return right.localeCompare(left)
}

function findFirstExecutable(
  platform: NodeJS.Platform,
  directories: string[],
  executableNames: string[]
): string | null {
  for (const directory of directories) {
    for (const executableName of executableNames) {
      const candidate = join(directory, executableName)
      if (isRunnableCommand(platform, candidate)) {
        return candidate
      }
    }
  }

  return null
}

function isRunnableCommand(platform: NodeJS.Platform, candidate: string): boolean {
  try {
    const stats = statSync(candidate)
    if (!stats.isFile()) {
      return false
    }
    if (platform === 'win32') {
      return true
    }
    // Why: GUI fallback probing should skip placeholders/directories so spawn
    // can continue to a runnable CLI instead of failing later with EACCES/EISDIR.
    accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function getBaseVersionManagerDirectories(platform: NodeJS.Platform, homePath: string): string[] {
  const directories = [
    join(homePath, '.volta', 'bin'),
    join(homePath, '.asdf', 'shims'),
    join(homePath, '.fnm', 'aliases', 'default', 'bin'),
    // Why: mise (formerly rtx) exposes managed tool binaries via a shims
    // directory, similar to asdf.
    join(homePath, '.local', 'share', 'mise', 'shims')
  ]

  if (platform === 'win32') {
    // Why: Anthropic's native Windows installer places claude.exe here, and a
    // GUI-launched app may not inherit the user's PATH entry for it.
    directories.push(join(homePath, '.local', 'bin'))
    directories.push(join(homePath, 'AppData', 'Roaming', 'npm'))
    directories.push(join(homePath, 'AppData', 'Local', 'pnpm'))
    directories.push(join(homePath, 'AppData', 'Local', 'Yarn', 'bin'))
  } else {
    directories.push(join(homePath, '.local', 'bin'))
    // Why: pnpm uses platform-specific global bin directories that differ from
    // npm's ~/.local/bin.
    if (platform === 'darwin') {
      directories.push(join(homePath, 'Library', 'pnpm'))
    } else {
      directories.push(join(homePath, '.local', 'share', 'pnpm'))
    }
    directories.push(join(homePath, '.yarn', 'bin'))
  }

  directories.push(join(homePath, '.bun', 'bin'))
  return directories
}

function getNvmVersionDirectories(homePath: string): string[] {
  const nvmVersionsDir = join(homePath, '.nvm', 'versions', 'node')
  if (!existsSync(nvmVersionsDir)) {
    return []
  }

  return readdirSync(nvmVersionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersionDesc)
    .map((entry) => join(nvmVersionsDir, entry, 'bin'))
}

export function resolveCliCommand(
  commandName: string,
  options: ResolveCommandOptions = {}
): string {
  const platform = options.platform ?? process.platform
  const executableNames = getExecutableNames(platform, commandName)
  const pathEnv = options.pathEnv ?? process.env.PATH ?? process.env.Path ?? null
  const pathCandidate = findFirstExecutable(platform, splitPath(pathEnv), executableNames)
  if (pathCandidate) {
    return pathCandidate
  }

  const homePath = options.homePath ?? homedir()
  const nvmCandidate = findFirstExecutable(
    platform,
    getNvmVersionDirectories(homePath),
    executableNames
  )
  const versionManagerCandidate =
    nvmCandidate ??
    findFirstExecutable(platform, getBaseVersionManagerDirectories(platform, homePath), executableNames)
  return versionManagerCandidate ?? commandName
}
