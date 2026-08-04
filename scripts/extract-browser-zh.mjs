// 从上游浏览器应用的 zh.json 提取浏览器相关 key 的翻译，生成 features/browser/i18n-zh.ts
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import prettier from 'prettier'

// Why: 上游仓库位置因人而异，必须经 UPSTREAM_REPO 环境变量显式提供。
const UPSTREAM_REPO = process.env.UPSTREAM_REPO
if (!UPSTREAM_REPO) {
  console.error(
    'UPSTREAM_REPO environment variable is required: set it to the upstream browser-app ' +
      'checkout containing src/renderer/src/i18n/locales/{zh,en}.json.'
  )
  process.exit(1)
}
if (!existsSync(UPSTREAM_REPO)) {
  console.error(`upstream repo not found at: ${UPSTREAM_REPO}`)
  process.exit(1)
}

// Why: /browser/i 路径过滤只覆盖 browser 命名空间；已迁移到 features/browser/ 的代码
// 还引用了少量命名空间外的 key（预防性扫描：features/browser 内全部 translate('...')
// 调用点与生成物求差集）。这些 key 在此显式登记，从上游 zh.json 取值并入。
// 后续迁移（Task 9-11）如引入新的命名空间外 key，同样追加到这里。
const EXTRA_KEYS = [
  'auto.components.ui.dialog.f26c4baeda', // features/browser/ui/dialog.tsx 的 "关闭"
  // useBrowserIpcEvents.ts 的错误/标题文案：
  'auto.hooks.useIpcEvents.f6300deb8b', // guest ⌘T 新标签标题 "New Browser Tab"
  'auto.hooks.useIpcEvents.f000b2ff76', // tab create 无活跃 worktree 错误
  'auto.hooks.useIpcEvents.0e3cf53060', // tab 未找到错误
  'auto.hooks.useIpcEvents.a8d2bf8e9e' // tab close 无活跃标签错误
]

const zh = JSON.parse(readFileSync(`${UPSTREAM_REPO}/src/renderer/src/i18n/locales/zh.json`, 'utf8'))
const en = JSON.parse(readFileSync(`${UPSTREAM_REPO}/src/renderer/src/i18n/locales/en.json`, 'utf8'))

// De-brand 替换层：上游官方翻译是用户可见文案，其中的上游品牌字样替换为 Nexus。
// 品牌名从上游 package.json 推导（productName 优先），不在此硬编码。
// Why: i18n-zh.ts 是生成物（勿手改），品牌替换必须在生成管线里做；值与 key 都替换
// （含品牌字样的 key 与 translate 调用点同步改名）。
const upstreamPkg = JSON.parse(readFileSync(`${UPSTREAM_REPO}/package.json`, 'utf8'))
const upstreamBrand = upstreamPkg.productName || upstreamPkg.name
if (typeof upstreamBrand !== 'string' || upstreamBrand.length === 0) {
  console.error('cannot determine the upstream brand name from its package.json')
  process.exit(1)
}
const deBrand = (value) =>
  value
    .replaceAll(upstreamBrand, 'Nexus')
    .replaceAll(upstreamBrand.toUpperCase(), 'NEXUS')
    .replaceAll(upstreamBrand.toLowerCase(), 'nexus')

const out = {}
const walk = (node, zhNode, path) => {
  for (const [k, v] of Object.entries(node ?? {})) {
    const p = path ? `${path}.${k}` : k
    if (typeof v === 'string') {
      if (/browser/i.test(p) && typeof zhNode?.[k] === 'string') out[p] = deBrand(zhNode[k])
    } else if (v && typeof v === 'object') {
      walk(v, zhNode?.[k], p)
    }
  }
}
walk(en, zh, '')

const lookup = (obj, path) =>
  path.split('.').reduce((node, k) => (node && typeof node === 'object' ? node[k] : undefined), obj)
for (const key of EXTRA_KEYS) {
  const value = lookup(zh, key)
  if (typeof value === 'string') {
    out[key] = deBrand(value)
  } else {
    console.warn(`warning: EXTRA_KEYS entry not found in upstream zh.json: ${key}`)
  }
}

// Why: key 里的品牌字样与值同步替换，保持与调用点一致。
for (const key of Object.keys(out)) {
  const renamed = deBrand(key)
  if (renamed !== key) {
    out[renamed] = out[key]
    delete out[key]
  }
}

const body = JSON.stringify(out, null, 2)
const target = 'src/renderer/src/features/browser/i18n-zh.ts'
const raw = `// 生成自上游浏览器 i18n 中文语料（scripts/extract-browser-zh.mjs），勿手改\nexport const BROWSER_ZH: Record<string, string> = ${body}\n`
// Why: 生成物直接符合仓库 prettier 风格，重新生成后无需再跑 format。
const config = await prettier.resolveConfig(target)
writeFileSync(target, await prettier.format(raw, { ...config, parser: 'typescript' }))
console.log(`extracted ${Object.keys(out).length} keys`)

// 预防性扫描：features/browser 内全部 translate('...') 调用点与生成物求差集。
// 差集（代码用到、但 /browser/i 命名空间与 EXTRA_KEYS 都未覆盖的 key）需追加到
// EXTRA_KEYS 后重新运行本脚本，直至差集为空。
const FEATURES_DIR = 'src/renderer/src/features/browser'
const TRANSLATE_CALL = /translate\(\s*['"]([^'"]+)['"]/g
const usedKeys = new Set()
const collectFiles = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full)
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      const source = readFileSync(full, 'utf8')
      for (const match of source.matchAll(TRANSLATE_CALL)) {
        usedKeys.add(match[1])
      }
    }
  }
}
collectFiles(FEATURES_DIR)
const missing = [...usedKeys].filter((key) => !(key in out)).sort()
if (missing.length > 0) {
  console.warn(
    `\nwarning: ${missing.length} translate key(s) used in features/browser but absent from generated map ` +
      '(add to EXTRA_KEYS and re-run):'
  )
  for (const key of missing) {
    const value = lookup(zh, key)
    console.warn(`  ${key}${typeof value === 'string' ? '' : '  (NOT FOUND in upstream zh.json)'}`)
  }
} else {
  console.log(`coverage scan: all ${usedKeys.size} used translate keys present in generated map`)
}
