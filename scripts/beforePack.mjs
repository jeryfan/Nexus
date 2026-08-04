/**
 * electron-builder beforePack 钩子：打包前生成内置 pi 包预装树。
 * 预装树含平台原生二进制（recheck、@napi-rs/keyring），必须与目标平台/架构
 * 一致，因此交叉打包（含 mac universal）直接失败。
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** electron-builder Arch 枚举：0=ia32 1=x64 2=armv7l 3=arm64 4=universal */
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

export default async function beforePack(context) {
  if (context.electronPlatformName !== process.platform) {
    throw new Error(
      `内置 pi 包预装树含平台原生二进制，不支持交叉打包：` +
        `目标平台 ${context.electronPlatformName}，构建机 ${process.platform}`
    )
  }
  const archName = ARCH_NAMES[context.arch] ?? String(context.arch)
  if (archName !== process.arch) {
    throw new Error(
      `内置 pi 包预装树含架构原生二进制，目标架构 ${archName} 与构建机 ${process.arch} 不一致`
    )
  }
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-agent-builtins.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit'
  })
}
