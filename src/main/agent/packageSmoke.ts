import { loggerService } from '@logger'

import { application } from '@application'
import type { AgentService } from '@main/agent'

const logger = loggerService.withContext('PackageSmoke')

/**
 * 包管理冒烟（M1）：验证 AgentResourceService 初始化、内置包 reconcile 落定、
 * 包清单可读。触发：`NEXUS_PACKAGE_SMOKE=1 pnpm dev`（或打包产物同环境变量启动）。
 * 首次运行会联网安装内置包 pi-mcp-adapter（钉版），需可访问 npm registry。
 */
export async function runPackageSmoke(): Promise<void> {
  try {
    const agentService = application.get<AgentService>('AgentService')
    const { resources } = agentService

    // 等待 reconcile 落定：轮询内置包状态（installing → ok/failed）
    const deadline = Date.now() + 120_000
    for (;;) {
      const packages = await resources.listPackages()
      const pending = packages.filter((pkg) => pkg.isBuiltin && pkg.builtinStatus === 'installing')
      if (pending.length === 0) {
        logger.info('packages:', JSON.stringify(packages, null, 2))
        const failed = packages.filter((pkg) => pkg.isBuiltin && pkg.builtinStatus === 'failed')
        if (failed.length > 0) {
          logger.error('package smoke FAILED: builtin install failed', failed[0]?.builtinError)
          return
        }
        logger.info('package smoke OK: builtins ready,', packages.length, 'package(s) configured')
        return
      }
      if (Date.now() > deadline) {
        logger.error('package smoke FAILED: builtin reconcile timed out')
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  } catch (error) {
    logger.error('package smoke FAILED:', error)
  }
}
