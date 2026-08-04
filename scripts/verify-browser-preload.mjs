#!/usr/bin/env node

// 构建期断言：sandboxed guest preload 必须是自包含 CJS（sandboxed preload 无法加载
// ESM，也无法加载 Rollup helper chunks）。产物由 electron.vite.config.ts main 段的
// browser-window-close-preload 入口输出；若构建配置回退（入口被移除或 output format
// 被改动），此断言在打包前失败。

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PRELOAD_RELATIVE_PATH = path.join('out', 'main', 'browser-window-close-preload.js')

/**
 * Verifies the sandboxed webview guest preload is emitted as a self-contained
 * CommonJS file without ESM import/export statements.
 */
export function verifyBrowserPreload({
  projectDir = path.resolve(import.meta.dirname, '..')
} = {}) {
  const preloadPath = path.join(projectDir, PRELOAD_RELATIVE_PATH)

  let stats
  try {
    stats = statSync(preloadPath)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`guest preload artifact is missing: ${PRELOAD_RELATIVE_PATH}`)
    }
    throw error
  }
  if (!stats.isFile()) {
    throw new Error(`guest preload artifact is not a file: ${PRELOAD_RELATIVE_PATH}`)
  }
  if (stats.size === 0) {
    throw new Error(`guest preload artifact is empty: ${PRELOAD_RELATIVE_PATH}`)
  }

  const content = readFileSync(preloadPath, 'utf8')
  if (/^import |^export /m.test(content)) {
    throw new Error(
      `guest preload artifact must be CommonJS (no import/export statements): ${PRELOAD_RELATIVE_PATH}`
    )
  }

  return { preloadPath, size: stats.size }
}

/** Runs guest preload verification from npm build scripts. */
function main() {
  const result = verifyBrowserPreload()
  console.log(
    `[browser-preload] verified ${path.relative(process.cwd(), result.preloadPath)} (${result.size} bytes)`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
