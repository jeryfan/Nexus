import { app } from 'electron'
import { join } from 'node:path'

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
        base = app.isPackaged
          ? join(process.resourcesPath, 'provider-registry')
          : join(app.getAppPath(), 'packages/provider-registry/data')
        break
      default:
        throw new Error(`Unknown application path: ${key}`)
    }

    return segments.length > 0 ? join(base, ...segments) : base
  }
}

export const application = new Application()
