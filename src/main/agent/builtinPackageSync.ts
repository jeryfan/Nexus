import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
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
  let manifest: BuiltinTreeManifest
  try {
    manifest = JSON.parse(await readFile(join(bundleNpmDir, 'manifest.json'), 'utf8'))
  } catch (cause) {
    throw new Error(
      `内置包预装树缺失或损坏（${join(bundleNpmDir, 'manifest.json')}），请先运行 pnpm agent:builtins`,
      { cause }
    )
  }
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

/** node_modules 顶层目录名白名单：单段、不以点开头、无路径分隔符，兼容 @scope。 */
const DIR_NAME_PATTERN = /^[\w@][\w.-]*$/

/** 校验 manifest 条目，杜绝被篡改的 manifest 用 `../` 之类条目删到 target 外。 */
function assertValidDirNames(dirs: string[], source: string): void {
  for (const dir of dirs) {
    if (!DIR_NAME_PATTERN.test(dir)) {
      throw new Error(`内置包 manifest 含非法目录名 "${dir}"（${source}），manifest 可能被篡改`)
    }
  }
}

/**
 * 计算目录动作：安装=新清单全量；删除=旧清单有、新清单无。
 * install 恒为全量清单（重复拷贝换取逻辑简单），本函数的真实价值在 remove：
 * 只删旧清单有、新清单无的目录，用户自装目录不受影响。
 */
export function computeDirActions(
  bundle: BuiltinTreeManifest,
  applied: BuiltinTreeManifest | null
): { install: string[]; remove: string[] } {
  assertValidDirNames(bundle.topLevelDirs, 'bundle manifest')
  assertValidDirNames(applied?.topLevelDirs ?? [], APPLIED_MANIFEST)
  const next = new Set(bundle.topLevelDirs)
  return {
    install: [...bundle.topLevelDirs],
    remove: (applied?.topLevelDirs ?? []).filter((dir) => !next.has(dir))
  }
}

/**
 * 把随包分发的预装树同步到 agentDir 的 npm node_modules。
 *
 * 调用方必须保证串行执行：同一 targetNodeModules 不可并发调用
 * （当前消费方 AgentResourceService.reconcileBuiltins 在主进程内以共享 reconcileInFlight Promise 去重）。
 *
 * 逐目录「拷临时 → 删旧 → rename」换装：POSIX 无法原子替换非空目录，
 * 因此对读者而言 dest 要么缺席、要么完整，绝不会是拷到一半的半成品（pi 不会 resolve 到半成品）；
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
  // 清理上次崩溃遗留的换装临时目录，避免残留累积
  for (const entry of await readdir(targetNodeModules)) {
    if (entry.startsWith('.nexus-sync-')) {
      await rm(join(targetNodeModules, entry), { recursive: true, force: true })
    }
  }
  for (const dir of remove) {
    await rm(join(targetNodeModules, dir), { recursive: true, force: true })
  }
  for (const dir of install) {
    const src = join(bundleNodeModules, dir)
    const dest = join(targetNodeModules, dir)
    const tmp = join(targetNodeModules, `.nexus-sync-${process.pid}-${encodeURIComponent(dir)}`)
    // cp 先成功再换装：源目录缺失（产物损坏）时目标原样保留，等待重试
    await rm(tmp, { recursive: true, force: true })
    try {
      await cp(src, tmp, { recursive: true })
    } catch (cause) {
      throw new Error(
        `内置包预装树损坏：目录 "${dir}" 缺失或不可读（${src}），请重新运行 pnpm agent:builtins（或重装应用）`,
        { cause }
      )
    }
    await rm(dest, { recursive: true, force: true })
    await rename(tmp, dest)
  }

  const manifestFile = join(targetNodeModules, APPLIED_MANIFEST)
  const tmpFile = `${manifestFile}.tmp`
  await writeFile(tmpFile, JSON.stringify(bundle, null, 2))
  await rename(tmpFile, manifestFile)
}
