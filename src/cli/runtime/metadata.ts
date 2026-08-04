// 裁剪: 默认 userData 目录改为 nexus-scaffold
// （打包 productName），并在默认目录没有 nexus-runtime.json 时回退同平台 `nexus`
// 目录（dev 实例，见下方注释）。
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  findTransport,
  getRuntimeMetadataPath,
  type RuntimeMetadata
} from '../../shared/browser/runtime-bootstrap'
import { RuntimeClientError } from './types'

export function readMetadata(userDataPath: string): RuntimeMetadata {
  const metadataPath = getRuntimeMetadataPath(userDataPath)
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as RuntimeMetadata | null
    if (!metadata || !findTransport(metadata, 'unix', 'named-pipe') || !metadata.authToken) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        `Nexus runtime metadata is incomplete at ${metadataPath}`
      )
    }
    return metadata
  } catch (error) {
    if (error instanceof RuntimeClientError) {
      throw error
    }
    throw new RuntimeClientError(
      'runtime_unavailable',
      `Could not read Nexus runtime metadata at ${metadataPath}. Start the Nexus app first.`
    )
  }
}

export function tryReadMetadata(userDataPath: string): RuntimeMetadata | null {
  const metadataPath = getRuntimeMetadataPath(userDataPath)
  try {
    return JSON.parse(readFileSync(metadataPath, 'utf8')) as RuntimeMetadata | null
  } catch {
    return null
  }
}

function platformUserDataDir(platform: NodeJS.Platform, homeDir: string, appName: string): string {
  if (platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support', appName)
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        'APPDATA is not set, so the Nexus runtime metadata path cannot be resolved.'
      )
    }
    return join(appData, appName)
  }
  // Why: the CLI must find the same metadata file Electron writes in packaged
  // runs, so this mirrors Electron's default userData base instead of inventing
  // a CLI-specific config path.
  return join(process.env.XDG_CONFIG_HOME || join(homeDir, '.config'), appName)
}

export function getDefaultUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir = homedir()
): string {
  // Why: in dev mode (and for parallel Nexus instances), the Electron app writes
  // runtime metadata to a separate userData directory to avoid clobbering the
  // production app's metadata. The CLI needs to find the same metadata file, so
  // this env var lets the CLI target a specific instance (由主进程注入).
  if (process.env.NEXUS_USER_DATA_PATH) {
    return process.env.NEXUS_USER_DATA_PATH
  }
  const primary = platformUserDataDir(platform, homeDir, 'nexus-scaffold')
  if (existsSync(getRuntimeMetadataPath(primary))) {
    return primary
  }
  // Why: userData 目录名取 Electron app.getName()，即 asar 内 package.json 的 name 字段。
  // 实测 dist/mac-arm64/nexus-scaffold.app 的 app.asar：package.json 只有 name=nexus、
  // 无 productName（electron-builder.yml 的 productName 只改 .app 包名，不进 asar），故打包
  // 态 userData 同样是 `nexus`；本机 ~/Library/Application Support/ 实测只有 nexus（dev 与
  // 打包共用），无 nexus-scaffold 目录。上面的 nexus-scaffold 探测是防御性兜底
  //（防未来打包配置把 productName 写进 asar）；此回退覆盖实际布局，让 CLI 无需 env 也能
  // 找到运行中的 runtime。
  return platformUserDataDir(platform, homeDir, 'nexus')
}
