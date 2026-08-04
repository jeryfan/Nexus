// Glue for Nexus: 让 agent 的 shell 能找到 `nexus` CLI 并定位 runtime。
// agent runtime 为 pi-coding-agent，主进程内运行，其 bash 工具的子进程 env 每次调用时
// 从 process.env 动态展开（pi getShellEnv，无缓存），故主进程启动早期注入 process.env
// 即可全继承。
import { app } from 'electron'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { loggerService } from '@logger'

const logger = loggerService.withContext('BrowserCliEnv')

/**
 * 注入 `NEXUS_USER_DATA_PATH`（CLI 据此定位 nexus-runtime.json）并把 CLI 所在目录
 * 前置进 PATH。打包态使用 Resources/bin 下随包分发的 shim；开发态在
 * `<userData>/cli/bin` 生成指向 repo `out/cli/index.js` 的 shim。
 */
export function installBrowserCliEnv(): void {
  const userData = app.getPath('userData')
  process.env.NEXUS_USER_DATA_PATH = userData

  let cliBinDir: string
  if (app.isPackaged) {
    // 打包态：Resources/bin/nexus（electron-builder extraResources 的 shim，见 electron-builder.yml）
    cliBinDir = join(process.resourcesPath, 'bin')
  } else {
    // 开发态：<userData>/cli/bin/nexus → node <repo>/out/cli/index.js
    cliBinDir = join(userData, 'cli', 'bin')
    writeDevShim(cliBinDir)
  }

  const current = process.env.PATH ?? ''
  if (existsSync(cliBinDir) && !current.split(delimiter).includes(cliBinDir)) {
    process.env.PATH = `${cliBinDir}${delimiter}${current}`
  }
  logger.info(`browser CLI env installed: bin=${cliBinDir} userData=${userData}`)
}

/** 开发态 shim：每次启动重写（repo 迁移后自愈）；out/cli 未构建时跳过。 */
function writeDevShim(cliBinDir: string): void {
  const cliEntry = join(app.getAppPath(), 'out', 'cli', 'index.js')
  if (!existsSync(cliEntry)) {
    logger.warn(`dev CLI shim skipped: ${cliEntry} missing (run pnpm build:cli)`)
    return
  }
  mkdirSync(cliBinDir, { recursive: true })
  if (process.platform === 'win32') {
    const shim = join(cliBinDir, 'nexus.cmd')
    writeFileSync(shim, `@echo off\r\nnode "${cliEntry}" %*\r\n`, 'utf8')
  } else {
    const shim = join(cliBinDir, 'nexus')
    writeFileSync(shim, `#!/bin/bash\nexec node "${cliEntry}" "$@"\n`, 'utf8')
    chmodSync(shim, 0o755)
  }
}
