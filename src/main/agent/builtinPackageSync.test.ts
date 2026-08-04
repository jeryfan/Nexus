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

  it('manifest 为非法 JSON 时报错并提示 pnpm agent:builtins', async () => {
    const tree = await makeTree()
    try {
      await writeFile(join(tree.bundle, 'manifest.json'), '{ not json')
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
  it('首装：拷贝目录并写 manifest.applied.json；二次同步保留无关目录', async () => {
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

  it('manifest 引用的目录在产物中缺失 → 抛错并提示 pnpm agent:builtins', async () => {
    const tree = await makeTree()
    try {
      await writeManifest(tree.bundle, ['missing-dir'])
      await assert.rejects(() => syncBuiltinTree(tree.bundle, tree.target), /pnpm agent:builtins/)
    } finally {
      await tree.cleanup()
    }
  })

  it('applied manifest 损坏 → 按首装处理，不删任何已有目录', async () => {
    const tree = await makeTree()
    try {
      await mkdir(join(tree.target, 'existing-pkg'), { recursive: true })
      await writeFile(join(tree.target, 'existing-pkg', 'index.js'), 'old')
      await writeFile(join(tree.target, 'manifest.applied.json'), '{ corrupt')
      await writeBundleDir(tree.bundle, 'pkg-a', { 'index.js': 'a' })
      await writeManifest(tree.bundle, ['pkg-a'])

      await syncBuiltinTree(tree.bundle, tree.target)
      assert.equal(await readFile(join(tree.target, 'existing-pkg', 'index.js'), 'utf8'), 'old')
      assert.equal(await readFile(join(tree.target, 'pkg-a', 'index.js'), 'utf8'), 'a')
    } finally {
      await tree.cleanup()
    }
  })

  it('空 topLevelDirs → 成功，只写 applied，不删不装', async () => {
    const tree = await makeTree()
    try {
      await mkdir(join(tree.target, 'untouched'), { recursive: true })
      await writeFile(join(tree.target, 'untouched', 'keep.js'), 'keep')
      await writeManifest(tree.bundle, [])

      await syncBuiltinTree(tree.bundle, tree.target)
      assert.equal(await readFile(join(tree.target, 'untouched', 'keep.js'), 'utf8'), 'keep')
      const applied = JSON.parse(await readFile(join(tree.target, 'manifest.applied.json'), 'utf8'))
      assert.deepEqual(applied.topLevelDirs, [])
    } finally {
      await tree.cleanup()
    }
  })

  it('topLevelDirs 含非法条目（../evil）→ 抛错', async () => {
    const tree = await makeTree()
    try {
      await writeBundleDir(tree.bundle, 'pkg-a', { 'index.js': 'a' })
      await writeManifest(tree.bundle, ['pkg-a', '../evil'])
      await assert.rejects(() => syncBuiltinTree(tree.bundle, tree.target), /\.\.\/evil/)
    } finally {
      await tree.cleanup()
    }
  })

  it('sync 开头清理历史 .nexus-sync- 临时目录残留', async () => {
    const tree = await makeTree()
    try {
      await writeBundleDir(tree.bundle, 'pkg-a', { 'index.js': 'a' })
      await writeManifest(tree.bundle, ['pkg-a'])
      const stale = join(tree.target, '.nexus-sync-999-foo')
      await mkdir(stale, { recursive: true })
      await writeFile(join(stale, 'partial.js'), 'partial')

      await syncBuiltinTree(tree.bundle, tree.target)
      await assert.rejects(() => readFile(join(stale, 'partial.js'), 'utf8'))
      assert.equal(await readFile(join(tree.target, 'pkg-a', 'index.js'), 'utf8'), 'a')
    } finally {
      await tree.cleanup()
    }
  })
})
