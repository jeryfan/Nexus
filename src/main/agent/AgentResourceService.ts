import type {
  DefaultPackageManager,
  DefaultResourceLoader,
  EventBus,
  LoadExtensionsResult,
  ResourceLoader,
  SettingsManager,
  Skill
} from '@earendil-works/pi-coding-agent'
import type {
  AgentPackageChangedReason,
  AgentPackageDto,
  AgentPackageUpdateDto,
  AgentSkillDto
} from '@shared/agent/types'
import { loggerService } from '@logger'
import { application } from '@application'
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'

import { broadcastIpcEvent } from './broadcast'
import { loadPi } from './PiLoader'
import { inferPackageName, isPinnedSource, packageIdentity, packageTypeOf } from './packageSources'

const logger = loggerService.withContext('AgentResourceService')

/**
 * Nexus 内置包清单，运行时从随包分发的 resources/agent/builtin-packages.json 读取
 *（钉版与 reconcile 语义见该目录 README）。
 */
interface BuiltinPackageDef {
  id: string
  source: string
}

type BuiltinId = string
type BuiltinStatus = 'ok' | 'installing' | 'failed'

/** `~/.nexus/agent/nexus-resources.json` —— Nexus 自有资源状态（不动 pi 的 settings.json 语义）。 */
interface ResourceStateFile {
  builtins?: Record<string, { enabled?: boolean }>
  /** filePath → 技能状态（默认启用，只记录被禁用的） */
  skills?: Record<string, { enabled?: boolean }>
}

/**
 * pi 生态资源的中枢：持有 SettingsManager / EventBus / DefaultPackageManager
 * 三个单例，按 cwd 缓存 DefaultResourceLoader，并负责内置包 reconcile。
 *
 * 信任模型：共享 SettingsManager 以 neutral cwd（agentDir 自身）+ projectTrusted:false
 * 创建 —— project scope 恒空且项目资源（.nexus/、.agents/skills）恒不加载，
 * 所有资源统一由应用层管理（M1 决策；后续工作区级资源再开）。
 */
export class AgentResourceService {
  private agentDir = ''
  private settingsManager: SettingsManager | undefined
  private eventBus: EventBus | undefined
  private packageManager: DefaultPackageManager | undefined
  /** cwd → loader（Promise 缓存，并发 acquire 去重；reload 失败时移除以便重试） */
  private readonly loaders = new Map<string, Promise<DefaultResourceLoader>>()
  private readonly builtinStatus = new Map<BuiltinId, { status: BuiltinStatus; error?: string }>()
  /** 内置包启用状态（默认启用）；持久化在 nexus-resources.json */
  private readonly builtinEnabled = new Map<BuiltinId, boolean>()
  /** 被禁用的技能 filePath 集合；持久化在 nexus-resources.json */
  private readonly skillDisabled = new Set<string>()
  private initialized = false
  private reconciling = false
  private builtinPackages: BuiltinPackageDef[] = []

  async initialize(): Promise<void> {
    const pi = await loadPi()
    this.agentDir = pi.getAgentDir()
    // pi-mcp-adapter 自解析 agentDir 时只认硬编码的 PI_CODING_AGENT_DIR，不认
    // Nexus rebrand 后的 NEXUS_CODING_AGENT_DIR；显式对齐（覆盖继承值），避免其
    // MCP 配置读写泄漏到 CLI pi 的 ~/.pi/agent。
    process.env.PI_CODING_AGENT_DIR = this.agentDir

    this.settingsManager = pi.SettingsManager.create(this.agentDir, this.agentDir, {
      projectTrusted: false
    })
    this.eventBus = pi.createEventBus()
    this.packageManager = new pi.DefaultPackageManager({
      cwd: this.agentDir,
      agentDir: this.agentDir,
      settingsManager: this.settingsManager
    })
    this.packageManager.setProgressCallback((event) => {
      broadcastIpcEvent('agent.package.progress', event)
    })

    this.loadState()
    this.builtinPackages = this.loadBuiltinPackages()
    this.initialized = true

    // reconcile 可能联网安装，异步执行不阻塞启动；完成后广播 changed 让 UI 刷新
    void this.reconcileBuiltins()
  }

  // ── Loader（会话资源入口） ──

  /** 按会话 cwd 获取已 reload 的 loader（按 cwd 缓存，保证各工作区 AGENTS.md 发现）。 */
  acquireLoader(cwd: string): Promise<ResourceLoader> {
    this.assertReady()
    let pending = this.loaders.get(cwd)
    if (!pending) {
      pending = this.createLoader(cwd)
      this.loaders.set(cwd, pending)
      pending.catch(() => {
        if (this.loaders.get(cwd) === pending) this.loaders.delete(cwd)
      })
    }
    return pending
  }

  getSettingsManager(): SettingsManager {
    this.assertReady()
    return this.settingsManager!
  }

  getEventBus(): EventBus {
    this.assertReady()
    return this.eventBus!
  }

  getAgentDir(): string {
    this.assertReady()
    return this.agentDir
  }

  /** 包集合/启用状态变化后调用：所有已建 loader 重新发现资源（新会话生效）。 */
  async reloadAll(): Promise<void> {
    const loaders = await Promise.all(
      [...this.loaders.values()].map((pending) => pending.catch(() => undefined))
    )
    await Promise.all(
      loaders
        .filter((loader): loader is DefaultResourceLoader => loader !== undefined)
        .map((loader) =>
          loader.reload().catch((error) => logger.error('loader reload failed', error))
        )
    )
  }

  // ── 包管理 ──

  async listPackages(): Promise<AgentPackageDto[]> {
    const pm = this.requirePackageManager()
    const dtos: AgentPackageDto[] = []
    const seen = new Set<string>()

    for (const pkg of pm.listConfiguredPackages()) {
      const identity = packageIdentity(pkg.source)
      seen.add(identity)
      const meta = pkg.installedPath ? await readPackageMeta(pkg.installedPath) : null
      const builtin = this.findBuiltin(identity)
      dtos.push({
        source: pkg.source,
        scope: pkg.scope,
        type: packageTypeOf(pkg.source),
        name: meta?.name ?? inferPackageName(pkg.source),
        version: meta?.version ?? null,
        description: meta?.description ?? null,
        installed: Boolean(pkg.installedPath),
        pinned: isPinnedSource(pkg.source),
        isBuiltin: Boolean(builtin),
        enabled: builtin ? this.isBuiltinEnabled(builtin.id) : true,
        builtinStatus: builtin ? (this.builtinStatus.get(builtin.id)?.status ?? 'ok') : null,
        builtinError: builtin ? (this.builtinStatus.get(builtin.id)?.error ?? null) : null
      })
    }

    // 内置包尚未登记进 settings（首次安装中/失败）时合成占位，保证 UI 始终可见
    for (const def of this.builtinPackages) {
      if (seen.has(packageIdentity(def.source))) continue
      dtos.push({
        source: def.source,
        scope: 'user',
        type: 'npm',
        name: def.id,
        version: null,
        description: null,
        installed: false,
        pinned: true,
        isBuiltin: true,
        enabled: this.isBuiltinEnabled(def.id),
        builtinStatus: this.builtinStatus.get(def.id)?.status ?? 'installing',
        builtinError: this.builtinStatus.get(def.id)?.error ?? null
      })
    }

    return dtos.sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin))
  }

  async checkUpdates(): Promise<AgentPackageUpdateDto[]> {
    const pm = this.requirePackageManager()
    const updates = await pm.checkForAvailableUpdates()
    return updates.map((u) => ({ source: u.source, displayName: u.displayName, type: u.type }))
  }

  async installPackage(source: string): Promise<void> {
    const pm = this.requirePackageManager()
    await pm.installAndPersist(source)
    await this.reloadAll()
    this.broadcastChanged('install')
  }

  async removePackage(source: string): Promise<void> {
    const pm = this.requirePackageManager()
    if (this.findBuiltin(packageIdentity(source))) {
      throw new Error('内置包不可删除（可禁用）')
    }
    await pm.removeAndPersist(source)
    await this.reloadAll()
    this.broadcastChanged('remove')
  }

  async updatePackage(source?: string): Promise<void> {
    const pm = this.requirePackageManager()
    // 内置包为钉版源，pi 的 update 天然跳过，无需额外拦截
    await pm.update(source)
    await this.reloadAll()
    this.broadcastChanged('update')
  }

  async setBuiltinEnabled(source: string, enabled: boolean): Promise<void> {
    const def = this.findBuiltin(packageIdentity(source))
    if (!def) {
      throw new Error('仅内置包支持启用/禁用（用户包请安装/删除）')
    }
    this.builtinEnabled.set(def.id, enabled)
    this.saveState()
    await this.reloadAll()
    this.broadcastChanged('toggle')
  }

  /** 供 UI 重试按钮触发 reconcile（例如首次安装失败后）。 */
  async retryBuiltinReconcile(): Promise<void> {
    this.assertReady()
    await this.reconcileBuiltins()
  }

  // ── 技能管理 ──

  /** 列出全局可见的技能（经 neutral loader：用户目录 + 包；项目技能恒不加载）。 */
  async listSkills(): Promise<AgentSkillDto[]> {
    const loader = await this.acquireLoader(this.agentDir)
    const { skills } = loader.getSkills()
    return skills
      .map((skill) => ({
        name: skill.name,
        description: skill.description,
        filePath: skill.filePath,
        sourceLabel: skillSourceLabel(skill),
        enabled: !this.skillDisabled.has(skill.filePath)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async setSkillEnabled(filePath: string, enabled: boolean): Promise<void> {
    this.assertReady()
    if (enabled) this.skillDisabled.delete(filePath)
    else this.skillDisabled.add(filePath)
    this.saveState()
    await this.reloadAll()
    broadcastIpcEvent('agent.skill.changed', { reason: 'toggle' })
  }

  // ── Internals ──

  private async createLoader(cwd: string): Promise<DefaultResourceLoader> {
    const pi = await loadPi()
    const loader = new pi.DefaultResourceLoader({
      cwd,
      agentDir: this.agentDir,
      settingsManager: this.settingsManager!,
      eventBus: this.eventBus!,
      // Nexus 有自己的 React UI，TUI 主题无意义
      noThemes: true,
      // 产品级提示词规则（resources/agent/prompts/*.md，随包分发）
      appendSystemPrompt: this.agentPromptPaths(),
      extensionsOverride: (base) => this.filterDisabledBuiltinExtensions(base),
      skillsOverride: (base) => {
        if (this.skillDisabled.size === 0) return base
        return {
          ...base,
          skills: base.skills.filter((skill) => !this.skillDisabled.has(skill.filePath))
        }
      }
    })
    await loader.reload()
    return loader
  }

  /** 过滤被禁用内置包的扩展（按安装路径前缀判定来源）。 */
  private filterDisabledBuiltinExtensions(base: LoadExtensionsResult): LoadExtensionsResult {
    const pm = this.packageManager
    if (!pm) return base
    const disabledRoots = this.builtinPackages
      .filter((def) => !this.isBuiltinEnabled(def.id))
      .map((def) => pm.getInstalledPath(def.source, 'user'))
      .filter((root): root is string => Boolean(root))
    if (disabledRoots.length === 0) return base
    return {
      ...base,
      extensions: base.extensions.filter(
        (ext) =>
          !disabledRoots.some(
            (root) => ext.resolvedPath === root || ext.resolvedPath.startsWith(root + sep)
          )
      )
    }
  }

  private async reconcileBuiltins(): Promise<void> {
    if (this.reconciling) return
    this.reconciling = true
    try {
      const pm = this.requirePackageManager()
      let changed = false
      for (const def of this.builtinPackages) {
        const configured = pm
          .listConfiguredPackages()
          .find((pkg) => packageIdentity(pkg.source) === packageIdentity(def.source))
        if (configured && configured.source === def.source && configured.installedPath) {
          this.builtinStatus.set(def.id, { status: 'ok' })
          continue
        }
        // 缺失、未安装或版本与钉版不一致 → installAndPersist 原位覆盖（含升级）
        this.builtinStatus.set(def.id, { status: 'installing' })
        this.broadcastChanged('reconcile')
        try {
          await pm.installAndPersist(def.source)
          this.builtinStatus.set(def.id, { status: 'ok' })
          changed = true
          logger.info(`内置包就绪: ${def.source}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.builtinStatus.set(def.id, { status: 'failed', error: message })
          logger.error(`内置包安装失败: ${def.source}`, error)
        }
      }
      if (changed) await this.reloadAll()
      this.broadcastChanged('reconcile')
    } finally {
      this.reconciling = false
    }
  }

  private isBuiltinEnabled(id: BuiltinId): boolean {
    return this.builtinEnabled.get(id) !== false
  }

  private stateFilePath(): string {
    return join(this.agentDir, 'nexus-resources.json')
  }

  private loadState(): void {
    let state: ResourceStateFile = {}
    try {
      state = JSON.parse(readFileSync(this.stateFilePath(), 'utf8')) as ResourceStateFile
    } catch {
      // 文件不存在或损坏：全部默认启用
    }
    for (const def of this.builtinPackages) {
      this.builtinEnabled.set(def.id, state.builtins?.[def.id]?.enabled !== false)
    }
    this.skillDisabled.clear()
    for (const [filePath, entry] of Object.entries(state.skills ?? {})) {
      if (entry?.enabled === false) this.skillDisabled.add(filePath)
    }
  }

  private saveState(): void {
    const state: ResourceStateFile = {
      builtins: Object.fromEntries(
        [...this.builtinEnabled.entries()].map(([id, enabled]) => [id, { enabled }])
      ),
      skills: Object.fromEntries(
        [...this.skillDisabled].map((filePath) => [filePath, { enabled: false }])
      )
    }
    const file = this.stateFilePath()
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2))
    renameSync(tmp, file)
  }

  private broadcastChanged(reason: AgentPackageChangedReason): void {
    broadcastIpcEvent('agent.package.changed', { reason })
  }

  private requirePackageManager(): DefaultPackageManager {
    this.assertReady()
    return this.packageManager!
  }

  private assertReady(): void {
    if (!this.initialized) {
      throw new Error('AgentResourceService not initialized')
    }
  }

  /** 读取随包分发的内置包清单；文件缺失/损坏时按无内置包处理（不阻断启动）。 */
  private loadBuiltinPackages(): BuiltinPackageDef[] {
    try {
      const raw = readFileSync(
        application.getPath('resources.agent', 'builtin-packages.json'),
        'utf8'
      )
      return JSON.parse(raw) as BuiltinPackageDef[]
    } catch (error) {
      logger.error('builtin-packages.json 加载失败，按无内置包处理', error)
      return []
    }
  }

  /** resources/agent/prompts 下全部 .md 规则文件（按文件名排序；新增文件无需改代码）。 */
  private agentPromptPaths(): string[] {
    try {
      const dir = application.getPath('resources.agent', 'prompts')
      return readdirSync(dir)
        .filter((file) => file.endsWith('.md'))
        .sort()
        .map((file) => join(dir, file))
    } catch (error) {
      logger.error('agent prompts 目录读取失败，跳过 appendSystemPrompt', error)
      return []
    }
  }

  private findBuiltin(identity: string): BuiltinPackageDef | undefined {
    return this.builtinPackages.find((def) => packageIdentity(def.source) === identity)
  }
}

/** 技能来源标签：包随插件分发；项目技能当前恒不加载（trust=never）；其余为全局个人。 */
function skillSourceLabel(skill: Skill): string {
  if (skill.sourceInfo.origin === 'package') return '插件'
  if (skill.sourceInfo.scope === 'project') return '项目'
  return '个人'
}

/** 读取已安装包的 package.json 元数据（展示用；失败静默回退 source 推断）。 */
async function readPackageMeta(
  installedPath: string
): Promise<{ name: string; version: string; description: string | null } | null> {
  try {
    const raw = await readFile(join(installedPath, 'package.json'), 'utf8')
    const json = JSON.parse(raw) as { name?: unknown; version?: unknown; description?: unknown }
    if (typeof json.name !== 'string') return null
    return {
      name: json.name,
      version: typeof json.version === 'string' ? json.version : '',
      description: typeof json.description === 'string' ? json.description : null
    }
  } catch {
    return null
  }
}
