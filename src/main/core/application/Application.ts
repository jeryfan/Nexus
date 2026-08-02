import { app } from 'electron'
import { join } from 'node:path'

/** 随包分发的只读内容：dev 指向仓库 resources/，packaged 指向 extraResources 拷贝。 */
function shippedResources(...segments: string[]): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, ...segments)
}

class Application {
  private readonly services = new Map<string, unknown>()

  set(name: string, service: unknown): void {
    this.services.set(name, service)
  }

  get<T = any>(name: string): T {
    const service = this.services.get(name)
    if (!service) throw new Error(`Service "${name}" is not initialized`)
    return service as T
  }

  getPath(key: string, ...segments: string[]): string {
    let base: string

    switch (key) {
      case 'app.root':
        base = app.getAppPath()
        break
      case 'app.userdata':
        base = app.getPath('userData')
        break
      case 'app.database.file':
        base = join(app.getPath('userData'), 'model-service.sqlite3')
        break
      case 'app.provider_logos':
        base = join(app.getPath('userData'), 'provider-logos')
        break
      case 'feature.provider_registry.data':
        // @nexus/provider-registry `pnpm generate` 的生成产物（resources/provider/）
        base = shippedResources('provider')
        break
      case 'resources.agent':
        // Nexus 自有 agent 资源（resources/agent/）：提示词规则、内置包清单
        base = shippedResources('agent')
        break
      default:
        throw new Error(`Unknown application path: ${key}`)
    }

    return segments.length > 0 ? join(base, ...segments) : base
  }
}

export const application = new Application()
