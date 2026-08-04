import { loggerService } from '@logger'

import { application } from '@application'
import type { AgentService } from '@main/agent'

const logger = loggerService.withContext('PackageSmoke')

/**
 * 包管理冒烟：验证 AgentResourceService 初始化、内置包离线 reconcile 落定、
 * 包清单可读、包内 skills 可见。触发：`NEXUS_PACKAGE_SMOKE=1 pnpm dev`
 *（或打包产物同环境变量启动）。全程离线：内置包从随包预装树拷贝，不访问网络。
 * 可用 `NEXUS_CODING_AGENT_DIR=/tmp/xxx` 指向临时 agentDir，避免污染真实 ~/.nexus。
 */
export async function runPackageSmoke(): Promise<void> {
  try {
    const agentService = application.get<AgentService>('AgentService')
    const { resources } = agentService

    // 等待 reconcile 落定：轮询内置包状态（installing → ok/failed）
    const deadline = Date.now() + 120_000
    for (;;) {
      // initialize 尚未完成时 listPackages 会抛 not initialized：视为未就绪，继续轮询直至超时
      const packages = await resources.listPackages().catch(() => null)
      if (packages) {
        const pending = packages.filter(
          (pkg) => pkg.isBuiltin && pkg.builtinStatus === 'installing'
        )
        if (pending.length === 0) {
          logger.info('packages:', JSON.stringify(packages, null, 2))
          const failed = packages.filter((pkg) => pkg.isBuiltin && pkg.builtinStatus === 'failed')
          if (failed.length > 0) {
            logger.error('package smoke FAILED: builtin install failed', failed[0]?.builtinError)
            return
          }
          const skills = await resources.listSkills()
          const packageSkills = skills.filter((s) => s.sourceLabel === '插件')
          logger.info('package skills:', packageSkills.map((s) => s.name).join(', ') || '(none)')
          if (!packageSkills.some((s) => s.name === 'pi-subagents')) {
            logger.error('package smoke FAILED: pi-subagents 包内 skill 未被发现')
            return
          }
          logger.info('package smoke OK: builtins ready,', packages.length, 'package(s) configured')
          return
        }
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
