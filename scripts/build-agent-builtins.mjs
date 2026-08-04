#!/usr/bin/env node
/**
 * 生成内置 pi 包预装树：resources/agent/npm/{node_modules,manifest.json,package-lock.json}
 *
 * 以 resources/agent/builtin-packages.json 为唯一版本源，在临时目录执行
 * npm ci / install（参数与 pi 内部一致：--omit=dev --legacy-peer-deps），剪枝后
 * 拷贝为 resources/agent/npm/ 并写 manifest.json；package-lock.json 持久化到
 * 产物目录并提交进仓库，保证每次构建按同一 lock 复现。
 *
 * 平台约束：产物含平台原生二进制（recheck、@napi-rs/keyring），本脚本生成的
 * 是当前 os/arch 的树；electron-builder beforePack 会在打包时自动调用本脚本。
 *
 * 用法：pnpm agent:builtins
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const agentResourcesDir = join(repoRoot, 'resources', 'agent')
const outNpmDir = join(agentResourcesDir, 'npm')

/** 递归剪枝：测试/文档/示例目录与 sourcemap。保留 LICENSE*（开源合规）。 */
const PRUNE_DIR_NAMES = new Set(['test', 'tests', '__tests__', 'docs', 'example', 'examples'])

function pruneTree(root) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        // .bin 已删，npm 产物不应再有符号链接；发现即报错，避免打包隐患
        throw new Error(`预装树中不应存在符号链接: ${p}`)
      }
      if (entry.isDirectory()) {
        if (PRUNE_DIR_NAMES.has(entry.name)) rmSync(p, { recursive: true, force: true })
        else walk(p)
      } else if (entry.name.endsWith('.map') || entry.name === 'CHANGELOG.md') {
        rmSync(p, { force: true })
      }
    }
  }
  walk(root)
}

/** 验证 recheck 原生二进制可加载、可执行（不通过则说明平台/架构不对）。 */
function verifyRecheckNative(nodeModulesDir) {
  const script = `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(join(nodeModulesDir, 'noop.js'))});
    const { checkSync } = req('recheck');
    const result = checkSync('^(a+)+$', '');
    if (!result || typeof result.status !== 'string') throw new Error('recheck checkSync 返回异常');
    console.log('recheck native OK');
  `
  try {
    execFileSync(process.execPath, ['-e', script], { stdio: ['ignore', 'inherit', 'inherit'] })
    return true
  } catch {
    return false
  }
}

function dirSizeBytes(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) total += dirSizeBytes(p)
    else if (entry.isFile()) total += statSync(p).size
  }
  return total
}

/** 解析 Node 自带的 npm-cli.js（Windows: node.exe 旁 node_modules/npm；Unix: bin/ 旁 lib/node_modules/npm）。 */
function resolveNodeNpmCli() {
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      '未找到 Node 自带的 npm（node_modules/npm/bin/npm-cli.js），请使用官方或包管理器安装的 Node.js'
    )
  }
  return found
}

// ── 1. 读取钉版清单 ──
const builtinPackagesPath = join(agentResourcesDir, 'builtin-packages.json')
let defs
try {
  defs = JSON.parse(readFileSync(builtinPackagesPath, 'utf8'))
} catch (cause) {
  throw new Error(`解析内置包清单失败: ${builtinPackagesPath}: ${cause.message}`, { cause })
}
if (!Array.isArray(defs) || defs.length === 0) {
  throw new Error('builtin-packages.json 为空或格式错误')
}
for (const [index, def] of defs.entries()) {
  if (typeof def?.id !== 'string' || typeof def?.source !== 'string') {
    throw new Error(
      `builtin-packages.json 第 ${index} 条目的 id/source 必须是字符串: ${JSON.stringify(def)}`
    )
  }
}
const specs = defs.map((def) => {
  const match = /^npm:(.+)$/.exec(def.source)
  if (!match) throw new Error(`内置包仅支持 npm: 来源: ${def.source}`)
  return match[1]
})
console.log(`内置包: ${specs.join(', ')}`)

// ── 2. 临时目录安装（lockfile 持久化，产物可复现）──
const workDir = mkdtempSync(join(tmpdir(), 'nexus-builtins-'))
const nodeModules = join(workDir, 'node_modules')
const npmCli = resolveNodeNpmCli()
const outLockPath = join(outNpmDir, 'package-lock.json')
// --ignore-scripts：内置包均不需要 install 脚本（recheck/@napi-rs 为预编译 optional 包）；
// 未来新增钉版包若依赖 postinstall，需重新评估此参数
const NPM_ARGS = [
  '--omit=dev',
  '--legacy-peer-deps',
  '--no-audit',
  '--no-fund',
  '--ignore-scripts',
  '--loglevel=error'
]

/** 以 workDir 为 cwd 调 Node 自带 npm（代替 --prefix，隔离仓库 .npmrc 影响）。 */
function runNpm(subcommand) {
  execFileSync(process.execPath, [npmCli, subcommand, ...NPM_ARGS], {
    cwd: workDir,
    stdio: 'inherit'
  })
}

try {
  // 钉版依赖表（npm:<name>@<version> → dependencies；lastIndexOf 兼容 @scope 包名）
  const pinnedDeps = {}
  for (const def of defs) {
    const spec = def.source.slice('npm:'.length)
    const at = spec.lastIndexOf('@')
    if (at <= 0) throw new Error(`内置包必须钉版（npm:<name>@<version>）: ${def.source}`)
    pinnedDeps[spec.slice(0, at)] = spec.slice(at + 1)
  }
  writeFileSync(
    join(workDir, 'package.json'),
    JSON.stringify(
      { name: 'nexus-builtin-packages', private: true, dependencies: pinnedDeps },
      null,
      2
    ) + '\n'
  )

  // 已有持久化 lock 先 npm ci（严格按 lock 复现）；失败（钉版升级/lock 损坏）回退 install 重建
  if (existsSync(outLockPath)) {
    cpSync(outLockPath, join(workDir, 'package-lock.json'))
    try {
      runNpm('ci')
    } catch {
      console.warn('npm ci 失败（lock 与清单不一致或已损坏），回退 npm install 重建 lock')
      rmSync(join(workDir, 'package-lock.json'), { force: true })
      rmSync(nodeModules, { recursive: true, force: true })
      runNpm('install')
    }
  } else {
    runNpm('install')
  }

  // ── 3. 剪枝 ──
  // .bin 全是符号链接（pi 加载不经过 bin；Windows 打包符号链接会出问题）
  rmSync(join(nodeModules, '.bin'), { recursive: true, force: true })
  pruneTree(nodeModules)
  // recheck-jar（23MB）是 recheck 的 Java fallback，仅在原生二进制加载失败时启用；
  // 用户机器没有 JVM，留着无意义。先移除再验证原生加载，失败则恢复。
  const recheckJarDir = join(nodeModules, 'recheck-jar')
  const recheckJarBackup = join(workDir, 'recheck-jar.bak')
  if (existsSync(recheckJarDir)) {
    renameSync(recheckJarDir, recheckJarBackup)
    if (verifyRecheckNative(nodeModules)) {
      console.log('recheck-jar 已剪枝（原生加载验证通过）')
    } else {
      console.warn('recheck 原生加载验证失败，保留 recheck-jar')
      renameSync(recheckJarBackup, recheckJarDir)
    }
  }

  // ── 4. 写产物与 manifest ──
  rmSync(outNpmDir, { recursive: true, force: true })
  mkdirSync(outNpmDir, { recursive: true })
  cpSync(nodeModules, join(outNpmDir, 'node_modules'), { recursive: true })

  const topLevelDirs = readdirSync(join(outNpmDir, 'node_modules'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()

  const packages = {}
  for (const def of defs) {
    const spec = def.source.slice('npm:'.length)
    const at = spec.lastIndexOf('@')
    packages[at > 0 ? spec.slice(0, at) : spec] = at > 0 ? spec.slice(at + 1) : ''
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    packages,
    topLevelDirs
  }
  writeFileSync(join(outNpmDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  // lockfile 持久化到产物目录（提交进 git），下次构建走 npm ci 严格复现
  cpSync(join(workDir, 'package-lock.json'), outLockPath)

  const sizeMB = Math.round(dirSizeBytes(join(outNpmDir, 'node_modules')) / 1024 / 1024)
  console.log(`预装树已生成: ${outNpmDir}（${topLevelDirs.length} 个顶层目录，约 ${sizeMB}MB）`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
