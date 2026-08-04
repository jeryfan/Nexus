# 内置 pi 包离线预打包实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三个内置 pi 包（pi-mcp-adapter / pi-web-access / pi-subagents）的完整依赖树随安装包分发，首启离线拷贝落位，全程不依赖用户机器的 npm/git/网络。

**Architecture:** 构建时 `scripts/build-agent-builtins.mjs` 在打包机上 `npm install`（`--omit=dev --legacy-peer-deps`）生成 `resources/agent/npm/` 预装树 + manifest（gitignored，electron-builder `beforePack` 自动调用）；运行时 `AgentResourceService.reconcileBuiltins()` 把 `installAndPersist`（spawn 外部 npm）替换为「整树原子拷贝 + `addSourceToSettings` 登记」。拷贝逻辑抽为纯模块 `builtinPackageSync.ts`，用 Node 24 原生 type-stripping 跑 `node --test` 单测（项目主进程无测试基建，不新增依赖）。

**Tech Stack:** Electron 39 / Node 24（`fs/promises`、`node --test` type-stripping）/ electron-builder 26（beforePack 钩子）/ pi-coding-agent `DefaultPackageManager.addSourceToSettings`。

**重要约束：用户要求本计划所有改动一律不做 git commit，任务步骤中不含 commit。**

**与 spec 的一处偏差：** 预装树剪枝时**保留 `LICENSE*` 文件**（开源合规要求；体积收益仅 1-2MB）。spec 中「删 LICENSE」按此修正执行。

事实依据（已验证，勿再调查）：

- `npm install --prefix <空目录> <spec> --omit=dev --legacy-peer-deps` 无需 package.json，直接产出 `node_modules/`；三包合计 133MB / 211 顶层目录（macOS arm64）。
- 不带 `--legacy-peer-deps` 时 npm 自动安装 `pi-subagents` 的 peer `@earendil-works/pi-coding-agent`（172MB），总树 428MB —— 必须带该参数。
- 依赖树中符号链接**只**存在于 `node_modules/.bin`（已实测 0 个其他符号链接），删 `.bin` 即无符号链接残留。
- `recheck` 为 CJS（main: index.js，导出 `check`/`checkSync`），`createRequire` 加载即触发原生二进制加载；`recheck-jar`（23MB）是其 Java fallback。
- `pi-subagents` 附带 `skills/pi-subagents/`（SKILL.md name: `pi-subagents`）与 `prompts/*.md`；`pi-mcp-adapter`、`pi-web-access` 仅 extensions（`./index.ts`）。三个包均无 postinstall。
- pi 的 npm 根目录为 `<agentDir>/npm`（即 `~/.nexus/agent/npm/node_modules`）；`PackageManager.addSourceToSettings(source)` 只登记不安装。
- `tsconfig.node.json` 已 `exclude: ["src/**/*.test.ts"]` → 测试文件不参与 typecheck；electron-vite 只打包入口依赖图，测试文件不会进产物。
- 运行时路径：`application.getPath('resources.agent', ...)` —— dev 指向 `<repo>/resources/agent`，packaged 指向 `process.resourcesPath/agent`；`electron-builder.yml` 的 `extraResources` 已整目录映射 `resources/agent → agent`（`npm/` 自动包含）。
- electron-builder Arch 枚举：`0=ia32 1=x64 2=armv7l 3=arm64 4=universal`；yml 顶层 `beforePack: <路径>` 指向的模块 default export 即钩子。
- electron-builder.yml 的 productName 为 `nexus-scaffold`，mac unpack 产物在 `out/mac-arm64/nexus-scaffold.app/`。
- pi patch 已将 agentDir 环境变量更名为 `NEXUS_CODING_AGENT_DIR`（冒烟可用它指向临时目录，不碰真实 `~/.nexus`）。

---

### Task 1: 内置包清单加两个包

**Files:**

- Modify: `resources/agent/builtin-packages.json`

- [ ] **Step 1: 改写清单为三个钉版包**

完整内容（替换整个文件）：

```json
[
  { "id": "pi-mcp-adapter", "source": "npm:pi-mcp-adapter@2.17.0" },
  { "id": "pi-web-access", "source": "npm:pi-web-access@0.17.1" },
  { "id": "pi-subagents", "source": "npm:pi-subagents@0.40.0" }
]
```

- [ ] **Step 2: 校验 JSON 合法**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('resources/agent/builtin-packages.json','utf8')).length)"`
Expected: 输出 `3`

---

### Task 2: 构建脚本 `scripts/build-agent-builtins.mjs`

**Files:**

- Create: `scripts/build-agent-builtins.mjs`

- [ ] **Step 1: 创建脚本（完整内容）**

```js
#!/usr/bin/env node
/**
 * 生成内置 pi 包预装树：resources/agent/npm/{node_modules,manifest.json}
 *
 * 以 resources/agent/builtin-packages.json 为唯一版本源，在临时目录执行
 * npm install（参数与 pi 内部一致：--omit=dev --legacy-peer-deps），剪枝后
 * 拷贝为 resources/agent/npm/ 并写 manifest.json。
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

// ── 1. 读取钉版清单 ──
const defs = JSON.parse(readFileSync(join(agentResourcesDir, 'builtin-packages.json'), 'utf8'))
if (!Array.isArray(defs) || defs.length === 0) {
  throw new Error('builtin-packages.json 为空或格式错误')
}
const specs = defs.map((def) => {
  const match = /^npm:(.+)$/.exec(def.source)
  if (!match) throw new Error(`内置包仅支持 npm: 来源: ${def.source}`)
  return match[1]
})
console.log(`内置包: ${specs.join(', ')}`)

// ── 2. 临时目录 npm install ──
const workDir = mkdtempSync(join(tmpdir(), 'nexus-builtins-'))
const nodeModules = join(workDir, 'node_modules')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
try {
  execFileSync(
    npmBin,
    [
      'install',
      '--prefix',
      workDir,
      ...specs,
      '--omit=dev',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--loglevel=error'
    ],
    { stdio: 'inherit' }
  )

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

  const sizeMB = Math.round(dirSizeBytes(join(outNpmDir, 'node_modules')) / 1024 / 1024)
  console.log(`预装树已生成: ${outNpmDir}（${topLevelDirs.length} 个顶层目录，约 ${sizeMB}MB）`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
```

- [ ] **Step 2: 运行脚本验证产物**

Run: `node scripts/build-agent-builtins.mjs`
Expected:

- 输出含 `recheck native OK`、`recheck-jar 已剪枝（原生加载验证通过）`、`预装树已生成`（约 100MB 上下）；
- `ls resources/agent/npm/` 有 `node_modules` 与 `manifest.json`；
- `node -e "const m=require('./resources/agent/npm/manifest.json'); console.log(m.platform, m.arch, Object.keys(m.packages).length, m.topLevelDirs.length)"` 输出 `darwin arm64 3 <200±20>`；
- `ls resources/agent/npm/node_modules/ | grep -E '^(pi-mcp-adapter|pi-web-access|pi-subagents|recheck-macos-arm64)$'` 四项齐全；
- `find resources/agent/npm/node_modules -type l | wc -l` 输出 `0`。

---

### Task 3: package.json script + .gitignore

**Files:**

- Modify: `package.json`（scripts 段）
- Modify: `.gitignore`（末尾追加）

- [ ] **Step 1: package.json 加 script**

在 `"postinstall": "electron-builder install-app-deps",` 之后插入一行：

```json
    "agent:builtins": "node scripts/build-agent-builtins.mjs",
```

- [ ] **Step 2: .gitignore 末尾追加**

```gitignore

# 内置 pi 包预装树（pnpm agent:builtins 生成，勿提交）
resources/agent/npm/
```

- [ ] **Step 3: 验证**

Run: `pnpm agent:builtins >/dev/null 2>&1 && echo SCRIPT_OK; git check-ignore resources/agent/npm/manifest.json && echo IGNORED`
Expected: 输出 `SCRIPT_OK` 与 `resources/agent/npm/manifest.json` + `IGNORED`

---

### Task 4: electron-builder beforePack 钩子

**Files:**

- Create: `scripts/beforePack.mjs`
- Modify: `electron-builder.yml`（`directories:` 块后加一行）

- [ ] **Step 1: 创建钩子（完整内容）**

```js
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
```

- [ ] **Step 2: electron-builder.yml 注册钩子**

在

```yaml
directories:
  buildResources: build
```

之后插入：

```yaml
beforePack: ./scripts/beforePack.mjs
```

- [ ] **Step 3: 验证（此步耗时数分钟，可留到 Task 9 统一跑）**

Run: `pnpm build:unpack`
Expected: 打包日志中出现 `预装树已生成`；`ls out/mac-arm64/nexus-scaffold.app/Contents/Resources/agent/npm/manifest.json` 存在。

---

### Task 5: 离线拷贝纯逻辑模块 + 单测（TDD）

**Files:**

- Create: `src/main/agent/builtinPackageSync.ts`
- Test: `src/main/agent/builtinPackageSync.test.ts`

- [ ] **Step 1: 先写测试（完整内容）**

```ts
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'

import { computeDirActions, readBundleManifest, syncBuiltinTree } from './builtinPackageSync.ts'

interface TestTree {
  bundle: string
  target: string
  cleanup: () => Promise<void>
}

async function makeTree(): Promise<TestTree> {
  const root = await mkdtemp(join(tmpdir(), 'nexus-sync-test-'))
  const bundle = join(root, 'bundle')
  const target = join(root, 'target', 'node_modules')
  await mkdir(join(bundle, 'node_modules'), { recursive: true })
  return { bundle, target, cleanup: () => rm(root, { recursive: true, force: true }) }
}

async function writeBundleDir(
  bundle: string,
  dir: string,
  files: Record<string, string>
): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const file = join(bundle, 'node_modules', dir, name)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content)
  }
}

async function writeManifest(bundle: string, topLevelDirs: string[]): Promise<void> {
  await writeFile(
    join(bundle, 'manifest.json'),
    JSON.stringify({ platform: 'darwin', arch: 'arm64', packages: {}, topLevelDirs })
  )
}

describe('readBundleManifest', () => {
  it('manifest 缺失时报错并提示 pnpm agent:builtins', async () => {
    const tree = await makeTree()
    try {
      await assert.rejects(() => readBundleManifest(tree.bundle), /pnpm agent:builtins/)
    } finally {
      await tree.cleanup()
    }
  })
})

describe('computeDirActions', () => {
  it('安装=新清单全量；删除=旧清单有、新清单无', () => {
    const bundle = { topLevelDirs: ['a', 'b', '@scope'] }
    const applied = { topLevelDirs: ['b', 'old'] }
    assert.deepEqual(computeDirActions(bundle, applied), {
      install: ['a', 'b', '@scope'],
      remove: ['old']
    })
    assert.deepEqual(computeDirActions(bundle, null).remove, [])
  })
})

describe('syncBuiltinTree', () => {
  it('首装：拷贝目录并写 manifest.applied.json；二次同步无删除', async () => {
    const tree = await makeTree()
    try {
      await writeBundleDir(tree.bundle, 'pkg-a', { 'index.js': 'a', 'lib/x.js': 'x' })
      await writeBundleDir(tree.bundle, '@scope', { 'pkg/package.json': '{}' })
      await writeManifest(tree.bundle, ['pkg-a', '@scope'])

      await syncBuiltinTree(tree.bundle, tree.target)
      assert.equal(await readFile(join(tree.target, 'pkg-a', 'index.js'), 'utf8'), 'a')
      assert.equal(await readFile(join(tree.target, 'pkg-a', 'lib', 'x.js'), 'utf8'), 'x')
      assert.equal(await readFile(join(tree.target, '@scope', 'pkg', 'package.json'), 'utf8'), '{}')
      const applied = JSON.parse(await readFile(join(tree.target, 'manifest.applied.json'), 'utf8'))
      assert.deepEqual(applied.topLevelDirs, ['pkg-a', '@scope'])

      // 二次同步：目标里塞一个无关目录（不在任何 manifest 中），不应被删
      await mkdir(join(tree.target, 'user-pkg'), { recursive: true })
      await writeFile(join(tree.target, 'user-pkg', 'keep.js'), 'keep')
      await syncBuiltinTree(tree.bundle, tree.target)
      assert.equal(await readFile(join(tree.target, 'user-pkg', 'keep.js'), 'utf8'), 'keep')
      assert.equal(await readFile(join(tree.target, 'pkg-a', 'index.js'), 'utf8'), 'a')
    } finally {
      await tree.cleanup()
    }
  })

  it('升级：覆盖换装清残留文件，旧 manifest 独有的目录被删除', async () => {
    const tree = await makeTree()
    try {
      // v1: pkg-a(含 stale.js) + pkg-old
      await writeBundleDir(tree.bundle, 'pkg-a', { 'index.js': 'v1', 'stale.js': 'stale' })
      await writeBundleDir(tree.bundle, 'pkg-old', { 'index.js': 'old' })
      await writeManifest(tree.bundle, ['pkg-a', 'pkg-old'])
      await syncBuiltinTree(tree.bundle, tree.target)

      // v2: pkg-a 无 stale.js，pkg-old 移除
      const bundle2 = join(dirname(tree.bundle), 'bundle2')
      await mkdir(join(bundle2, 'node_modules'), { recursive: true })
      await writeBundleDir(bundle2, 'pkg-a', { 'index.js': 'v2' })
      await writeManifest(bundle2, ['pkg-a'])
      await syncBuiltinTree(bundle2, tree.target)

      assert.equal(await readFile(join(tree.target, 'pkg-a', 'index.js'), 'utf8'), 'v2')
      await assert.rejects(() => readFile(join(tree.target, 'pkg-a', 'stale.js'), 'utf8'))
      await assert.rejects(() => readFile(join(tree.target, 'pkg-old', 'index.js'), 'utf8'))
    } finally {
      await tree.cleanup()
    }
  })

  it('manifest 引用的目录在产物中缺失 → 抛错', async () => {
    const tree = await makeTree()
    try {
      await writeManifest(tree.bundle, ['missing-dir'])
      await assert.rejects(() => syncBuiltinTree(tree.bundle, tree.target))
    } finally {
      await tree.cleanup()
    }
  })
})
```

注意：测试文件里 `import ... from './builtinPackageSync.ts'` 的 `.ts` 后缀是 `node --test` type-stripping 的要求；`tsconfig.node.json` 已排除 `src/**/*.test.ts`，不影响 typecheck。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/main/agent/builtinPackageSync.test.ts`
Expected: FAIL，报 `Cannot find module './builtinPackageSync.ts'`（模块尚未创建）。
若报 `Unknown file extension ".ts"` 说明 Node 未开 type-stripping，改用 `node --experimental-strip-types --test ...`（Node 24.14 默认已开，不应出现）。

- [ ] **Step 3: 实现模块（完整内容）**

```ts
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 构建脚本生成的预装树清单（resources/agent/npm/manifest.json）。 */
export interface BuiltinTreeManifest {
  generatedAt?: string
  platform?: string
  arch?: string
  packages?: Record<string, string>
  /** node_modules 顶层目录名（@scope 目录作为整体拷贝单元） */
  topLevelDirs: string[]
}

const APPLIED_MANIFEST = 'manifest.applied.json'

/** 读取随包分发的预装树 manifest；缺失/损坏时抛出带修复指引的错误。 */
export async function readBundleManifest(bundleNpmDir: string): Promise<BuiltinTreeManifest> {
  let raw: string
  try {
    raw = await readFile(join(bundleNpmDir, 'manifest.json'), 'utf8')
  } catch {
    throw new Error(
      `内置包预装树缺失（${join(bundleNpmDir, 'manifest.json')}），请先运行 pnpm agent:builtins`
    )
  }
  const manifest = JSON.parse(raw) as BuiltinTreeManifest
  if (!Array.isArray(manifest.topLevelDirs)) {
    throw new Error(
      `内置包预装树 manifest 损坏（${join(bundleNpmDir, 'manifest.json')}），请重新运行 pnpm agent:builtins`
    )
  }
  return manifest
}

/** 上次成功应用的 manifest（agentDir 侧）；无/损坏返回 null。 */
async function readAppliedManifest(targetNodeModules: string): Promise<BuiltinTreeManifest | null> {
  try {
    const parsed = JSON.parse(
      await readFile(join(targetNodeModules, APPLIED_MANIFEST), 'utf8')
    ) as BuiltinTreeManifest
    return Array.isArray(parsed.topLevelDirs) ? parsed : null
  } catch {
    return null
  }
}

/** 计算目录动作：安装=新清单全量；删除=旧清单有、新清单无。 */
export function computeDirActions(
  bundle: BuiltinTreeManifest,
  applied: BuiltinTreeManifest | null
): { install: string[]; remove: string[] } {
  const next = new Set(bundle.topLevelDirs)
  return {
    install: [...bundle.topLevelDirs],
    remove: (applied?.topLevelDirs ?? []).filter((dir) => !next.has(dir))
  }
}

/**
 * 把随包分发的预装树同步到 agentDir 的 npm node_modules。
 * 逐目录「拷临时 → 删旧 → rename」保证原子性（半成品不会被 pi resolve 到）；
 * 全部成功后写 manifest.applied.json 作为下次增量清理的基准。
 */
export async function syncBuiltinTree(
  bundleNpmDir: string,
  targetNodeModules: string
): Promise<void> {
  const bundle = await readBundleManifest(bundleNpmDir)
  const bundleNodeModules = join(bundleNpmDir, 'node_modules')
  const applied = await readAppliedManifest(targetNodeModules)
  const { install, remove } = computeDirActions(bundle, applied)

  await mkdir(targetNodeModules, { recursive: true })
  for (const dir of remove) {
    await rm(join(targetNodeModules, dir), { recursive: true, force: true })
  }
  for (const dir of install) {
    const src = join(bundleNodeModules, dir)
    const dest = join(targetNodeModules, dir)
    const tmp = join(targetNodeModules, `.nexus-sync-${process.pid}-${encodeURIComponent(dir)}`)
    // cp 先成功再换装：源目录缺失（产物损坏）时目标原样保留，等待重试
    await rm(tmp, { recursive: true, force: true })
    await cp(src, tmp, { recursive: true })
    await rm(dest, { recursive: true, force: true })
    await rename(tmp, dest)
  }

  const manifestFile = join(targetNodeModules, APPLIED_MANIFEST)
  const tmpFile = `${manifestFile}.tmp`
  await writeFile(tmpFile, JSON.stringify(bundle, null, 2))
  await rename(tmpFile, manifestFile)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/main/agent/builtinPackageSync.test.ts`
Expected: PASS（`# pass 5`，0 fail）。

---

### Task 6: `AgentResourceService` reconcile 离线化

**Files:**

- Modify: `src/main/agent/AgentResourceService.ts`

- [ ] **Step 1: 加 import**

在 `import { inferPackageName, isPinnedSource, packageIdentity, packageTypeOf } from './packageSources'` 之后加：

```ts
import { syncBuiltinTree } from './builtinPackageSync'
```

- [ ] **Step 2: 更新 initialize() 中的过时注释**

把 `initialize()` 里：

```ts
// reconcile 可能联网安装，异步执行不阻塞启动；完成后广播 changed 让 UI 刷新
void this.reconcileBuiltins()
```

改为：

```ts
// 离线 reconcile（从随包预装树拷贝），异步执行不阻塞启动；完成后广播 changed 让 UI 刷新
void this.reconcileBuiltins()
```

- [ ] **Step 3: 替换 reconcileBuiltins() 整个方法体**

把现有 `private async reconcileBuiltins(): Promise<void> { ... }`（约 315-348 行）整体替换为：

```ts
  private async reconcileBuiltins(): Promise<void> {
    if (this.reconciling) return
    this.reconciling = true
    try {
      const pm = this.requirePackageManager()
      const configured = pm.listConfiguredPackages()
      const stale: BuiltinPackageDef[] = []
      for (const def of this.builtinPackages) {
        const match = configured.find(
          (pkg) => packageIdentity(pkg.source) === packageIdentity(def.source)
        )
        if (match && match.source === def.source && match.installedPath) {
          this.builtinStatus.set(def.id, { status: 'ok' })
        } else {
          stale.push(def)
        }
      }
      if (stale.length > 0) {
        for (const def of stale) this.builtinStatus.set(def.id, { status: 'installing' })
        this.broadcastChanged('reconcile')
        try {
          // 离线落位：从随包预装树整树同步（无任何网络调用），成功后登记 source。
          // 登记放在拷贝之后：拷贝失败不登记，pi 的 resolve 就不会尝试联网补装。
          await syncBuiltinTree(
            application.getPath('resources.agent', 'npm'),
            join(this.agentDir, 'npm', 'node_modules')
          )
          for (const def of stale) {
            pm.addSourceToSettings(def.source)
            this.builtinStatus.set(def.id, { status: 'ok' })
            logger.info(`内置包就绪: ${def.source}`)
          }
          await this.reloadAll()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          for (const def of stale) this.builtinStatus.set(def.id, { status: 'failed', error: message })
          logger.error('内置包离线落位失败', error)
        }
      }
      this.broadcastChanged('reconcile')
    } finally {
      this.reconciling = false
    }
  }
```

- [ ] **Step 4: 类型检查 + lint**

Run: `pnpm typecheck:node && pnpm lint`
Expected: 通过，无新增错误（`installPackage` 仍引用 `installAndPersist`，无未使用 import）。

---

### Task 7: packageSmoke 改离线语义 + skills 断言

**Files:**

- Modify: `src/main/agent/packageSmoke.ts`

- [ ] **Step 1: 更新文件头注释**

把：

```ts
/**
 * 包管理冒烟（M1）：验证 AgentResourceService 初始化、内置包 reconcile 落定、
 * 包清单可读。触发：`NEXUS_PACKAGE_SMOKE=1 pnpm dev`（或打包产物同环境变量启动）。
 * 首次运行会联网安装内置包 pi-mcp-adapter（钉版），需可访问 npm registry。
 */
```

改为：

```ts
/**
 * 包管理冒烟：验证 AgentResourceService 初始化、内置包离线 reconcile 落定、
 * 包清单可读、包内 skills 可见。触发：`NEXUS_PACKAGE_SMOKE=1 pnpm dev`
 *（或打包产物同环境变量启动）。全程离线：内置包从随包预装树拷贝，不访问网络。
 * 可用 `NEXUS_CODING_AGENT_DIR=/tmp/xxx` 指向临时 agentDir，避免污染真实 ~/.nexus。
 */
```

- [ ] **Step 2: 加 skills 断言**

在 `runPackageSmoke()` 中 `logger.info('package smoke OK: builtins ready,', ...)` 之前插入：

```ts
const skills = await resources.listSkills()
const packageSkills = skills.filter((s) => s.sourceLabel === '插件')
logger.info('package skills:', packageSkills.map((s) => s.name).join(', ') || '(none)')
if (!packageSkills.some((s) => s.name === 'pi-subagents')) {
  logger.error('package smoke FAILED: pi-subagents 包内 skill 未被发现')
  return
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck:node`
Expected: 通过。

---

### Task 8: 文档同步

**Files:**

- Modify: `resources/agent/README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 改写 `resources/agent/README.md`（完整内容）**

```md
# agent/

Nexus 自有的 agent 资源，随应用分发（electron-builder `extraResources` 映射到 `<resources>/agent`），由 `AgentResourceService` 在运行时读取（`application.getPath('resources.agent', ...)`）。

- `prompts/*.md` — 追加到 pi 系统提示词的规则文本（`DefaultResourceLoader` 的 `appendSystemPrompt`，按文件名排序拼接）。新增 `.md` 文件即生效（新建会话的 loader 创建时扫描），无需改代码。
- `builtin-packages.json` — 内置 pi 包清单，`[{ "id", "source" }]`，仅支持钉版的 `npm:<name>@<version>` 来源：升级节奏由 Nexus 发版控制（改版本发新版，启动 reconcile 检测不一致即整树换装）。
- `npm/` — 内置包预装树（`pnpm agent:builtins` 生成，**勿提交、勿手改**，已 gitignore）。构建机在当前平台执行 `npm install`（`--omit=dev --legacy-peer-deps`）后剪枝产出，含平台原生二进制（recheck、@napi-rs/keyring）；`manifest.json` 记录顶层目录清单，供运行时增量清理旧版本残留。electron-builder `beforePack` 打包时自动生成对应平台的树；本地开发在 clone/pull 或 `builtin-packages.json` 变更后需手动跑一次 `pnpm agent:builtins`，否则启动时内置包 reconcile 报「预装树缺失」。

运行时语义：启动时 `AgentResourceService` 把预装树逐目录原子拷贝到 `~/.nexus/agent/npm/node_modules/`，再用 `addSourceToSettings` 登记 source，全程离线（不经 npm/git/网络）。

注意：`resources/provider/` 下的 JSON 是生成产物，禁止手改（见其 README）。
```

- [ ] **Step 2: AGENTS.md 三处更新**

1. 「常用命令」代码块中 `pnpm typecheck` 一行之后加：

```bash
pnpm agent:builtins # 生成内置 pi 包预装树（resources/agent/npm/；clone/清单变更后需执行，打包时 beforePack 自动跑）
```

2. 「仓库结构」中 `resources/agent/` 一行改为：

```
resources/agent/    随包分发的 agent 资源（extraResources）：prompts/*.md 追加 pi 系统提示词
                    （按文件名排序拼接，新增 .md 即生效）、builtin-packages.json 内置 pi 包钉版清单、
                    npm/ 内置包预装树（pnpm agent:builtins 生成，gitignored）—— 详见其 README
```

3. 「项目约定」第 1 条中「内置 pi 包钉版在 `resources/agent/builtin-packages.json`，升级节奏由 Nexus 发版控制。」改为：

```
   - 内置 pi 包钉版在 `resources/agent/builtin-packages.json`；预装树由 `pnpm agent:builtins` 生成（打包时 beforePack 自动），运行时装机离线拷贝到 `~/.nexus/agent/npm/`，不依赖用户机器的 npm/git/网络。升级节奏由 Nexus 发版控制。
```

---

### Task 9: 端到端验证

**Files:** 无（全部验证步骤）

- [ ] **Step 1: 单测**

Run: `node --test src/main/agent/builtinPackageSync.test.ts`
Expected: `# pass 5`，`# fail 0`

- [ ] **Step 2: 类型与 lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 3: 全新临时 agentDir 冒烟（证明离线链路，不碰真实 ~/.nexus）**

先确认预装树已生成（`ls resources/agent/npm/manifest.json` 存在，不存在则 `pnpm agent:builtins`），然后：

Run: `rm -rf /tmp/nexus-smoke-agent && NEXUS_CODING_AGENT_DIR=/tmp/nexus-smoke-agent NEXUS_PACKAGE_SMOKE=1 pnpm dev`
Expected（主进程日志）:

- `内置包就绪: npm:pi-mcp-adapter@2.17.0`（及另外两个 source）
- `package skills: ... pi-subagents ...`
- `package smoke OK: builtins ready, 3 package(s) configured`
- `ls /tmp/nexus-smoke-agent/npm/node_modules/pi-web-access/package.json` 存在；
- `cat /tmp/nexus-smoke-agent/agent/settings.json | grep -c 'npm:pi-'` ≥ 3。
  （可选加强验证：系统断网后重跑一次，结果应完全相同。）

- [ ] **Step 4: 打包冒烟（beforePack + 产物内离线落位）**

Run: `pnpm build:unpack`
Expected:

- 日志含 `预装树已生成`；
- `ls out/mac-arm64/nexus-scaffold.app/Contents/Resources/agent/npm/manifest.json` 存在；
- `ls out/mac-arm64/nexus-scaffold.app/Contents/Resources/agent/npm/node_modules/ | grep recheck-macos-arm64` 存在。

Run: `rm -rf /tmp/nexus-smoke-agent && NEXUS_CODING_AGENT_DIR=/tmp/nexus-smoke-agent NEXUS_PACKAGE_SMOKE=1 out/mac-arm64/nexus-scaffold.app/Contents/MacOS/nexus-scaffold 2>&1 | grep -E 'smoke|内置包'`
Expected: 含 `package smoke OK`。

- [ ] **Step 5: 设置页人工确认**

`pnpm dev` 打开 设置 → 插件：内置区显示 pi-mcp-adapter / pi-web-access / pi-subagents 三个包，状态正常、开关可切换；「技能」tab 出现 `pi-subagents` 技能（来源标签「插件」）。

---

## 自审记录

- Spec 覆盖：清单扩充(T1)、构建脚本+剪枝+recheck-jar 条件剪枝(T2)、script+gitignore(T3)、beforePack+跨平台守卫(T4)、拷贝纯逻辑+单测(T5)、reconcile 离线化+失败不登记(T6)、冒烟离线语义(T7)、README/AGENTS.md(T8)、验证含断网与打包(T9) —— 全覆盖。
- 类型一致性：`BuiltinTreeManifest`/`syncBuiltinTree(bundleNpmDir, targetNodeModules)`/`computeDirActions` 在 T5 定义、T6 调用一致；build 脚本写的 manifest 字段（`topLevelDirs`/`platform`/`arch`/`packages`/`generatedAt`）与 sync 模块读的字段一致；`manifest.applied.json` 命名一致。
- 无占位符；无 git commit 步骤（用户明确要求）。
