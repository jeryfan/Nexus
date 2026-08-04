/**
 * electron-builder afterPack 钩子：为随包分发的可执行资源补执行位——
 * 产物的可执行位在跨平台打包后不可靠（agent-browser 各平台二进制 exec bit
 * 不一致，child_process.execFile 需要拷贝出的二进制可执行），CLI shim 同理。
 */
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default async function afterPack(context) {
  // Why: macOS 的 appOutDir 是 .app 的父目录，Resources 在 <ProductName>.app 内；
  // 其他平台 resources/ 与可执行文件同级。
  const resourcesDir =
    context.electronPlatformName === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      : join(context.appOutDir, 'resources')

  // agent-browser 原生二进制（extraResources 映射到 Resources 根）
  if (existsSync(resourcesDir)) {
    for (const filename of readdirSync(resourcesDir)) {
      if (filename.startsWith('agent-browser-')) {
        chmodSync(join(resourcesDir, filename), 0o755)
      }
    }
  }

  // nexus CLI 启动 shim（Resources/bin/）
  const binDir = join(resourcesDir, 'bin')
  if (existsSync(binDir)) {
    for (const filename of readdirSync(binDir)) {
      chmodSync(join(binDir, filename), 0o755)
    }
  }
}
