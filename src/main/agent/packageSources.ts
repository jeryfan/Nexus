import type { AgentPackageType } from '@shared/agent/types'

/**
 * pi 包 source 字符串的解析工具（纯函数，无 IO）。
 *
 * source 形态：
 * - npm：`npm:<name>` / `npm:<name>@<version>`（name 可为 @scope/name）
 * - git：`git:<url>[@<ref>]`、`https://…`、`ssh://…`、`git@host:path[@<ref>]`
 * - 本地：绝对路径或 ~ 路径
 */

/** 包身份：忽略版本/ref 的稳定标识，用于内置包匹配与去重。 */
export function packageIdentity(source: string): string {
  if (source.startsWith('npm:')) {
    return parseNpmSpec(source.slice(4)).name
  }
  if (isGitSource(source)) {
    return stripGitRef(source)
  }
  // 本地路径：原样即身份（pi 以 resolved absolute path 判重，此处不做 resolve）
  return source
}

export function packageTypeOf(source: string): AgentPackageType {
  if (source.startsWith('npm:')) return 'npm'
  if (isGitSource(source)) return 'git'
  return 'local'
}

/** npm 带版本 / git 带 ref：钉版源不参与 pi 的 update。 */
export function isPinnedSource(source: string): boolean {
  if (source.startsWith('npm:')) {
    return parseNpmSpec(source.slice(4)).version !== undefined
  }
  if (isGitSource(source)) {
    return stripGitRef(source) !== source
  }
  return false
}

/** 从 source 推断展示名（未安装时的兜底）。 */
export function inferPackageName(source: string): string {
  if (source.startsWith('npm:')) {
    return parseNpmSpec(source.slice(4)).name
  }
  if (isGitSource(source)) {
    const base = stripGitRef(source)
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean)
      .pop()
    return base || source
  }
  const segments = source.replace(/[\\/]+$/, '').split(/[\\/]/)
  return segments[segments.length - 1] || source
}

/** 解析 npm spec（去掉 `npm:` 前缀后）：`name[@version]`，支持 @scope/name。 */
function parseNpmSpec(spec: string): { name: string; version?: string } {
  if (spec.startsWith('@')) {
    // @scope/name[@version]：版本分隔符是第二个 @
    const secondAt = spec.indexOf('@', 1)
    if (secondAt === -1) return { name: spec }
    return { name: spec.slice(0, secondAt), version: spec.slice(secondAt + 1) || undefined }
  }
  const at = spec.indexOf('@')
  if (at === -1) return { name: spec }
  return { name: spec.slice(0, at), version: spec.slice(at + 1) || undefined }
}

function isGitSource(source: string): boolean {
  return (
    source.startsWith('git:') ||
    source.startsWith('https://') ||
    source.startsWith('http://') ||
    source.startsWith('ssh://') ||
    source.startsWith('git://')
  )
}

/** 去掉 git source 末尾的 `@ref`（URL 中的 @ 只可能出现在 userinfo，取最后一个 @ 即可）。 */
function stripGitRef(source: string): string {
  const lastAt = source.lastIndexOf('@')
  if (lastAt === -1) return source
  // git@github.com:user/repo（scp-like）的 @ 是主机分隔符，不是 ref
  if (source.startsWith('git:git@') && lastAt === source.indexOf('@')) return source
  const ref = source.slice(lastAt + 1)
  if (!ref || ref.includes('/')) return source
  return source.slice(0, lastAt)
}
