# Orca 浏览器功能迁移实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Orca 的内置浏览器（浏览器本体 + Agent 控制栈）原样完整迁移进 Nexus，实现面板内浏览器标签页与对话驱动浏览器。

**Architecture:** 整块平移 + 最小适配层。orca 代码原样复制（仅机械改写 import 路径），接缝处写薄适配：worktreeId→sessionId 映射、IPC 独立注册（不走 IpcRouter）、translate shim、UI 原语随代码迁入、runtime 宿主接口按 Nexus 窗口/会话模型实现。不迁移远程 relay/offscreen/screencast 远程 driver。

**Tech Stack:** Electron 39（webview + webContents.debugger）、React 19、zustand 5、Tailwind v4、agent-browser 0.27（Rust 二进制）、ws、zod 4、vitest 4。

**设计文档:** `docs/superpowers/specs/2026-08-02-orca-browser-migration-design.md`（先读）

**重要：用户明确要求不做任何 git 提交。本计划不含 commit 步骤，禁止执行 `git add/commit`。**

---

## 迁移总则（每个 Task 都适用）

### 路径与常量

- `ORCA=/Users/fanjunjie/Documents/repositories/github/orca`（源）
- `NEXUS=/Users/fanjunjie/Documents/repositories/github/Nexus`（目标，即工作目录）
- orca 是 MIT License（Copyright (c) 2026 Lovecast Inc.）：迁移的每个目录放一份 `NOTICE` 文件，内容：
  ```
  This directory contains code ported from Orca (https://github.com/stablyai/orca),
  Copyright (c) 2026 Lovecast Inc., licensed under the MIT License.
  ```

### 复制规则

1. **原样复制**：除下列机械改写外，不得改动 orca 代码逻辑。发现 Electron 43→39 行为差异时，先记录再针对性修补（属 bug 修复，需在文件头注释说明）。
2. **shared 文件统一放 `src/shared/browser/`**（Nexus `src/shared/` 已有同名目录 `types/`，避免冲突）。文件名保持 orca 原名。
3. **import 机械改写规则**（用 perl 批量执行，改完必须 typecheck 验证）：
   - `src/main/**` 与 `src/cli/**` 内：`'../shared/` → `'../shared/browser/`、`'../../shared/` → `'../../shared/browser/`、`'../../../shared/` → `'../../../shared/browser/`
   - `src/renderer/src/features/browser/**` 内：`'../../../../shared/X'` → `'@shared/browser/X'`（`@shared` alias 在 electron.vite.config.ts 与两套 tsconfig 均已存在）
   - 渲染层 `'@/X'` → 见 Task 8/10 的映射表
4. **大型 shared 文件**（types/constants/runtime-types/keybindings/workspace-session-schema 等）先整文件复制；仅当拖入未迁移依赖导致编译失败时，做**最小裁剪**（删除引用未迁移模块的导出），并在文件头注释记录裁剪点。禁止"顺手清理"。
5. **裁剪远程/relay**：渲染层 `@/runtime/*`、`@/lib/worktree-runtime-owner`、`@/lib/connection-context`、`@/lib/pane-manager/browser-mobile-driver-state`、`BrowserMobileDriverOverlay.tsx`、`remote-browser-*.ts` 不复制；引用它们的代码删除对应分支（保留本地 webview 路径）。主进程 `offscreen-browser-backend.ts` 不复制；`browser-backend.ts`（接口）保留，宿主实现返回 `null`。
6. **命名替换**：`persist:orca-browser` → `persist:nexus-browser`；`orca-runtime.json` → `nexus-runtime.json`；CLI 命令 `orca` → `nexus`；`ORCA_USER_DATA_PATH` → `NEXUS_USER_DATA_PATH`；`ORCA_CLI_CWD` → `NEXUS_CLI_CWD`。仅限这几个标识符，其他 `ORCA_*` 常量名保持原样。
7. **每个 Task 的完成标准**：`pnpm typecheck` 通过 + 该任务相关 vitest 通过 + `pnpm lint` 不新增错误。

### 通用验证命令

```bash
pnpm typecheck                      # node + web 两套
pnpm vitest run src/main/browser    # 主进程 browser 测试（Task 1 后可用）
pnpm vitest run src/shared/browser  # shared 测试
pnpm lint
pnpm dev                            # 手工验证
```

### 关键背景（执行者必读）

- orca 浏览器嵌入方式：渲染层 `<webview>` 标签，尺寸纯 CSS（无 setBounds）；主进程只管策略与 CDP 控制。
- Nexus 挂载点：`src/renderer/src/features/agent/ProjectPanel.tsx` 的 `TabContent`（:224），`browser` 类型目前是占位。
- Nexus 会话 id：`useAgentStore((s) => s.activeSessionId)`（`src/renderer/src/features/agent/agentStore.ts:32`）。
- Nexus 主窗口创建：`src/main/index.ts` 的 `createWindow()`（:27）与 `startApp()`（:74）。
- Nexus 依赖现状：已有 `radix-ui`（统一包 ^1.6.7）、`class-variance-authority`、`clsx`、`cmdk`、`tailwind-merge`、`lucide-react`、`zustand 5`、`zod ^4.1.5`（在 devDependencies）。
- Nexus 根目录无 vitest；tsconfig.node/web 均 exclude `*.test.ts`（测试不参与 typecheck，正常）。

---

### Task 1: 依赖、构建与测试基础设施

**Files:**

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`（如 agent-browser 有构建脚本）
- Create: `vitest.config.ts`
- Modify: `electron.vite.config.ts`

- [x] **Step 1: 安装运行时依赖**

```bash
cd /Users/fanjunjie/Documents/repositories/github/Nexus
pnpm add agent-browser@~0.27.0 ws@^8.21.0
pnpm add -D sonner vitest@^4.1.5 @types/ws@^8.18.1
```

`agent-browser` 与 `ws` 进 `dependencies`（主进程运行时 + CLI 运行时，electron-vite 按 `pkg.dependencies` 自动 external 并随包分发 node_modules）。`sonner`/`vitest`/`@types/ws` 进 `devDependencies`（sonner 是渲染层 toast，经 Vite 打包）。

- [x] **Step 2: 把 zod 移到 dependencies**

编辑 `package.json`：devDependencies 中删除 `"zod": "^4.1.5"`，dependencies 中增加 `"zod": "^4.1.5"`。原因：CLI 是 tsc 编译的非 bundle 产物，运行时需要 node_modules 里的 zod；主进程 external 后同样需要分发。

```bash
pnpm install
```

- [x] **Step 3: 验证 agent-browser 二进制与构建脚本**

```bash
ls node_modules/agent-browser/bin/
# 期望看到 agent-browser-darwin-arm64（及 darwin-x64 / win32-x64.exe / linux-*）
cat node_modules/agent-browser/package.json | python3 -c "import json,sys; p=json.load(sys.stdin); print(p.get('scripts', {}))"
```

若 `scripts` 含 `postinstall`/`install`，在 `pnpm-workspace.yaml` 的 `allowBuilds` 中按现有格式允许 `agent-browser`，再 `pnpm rebuild agent-browser`。若没有构建脚本则跳过。

- [x] **Step 4: 创建根 vitest 配置**

`vitest.config.ts`（对齐 orca `config/vitest.config.ts`，node 环境、无 setupFiles）：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
    pool: 'forks'
  }
})
```

package.json scripts 增加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [x] **Step 5: electron.vite 增加 guest preload 入口**

修改 `electron.vite.config.ts` 的 preload 段（browser-window-close 是注入每个 webview guest 的独立 preload bundle）：

```ts
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          'browser-window-close': resolve('src/preload/browser-window-close.ts')
        }
      }
    },
    resolve: { alias: { '@shared': shared } }
  },
```

（`src/preload/browser-window-close.ts` 在 Task 7 创建，此处先配好入口。）

- [x] **Step 6: 验证**

```bash
pnpm install && pnpm vitest run --passWithNoTests && pnpm typecheck
```

期望：install 成功；vitest 无测试通过；typecheck 无新增错误（baseline）。

---

### Task 2: shared/browser 域迁移

**Files:**

- Create: `src/shared/browser/`（约 28 个文件 + NOTICE）

- [x] **Step 1: 复制纯 browser 模块（无裁剪）**

```bash
cd /Users/fanjunjie/Documents/repositories/github/Nexus
mkdir -p src/shared/browser
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
for f in browser-url browser-grab-types browser-guest-events browser-guest-web-preferences \
         browser-window-close-policy browser-certificate-errors browser-annotation-viewport-bridge \
         browser-page-zoom browser-find-source browser-viewport-presets \
         workspace-session-browser-history browser-cookie-import-sources browser-screencast-protocol \
         orca-profiles modifier-double-tap-detector window-shortcut-policy \
         clipboard-text event-loop-yield secure-file runtime-bootstrap; do
  cp "$ORCA/src/shared/$f.ts" src/shared/browser/
  [ -f "$ORCA/src/shared/$f.test.ts" ] && cp "$ORCA/src/shared/$f.test.ts" src/shared/browser/
done
printf 'This directory contains code ported from Orca (https://github.com/stablyai/orca),\nCopyright (c) 2026 Lovecast Inc., licensed under the MIT License.\n' > src/shared/browser/NOTICE
```

- [x] **Step 2: 整文件复制大型 shared 模块**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
for f in types constants runtime-types keybindings workspace-session-schema protocol-version execution-host; do
  cp "$ORCA/src/shared/$f.ts" src/shared/browser/
  [ -f "$ORCA/src/shared/$f.test.ts" ] && cp "$ORCA/src/shared/$f.test.ts" src/shared/browser/
done
```

- [x] **Step 3: 命名替换 + 检查同目录交叉 import**

```bash
cd src/shared/browser
perl -pi -e "s/persist:orca-browser/persist:nexus-browser/g; s/orca-runtime\\.json/nexus-runtime.json/g" *.ts
```

这些文件互相用 `'./x'` 相对引用，同目录复制后无需改写。若有引用未复制模块的（`from './其他'`），回到 Step 1/2 补复制；仅当该模块属于不迁移的远程/relay 域时，做最小裁剪并在文件头注释记录。

- [x] **Step 4: typecheck + 测试驱动收敛**

```bash
pnpm typecheck 2>&1 | grep 'src/shared/browser' | head -50
pnpm vitest run src/shared/browser
```

对编译错误逐个处理：缺模块 → 补复制；引用未迁移域 → 最小裁剪（文件头注释 `// TRIMMED from orca: <说明>`）。循环至 typecheck 干净、测试通过。

---

### Task 3: 主进程 browser 域迁移 + 启动接线

**Files:**

- Create: `src/main/browser/`（约 32 文件 + fs-utils.ts + NOTICE）
- Modify: `src/main/index.ts`

- [x] **Step 1: 复制 src/main/browser（排除 offscreen 后端）**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/main/browser
for f in "$ORCA"/src/main/browser/*.ts; do
  base=$(basename "$f")
  case "$base" in
    offscreen-browser-backend.ts|offscreen-browser-backend.test.ts) ;;  # 不迁移（无 headless 场景）
    *) cp "$f" src/main/browser/ ;;
  esac
done
cp "$ORCA/src/main/codex-accounts/fs-utils.ts" src/main/browser/fs-utils.ts
printf 'This directory contains code ported from Orca (https://github.com/stablyai/orca),\nCopyright (c) 2026 Lovecast Inc., licensed under the MIT License.\n' > src/main/browser/NOTICE
```

- [x] **Step 2: import 机械改写 + 命名替换**

```bash
cd src/main/browser
perl -pi -e "s|'\\.\\./\\.\\./shared/|'../../shared/browser/|g; s|'\\.\\./codex-accounts/fs-utils'|'./fs-utils'|g" *.ts
perl -pi -e 's|"\.\./\.\./shared/|"../../shared/browser/|g' *.ts
perl -pi -e "s/persist:orca-browser/persist:nexus-browser/g; s/orca-runtime\\.json/nexus-runtime.json/g" *.ts
```

- [x] **Step 3: typecheck 驱动收敛**

```bash
pnpm typecheck 2>&1 | grep 'src/main/browser' | head -50
```

预期剩余的少量错误：①个别 shared 模块未复制 → 回 Task 2 补；②`fs-utils.ts` 若 import 了 codex-accounts 域其他文件，只保留 `copyFileWithWindowsRetry` 及其直接依赖，其余裁掉（文件头注释）。循环至干净。

- [x] **Step 4: 跑迁移来的测试**

```bash
pnpm vitest run src/main/browser
```

期望全部通过。若有 Electron 39 特有失败（debugger/session 行为差异），记录现象并针对性修补（文件头注释 `// Electron 39 fix: <说明>`），禁止跳过测试。

- [x] **Step 5: 主窗口接线（src/main/index.ts）**

① `createWindow()` 的 webPreferences 增加 `webviewTag: true`；并让 `createWindow` 返回 `mainWindow`：

```ts
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
```

② 文件顶部增加 import：

```ts
import { browserCertificateTrustController, browserManager } from '@main/browser/browser-manager'
import { browserSessionRegistry } from '@main/browser/browser-session-registry'
import { initializeBrowserSessionsForApp } from '@main/browser/browser-session-startup'
import { registerBrowserHandlers, setTrustedBrowserRendererWebContentsId } from '@main/ipc/browser'
import { normalizeBrowserNavigationUrl } from '@shared/browser/browser-url'
import { ORCA_BROWSER_GUEST_WEB_PREFERENCES } from '@shared/browser/browser-guest-web-preferences'
import { BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD } from '@shared/browser/browser-window-close-policy'
```

（`@main/ipc/browser` 由 Task 5 Step 1 创建；本步先写 will-attach 部分时可暂缓该 import，Task 5 补齐。）

③ `createWindow()` 内、`setWindowOpenHandler` 之后，加入 orca `createMainWindow.ts:446-490` 的 webview 策略（逐字复制自 orca，仅路径/常量来源不同——以下为对齐后的完整代码）：

```ts
// —— 以下为 orca createMainWindow.ts:446-490 迁移的内置浏览器 guest 策略（fail-closed）——
const browserWindowClosePreload = join(__dirname, '../preload/browser-window-close.js')
mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
  const src = typeof params.src === 'string' ? params.src : ''
  const normalizedSrc = normalizeBrowserNavigationUrl(src)
  const partition = typeof webPreferences.partition === 'string' ? webPreferences.partition : ''

  // fail closed：src 无法规范化或 partition 不在 registry 白名单即拒绝
  if (!normalizedSrc || !browserSessionRegistry.isAllowedPartition(partition)) {
    event.preventDefault()
    return
  }

  const allowWindowClose = [params.preload, webPreferences.preload].some(
    (preload) => preload === BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD
  )
  delete params.preload
  if (allowWindowClose) {
    delete webPreferences.preload
  } else {
    webPreferences.preload = browserWindowClosePreload
  }
  delete (webPreferences as Record<string, unknown>).preloadURL
  webPreferences.nodeIntegration = false
  webPreferences.nodeIntegrationInSubFrames = false
  webPreferences.enableBlinkFeatures = ''
  webPreferences.disableBlinkFeatures = ''
  webPreferences.webSecurity = true
  webPreferences.allowRunningInsecureContent = false
  webPreferences.contextIsolation = true
  webPreferences.sandbox = true
  Object.assign(webPreferences, ORCA_BROWSER_GUEST_WEB_PREFERENCES)
  webPreferences.partition = partition
})

mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
  // popup/导航策略必须此时挂，等渲染层注册会漏 target=_blank
  browserManager.attachGuestPolicies(guest)
})
```

注意：orca 原代码还比对了 `browserWindowCloseAllowedPreloadPath`（`fileURLToPath(BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD)`），该常量在 orca 是 `file:///__orca_window_close_allowed__` 标记而非真实文件——逐字复制 orca 的判断逻辑即可（`shared/browser/browser-window-close-policy.ts` 中有完整定义，Task 2 已迁移）。

④ `startApp()` 中，`new DbService()` 之后、`createWindow()` 之前插入：

```ts
// 内置浏览器：session 初始化（cookie 重放必须在首次 session.fromPartition 之前）
initializeBrowserSessionsForApp()
browserManager.setSettingsResolver(() => ({ keybindings: undefined }))

app.on(
  'certificate-error',
  (event, webContents, url, error, certificate, callback, isMainFrame) => {
    browserCertificateTrustController.handleCertificateError({
      event,
      webContents,
      url,
      error,
      certificate,
      callback,
      isMainFrame
    })
  }
)
```

⑤ `createWindow()` 调用处改为：

```ts
const mainWindow = createWindow()
setTrustedBrowserRendererWebContentsId(mainWindow.webContents.id)
```

（`createWindow` 需 `return mainWindow`。）

- [x] **Step 6: 验证**

```bash
pnpm typecheck && pnpm vitest run src/main/browser src/shared/browser && pnpm lint
```

（`@main/ipc/browser` 尚未创建时 typecheck 会报缺失——将 registerBrowserHandlers 的 import 与调用放到 Task 5 Step 1 一并落地，本步先保证 browser 域自身干净。）

---

### Task 4: 浏览器会话持久化（主进程 Store + session IPC）

**背景**：orca 的浏览器标签/历史由渲染层 zustand 经 `session:get/patch/set/flush` IPC 持久化到 `userData/orca-data.json`。orca 的 `Store`（persistence.ts，6000+ 行）整体不可迁移，按设计在 Nexus 侧实现**仅含浏览器字段**的等价物，通道名与语义保持 orca 原样（渲染层迁移代码零改动）。

**Files:**

- Create: `src/main/browser/browser-session-store.ts`
- Create: `src/main/browser/browser-session-store.test.ts`
- Create: `src/main/ipc/browser-session.ts`
- Modify: `src/main/index.ts`

- [x] **Step 1: 实现 browser-session-store.ts**

持久化文件 `userData/nexus-browser-session.json`，原子写（tmp+rename）+ `.bak.0/.bak.1` 滚动备份，加载时经 `workspaceSessionStateSchema`（Task 2 已迁移）safeParse，失败回退空态并尝试备份恢复。完整实现：

```ts
// Glue for Nexus: orca persistence.ts 的浏览器字段等价物（仅 workspace session 的 browser 切片）。
// 通道语义对齐 orca ipc/session.ts：get / set / patch（浅合并顶层字段）/ flush。
import { app } from 'electron'
import { existsSync, readFileSync, renameSync, copyFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { workspaceSessionStateSchema } from '@shared/browser/workspace-session-schema'
import type { z } from 'zod'

type WorkspaceSessionState = z.infer<typeof workspaceSessionStateSchema>

const FLUSH_DEBOUNCE_MS = 150
const BACKUP_COUNT = 2

export class BrowserSessionStore {
  private readonly dataFile: string
  private state: WorkspaceSessionState = {}
  private flushTimer: NodeJS.Timeout | null = null

  constructor(dataFile?: string) {
    this.dataFile = dataFile ?? join(app.getPath('userData'), 'nexus-browser-session.json')
    this.state = this.load()
  }

  private load(): WorkspaceSessionState {
    const raw = this.readJson(this.dataFile)
    const parsed = raw !== null ? workspaceSessionStateSchema.safeParse(raw) : null
    if (parsed?.success) return parsed.data
    for (let i = 0; i < BACKUP_COUNT; i++) {
      const backup = this.readJson(`${this.dataFile}.bak.${i}`)
      const reparsed = backup !== null ? workspaceSessionStateSchema.safeParse(backup) : null
      if (reparsed?.success) return reparsed.data
    }
    return {}
  }

  private readJson(file: string): unknown | null {
    try {
      if (!existsSync(file)) return null
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  getWorkspaceSession(): WorkspaceSessionState {
    return this.state
  }

  setWorkspaceSession(state: WorkspaceSessionState): void {
    this.state = state
    this.scheduleFlush()
  }

  /** 浅合并顶层字段（渲染层 session-write-subscriber 只发变化切片） */
  patchWorkspaceSession(patch: Partial<WorkspaceSessionState>): void {
    this.state = { ...this.state, ...patch }
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.flushOrThrow(), FLUSH_DEBOUNCE_MS)
  }

  flushOrThrow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    mkdirSync(join(this.dataFile, '..'), { recursive: true })
    if (existsSync(this.dataFile)) {
      for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
        const older = `${this.dataFile}.bak.${i - 1}`
        if (existsSync(older)) copyFileSync(older, `${this.dataFile}.bak.${i}`)
      }
      copyFileSync(this.dataFile, `${this.dataFile}.bak.0`)
    }
    const tmp = `${this.dataFile}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state), 'utf8')
    renameSync(tmp, this.dataFile)
  }
}

export const browserSessionStore = new BrowserSessionStore()
```

- [x] **Step 2: 写单元测试 browser-session-store.test.ts**

```ts
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, afterAll } from 'vitest'

// 避免 electron app 依赖：直接传 dataFile
import { BrowserSessionStore } from './browser-session-store'

const dir = mkdtempSync(join(tmpdir(), 'nexus-browser-session-'))
const file = join(dir, 'session.json')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('BrowserSessionStore', () => {
  it('patch 浅合并并落盘，get 读回', () => {
    const store = new BrowserSessionStore(file)
    store.patchWorkspaceSession({ browserUrlHistory: [] })
    store.patchWorkspaceSession({
      browserTabsByWorktree: {
        'session-1': [
          {
            id: 'tab-1',
            worktreeId: 'session-1',
            url: 'https://example.com',
            title: 'Example',
            loading: false,
            faviconUrl: null,
            canGoBack: false,
            canGoForward: false,
            loadError: null,
            createdAt: 1
          }
        ]
      }
    })
    store.flushOrThrow()
    expect(existsSync(file)).toBe(true)
    const reloaded = new BrowserSessionStore(file)
    expect(reloaded.getWorkspaceSession().browserTabsByWorktree?.['session-1']?.[0]?.url).toBe(
      'https://example.com'
    )
    expect(reloaded.getWorkspaceSession().browserUrlHistory).toEqual([])
  })

  it('损坏主文件时从备份恢复', () => {
    const store = new BrowserSessionStore(file)
    store.flushOrThrow()
    store.patchWorkspaceSession({ activeBrowserTabIdByWorktree: { 'session-1': 'tab-1' } })
    store.flushOrThrow()
    const { writeFileSync } = require('fs') as typeof import('fs')
    writeFileSync(file, 'not json', 'utf8')
    const recovered = new BrowserSessionStore(file)
    expect(recovered.getWorkspaceSession().browserTabsByWorktree?.['session-1']?.[0]?.id).toBe(
      'tab-1'
    )
  })
})
```

注意：schema 字段名以 Task 2 迁移的 `workspace-session-schema.ts` 实际导出为准；若 `workspaceSessionStateSchema` 导出名不同，按实际调整 import。

```bash
pnpm vitest run src/main/browser/browser-session-store
```

- [x] **Step 3: 创建 src/main/ipc/browser-session.ts（通道注册）**

```ts
// orca src/main/ipc/session.ts 的浏览器字段等价物（通道名保持一致）
import { ipcMain } from 'electron'
import { browserSessionStore } from '@main/browser/browser-session-store'

let registered = false

export function registerBrowserSessionHandlers(): void {
  if (registered) return
  registered = true
  ipcMain.handle('session:get', () => browserSessionStore.getWorkspaceSession())
  ipcMain.handle('session:set', (_event, state) => {
    browserSessionStore.setWorkspaceSession(state)
  })
  ipcMain.handle('session:patch', (_event, patch) => {
    browserSessionStore.patchWorkspaceSession(patch)
  })
  ipcMain.handle('session:flush', () => browserSessionStore.flushOrThrow())
  // 渲染层 beforeunload 用 sendSync 保证落盘（orca 同款）
  ipcMain.on('session:set-sync', (event, state) => {
    browserSessionStore.setWorkspaceSession(state)
    browserSessionStore.flushOrThrow()
    event.returnValue = true
  })
}
```

- [x] **Step 4: startApp 注册 + quit flush**

`src/main/index.ts`：import `registerBrowserSessionHandlers`，在 `initializeBrowserSessionsForApp()` 之后调用 `registerBrowserSessionHandlers()`；`will-quit` 中增加 `browserSessionStore.flushOrThrow()`（需 import）。

- [x] **Step 5: 验证**

```bash
pnpm typecheck && pnpm vitest run src/main/browser
```

---

### Task 5: browser IPC + runtime RPC + RuntimeBrowserCommands

**Files:**

- Create: `src/main/ipc/browser.ts`（自 orca 逐字迁移）
- Create: `src/main/runtime/`（runtime-rpc.ts、runtime-metadata.ts、runtime-metadata-ownership-watch.ts、orca-runtime-browser.ts、NexusRuntimeService.ts、rpc/ 子目录）
- Modify: `src/main/index.ts`

- [x] **Step 1: 迁移 src/main/ipc/browser.ts**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
cp "$ORCA/src/main/ipc/browser.ts" src/main/ipc/browser.ts
cd src/main/ipc
perl -pi -e "s|'\\.\\./\\.\\./shared/|'../../shared/browser/|g" browser.ts
```

typecheck 收敛（应只缺 shared 补复制）。该文件导出 `registerBrowserHandlers / setTrustedBrowserRendererWebContentsId / setAgentBrowserBridgeRef / waitForTabRegistration / waitForWorktreeTabRegistration / waitForAnyTabRegistration`（20 条 `browser:*` 通道）。

在 `startApp()` 中 `registerBrowserSessionHandlers()` 之后调用 `registerBrowserHandlers()`；`createWindow()` 后调用 `setTrustedBrowserRendererWebContentsId(mainWindow.webContents.id)`（Task 3 Step 5⑤ 已写）。

- [x] **Step 2: 复制 runtime 文件**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/main/runtime/rpc/methods
cp "$ORCA/src/main/runtime/runtime-rpc.ts" src/main/runtime/
cp "$ORCA/src/main/runtime/runtime-metadata.ts" src/main/runtime/
cp "$ORCA/src/main/runtime/runtime-metadata-ownership-watch.ts" src/main/runtime/
cp "$ORCA/src/main/runtime/orca-runtime-browser.ts" src/main/runtime/
cp "$ORCA/src/main/runtime/rpc/core.ts" src/main/runtime/rpc/
cp "$ORCA/src/main/runtime/rpc/dispatcher.ts" src/main/runtime/rpc/
cp "$ORCA/src/main/runtime/rpc/unix-socket-transport.ts" src/main/runtime/rpc/
cp "$ORCA/src/main/runtime/rpc/schemas.ts" src/main/runtime/rpc/ 2>/dev/null || true
cp "$ORCA/src/main/runtime/rpc/methods/browser-core.ts" src/main/runtime/rpc/methods/
cp "$ORCA/src/main/runtime/rpc/methods/browser-extras.ts" src/main/runtime/rpc/methods/
cp "$ORCA/src/main/runtime/rpc/methods/browser-text-rpc-methods.ts" src/main/runtime/rpc/methods/
cp "$ORCA/src/main/runtime/rpc/methods/browser-screencast.ts" src/main/runtime/rpc/methods/
cp "$ORCA/src/main/runtime/rpc/methods/browser-schemas.ts" src/main/runtime/rpc/methods/
printf 'This directory contains code ported from Orca (https://github.com/stablyai/orca),\nCopyright (c) 2026 Lovecast Inc., licensed under the MIT License.\n' > src/main/runtime/NOTICE
```

改写与收敛：

```bash
cd src/main/runtime
# 按文件深度分别改写 shared import（runtime/ 深 2、rpc/ 深 3、rpc/methods/ 深 4）
perl -pi -e "s|'\\.\\./\\.\\./shared/|'../../shared/browser/|g" *.ts
perl -pi -e "s|'\\.\\./\\.\\./\\.\\./shared/|'../../../shared/browser/|g" rpc/*.ts
perl -pi -e "s|'\\.\\./\\.\\./\\.\\./\\.\\./shared/|'../../../../shared/browser/|g" rpc/methods/*.ts
# 改完后逐个文件 grep 确认没有残留指向 src/shared/ 旧位置的 import
grep -rn "from '.*shared/" *.ts rpc/*.ts rpc/methods/*.ts | grep -v 'shared/browser/' || true
perl -pi -e "s/persist:orca-browser/persist:nexus-browser/g; s/orca-runtime\\.json/nexus-runtime.json/g" *.ts rpc/*.ts rpc/methods/*.ts
```

新建 `src/main/runtime/rpc/methods/index.ts`（替代 orca 的全量方法汇总，只保留 browser 组）：

```ts
// Trimmed from orca rpc/methods/index.ts: 仅保留 browser 方法组
import type { RpcMethod } from '../core'
import { BROWSER_CORE_METHODS } from './browser-core'
import { BROWSER_EXTRA_METHODS } from './browser-extras'
import { BROWSER_SCREENCAST_METHODS } from './browser-screencast'
import { BROWSER_TEXT_METHODS } from './browser-text-rpc-methods'

export const ALL_RPC_METHODS: RpcMethod[] = [
  ...BROWSER_CORE_METHODS,
  ...BROWSER_EXTRA_METHODS,
  ...BROWSER_TEXT_METHODS,
  ...BROWSER_SCREENCAST_METHODS
]
```

（`RpcMethod` 的实际导出名以 `rpc/core.ts` 为准；`defineStreamingMethod` 若在单独文件，一并复制。）

typecheck 驱动收敛：`runtime-rpc.ts` 若 import 了 ws 远程通道（websocket-transport/tweetnacl/webClientRoot 等）相关模块，最小裁剪为仅 unix/named-pipe 通道（构造参数保留 `enableWebSocket` 但 Nexus 恒传 `false`），文件头注释记录裁剪点。`orca-runtime-browser.ts` 若 import 未迁移模块（如 runtime 内部类型），改为从 `./nexus-runtime-types` 或本地类型定义补齐，逐处注释。

- [x] **Step 3: 实现 NexusRuntimeService.ts（宿主适配层）**

orca 的 `RuntimeBrowserCommands`（orca-runtime-browser.ts）通过宿主接口解耦（构造参数 6 个回调），这里提供 Nexus 实现：

```ts
// Glue for Nexus: orca OrcaRuntimeService 的浏览器方法等价物（宿主接口按 Nexus 窗口/会话模型实现）
import type { BrowserWindow } from 'electron'
import type { AgentBrowserBridge } from '@main/browser/agent-browser-bridge'
import { RuntimeBrowserCommands } from './orca-runtime-browser'

export class NexusRuntimeService {
  private agentBrowserBridge: AgentBrowserBridge | null = null
  private mainWindow: BrowserWindow | null = null
  private activeSessionId: string | null = null
  readonly browserCommands: RuntimeBrowserCommands

  constructor() {
    this.browserCommands = new RuntimeBrowserCommands({
      getAgentBrowserBridge: () => this.agentBrowserBridge,
      // orca 的 worktree selector 在 Nexus 映射为 session id；CLI --worktree 直接传 session id，
      // 未传时回落到当前活跃会话
      resolveWorktreeSelector: async (selector: string) => {
        const id = selector.trim() || this.activeSessionId
        if (!id) throw new Error('没有活跃的会话，无法定位浏览器标签页')
        return { id }
      },
      getAuthoritativeWindow: () => {
        if (!this.mainWindow) throw new Error('主窗口不可用')
        return this.mainWindow
      },
      getAvailableAuthoritativeWindow: () => this.mainWindow,
      getOffscreenBrowserBackend: () => null
    })
  }

  setAgentBrowserBridge(bridge: AgentBrowserBridge | null): void {
    this.agentBrowserBridge = bridge
  }

  getAgentBrowserBridge(): AgentBrowserBridge | null {
    return this.agentBrowserBridge
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  setActiveSessionId(id: string | null): void {
    this.activeSessionId = id
  }
}
```

宿主接口签名以 `orca-runtime-browser.ts` 中实际定义为准逐项对齐（若还有第 6 个回调 `markHeadlessBrowserSessionTabActive`，提供空实现）。RPC 方法 handler 形如 `runtime.browserSnapshot(params)`——在 `NexusRuntimeService` 上为每个 browser 方法加一行委托，或直接让 `OrcaRuntimeRpcServer` 的 dispatcher ctx 暴露 `{ runtime: { browserXxx: ... } }`：最简做法是构造 RPC server 时把 `runtime` 参数传一个代理对象（`new Proxy`-free：逐方法 bind 到 browserCommands，方法清单照抄 orca `OrcaRuntimeService` 的 browser 绑定段 :32910 起）。

- [x] **Step 4: startApp 拉起 RPC server + bridge + 活跃会话跟踪**

> **审查遗留（必须先做）**：`setTrustedBrowserRendererWebContentsId` 要放在 `createWindow()` **内部**调用（而非仅初始调用处），否则 macOS activate 重建窗口的 webContents.id 不会注册，`isTrustedBrowserRenderer` fail-closed 会拒绝重建窗口的全部 `browser:*` IPC。同时删除 Task 3 留下的 `void mainWindow` 占位行，activate 分支的 `createWindow()` 调用保持不变即可。

`src/main/index.ts`：

```ts
import { AgentBrowserBridge } from '@main/browser/agent-browser-bridge'
import { NexusRuntimeService } from '@main/runtime/NexusRuntimeService'
import { OrcaRuntimeRpcServer } from '@main/runtime/runtime-rpc'
```

`startApp()` 中：

```ts
// 内置浏览器：runtime RPC（CLI 控制面）+ agent 控制桥
const nexusRuntime = new NexusRuntimeService()
const agentBrowserBridge = new AgentBrowserBridge(browserManager, {
  onTabsChanged: () => {}
})
nexusRuntime.setAgentBrowserBridge(agentBrowserBridge)
setAgentBrowserBridgeRef(agentBrowserBridge) // from '@main/ipc/browser'
const runtimeRpc = new OrcaRuntimeRpcServer({
  runtime: nexusRuntime,
  userDataPath: app.getPath('userData'),
  enableWebSocket: false
})
void runtimeRpc.start()
```

`createWindow()` 后：`nexusRuntime.setMainWindow(mainWindow)`。`will-quit` 中：`agentBrowserBridge.destroyAllSessions()`、`browserManager.setBrowserGuestStateChangedListener(null)`（若该 API 存在）。

活跃会话跟踪：渲染层在会话切换时发 `browser:active-session-changed`（Task 10 渲染层落地），主进程在 `registerBrowserHandlers()` 之后加：

```ts
ipcMain.on('browser:active-session-changed', (_event, sessionId: string | null) => {
  nexusRuntime.setActiveSessionId(sessionId)
})
```

- [x] **Step 5: 验证**

```bash
pnpm typecheck && pnpm vitest run src/main && pnpm dev
```

`pnpm dev` 启动后检查：`ls ~/Library/Application\ Support/Electron/nexus-runtime.json 2>/dev/null || ls ~/Library/Application\ Support/nexus/nexus-runtime.json`（dev 下 userData 目录取决于 app 名），文件存在且权限 0600，内容含 `transports` 与 `authToken`。

---

### Task 6: CLI 构建链（nexus browser 命令）

**Files:**

- Create: `src/cli/`（index.ts、args.ts、dispatch.ts、handler-group-manifest.ts、browser-handler-groups.ts、selectors.ts、handlers/browser-*.ts、specs/、runtime/）
- Create: `config/tsconfig.cli.json`、`scripts/verify-cli-bin.mjs`
- Modify: `package.json`（scripts、bin）

- [x] **Step 1: 复制 CLI 文件（仅 browser 组 + 基础设施）**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/cli/handlers src/cli/specs src/cli/runtime
for f in index.ts args.ts dispatch.ts handler-group-manifest.ts browser-handler-groups.ts selectors.ts browser-format.ts; do
  cp "$ORCA/src/cli/$f" src/cli/ 2>/dev/null || true
done
for f in browser-nav browser-interact browser-tab browser-profile browser-cookie browser-capture browser-env browser-storage; do
  cp "$ORCA/src/cli/handlers/$f.ts" src/cli/handlers/
done
cp "$ORCA/src/cli/specs/browser-basic.ts" src/cli/specs/
cp "$ORCA/src/cli/specs/browser-advanced.ts" src/cli/specs/
cp "$ORCA/src/cli/runtime/client.ts" src/cli/runtime/
cp "$ORCA/src/cli/runtime/metadata.ts" src/cli/runtime/
cp "$ORCA/src/cli/runtime/transport.ts" src/cli/runtime/
cp "$ORCA/src/cli/runtime/errors.ts" src/cli/runtime/ 2>/dev/null || true
printf 'This directory contains code ported from Orca (https://github.com/stablyai/orca),\nCopyright (c) 2026 Lovecast Inc., licensed under the MIT License.\n' > src/cli/NOTICE
```

- [x] **Step 2: 收敛 CLI（裁剪非 browser 命令 + 改名）**

`src/cli/specs/index.ts` 新建（替代 orca 全量 spec 汇总）：

```ts
// Trimmed from orca cli/specs/index.ts: 仅 browser 命令组
import { BROWSER_BASIC_SPECS } from './browser-basic'
import { BROWSER_ADVANCED_SPECS } from './browser-advanced'

export const COMMAND_SPECS = [...BROWSER_BASIC_SPECS, ...BROWSER_ADVANCED_SPECS]
```

（导出常量名以 orca 实际文件为准。）`index.ts` 中删除非 browser 的特例入口（agent-teams-tmux / claude-teams / skills get / open / serve 等），保留 parseArgs → validateCommandAndFlags → RuntimeClient → dispatch 主链。`handler-group-manifest.ts` 只保留 8 个 browser 组。

命名替换（仅以下标识符）：

```bash
cd src/cli
perl -pi -e "s/ORCA_USER_DATA_PATH/NEXUS_USER_DATA_PATH/g; s/ORCA_CLI_CWD/NEXUS_CLI_CWD/g; s/orca-runtime\\.json/nexus-runtime.json/g" *.ts runtime/*.ts
perl -pi -e "s|'\\.\\./shared/|'../shared/browser/|g; s|'\\.\\./\\.\\./shared/|'../../shared/browser/|g" *.ts handlers/*.ts specs/*.ts runtime/*.ts
```

`runtime/metadata.ts` 的 `getDefaultUserDataPath` 平台默认目录改为：darwin `~/Library/Application Support/nexus-scaffold`，win32 `%APPDATA%/nexus-scaffold`，linux `$XDG_CONFIG_HOME/nexus-scaffold || ~/.config/nexus-scaffold`；并增强：默认目录不存在 `nexus-runtime.json` 时，回退尝试同平台 `nexus` 目录（dev 实例）——注释说明。userData 实际路径以 `NEXUS_USER_DATA_PATH` env 为准（Task 12 由主进程注入）。

- [x] **Step 3: CLI 构建配置**

`config/tsconfig.cli.json`（对齐 orca：Node16/CJS 输出、rootDir src）：

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "rootDir": "../src",
    "outDir": "../out",
    "composite": false,
    "noEmit": false,
    "sourceMap": false,
    "declaration": false
  },
  "include": ["../src/cli/**", "../src/shared/browser/**"]
}
```

若编译时报缺 `src/main/` 散文件（CLI 直接依赖的），按 orca tsconfig.cli.json 的 include 列表补齐对应 Nexus 已迁移文件。

`scripts/verify-cli-bin.mjs`：从 orca `config/scripts/verify-cli-bin.mjs` 复制，把 `orca` 改为 `nexus`（bin 名与包名校验），保留 `--fix-executable --fix-package-json` 行为（写 `out/package.json` = `{"name":"nexus-compiled-output","type":"commonjs","private":true}`）。

package.json 增加：

```json
"bin": { "nexus": "./out/cli/index.js" },
"scripts": {
  "build:cli": "tsc -p config/tsconfig.cli.json && node scripts/verify-cli-bin.mjs --fix-executable --fix-package-json",
  "typecheck:cli": "tsc --noEmit -p config/tsconfig.cli.json"
}
```

同时修改根 `build` 与 `build:mac`/`build:win`/`build:linux`/`build:unpack` 脚本，在 electron-vite build 前先跑 `build:cli`，例如：

```json
"build": "pnpm run build:cli && pnpm run typecheck && electron-vite build",
"build:mac": "pnpm run build:cli && electron-vite build && electron-builder --mac"
```

- [x] **Step 4: 验证 CLI 独立可用**

```bash
pnpm build:cli
node out/cli/index.js tab list
# 期望：输出 runtime_unavailable / "Start the Nexus app first." 类错误（app 未启动），证明 CLI 链路自洽
pnpm build:cli && pnpm typecheck:cli
```

---

### Task 7: preload 迁移 + window.api.browser

> **审查遗留（关键约束）**：①sandboxed guest preload **不能是 ESM**。will-attach 策略强制 `sandbox: true`，而 electron-vite 5 的 preload 产物是 `.mjs`（ESM），在 sandboxed guest 中会静默加载失败（window.close 守卫不生效且无报错）。必须照搬 orca 的解法（orca `electron.vite.config.ts:209-244`）：把 `browser-window-close` 入口从 preload 构建移到 **main 构建**的 rollup input，并显式 `output: { format: 'cjs', entryFileNames: '[name].js' }`（注释注意 sandboxed preload 不能加载 Rollup helper chunks，须内联全部依赖、无外部 import），产物为 `out/main/browser-window-close-preload.js`，`src/main/index.ts` 中 `browserWindowClosePreload` 路径同步改为 `join(__dirname, 'browser-window-close-preload.js')`（main 同目录）。同时移除 electron.vite preload 段的 `browser-window-close` 入口。该文件源码保持零外部依赖（不 import electron/shared，window.close 守卫用页面侧 API 实现）或确保 bundle 后无 ESM 语法。②orca #12040 后守卫 preload 为**无条件注入所有 guest**（无 marker/allowWindowClose 分支），实现从 orca `src/preload/browser-window-close.ts` + `browser-window-close-installation.ts` 现行版迁移。

**Files:**

- Create: `src/preload/browser-window-close.ts`、`src/preload/browser-window-close-installation.ts`、`src/preload/browser-find-subscriptions.ts`
- Modify: `src/preload/index.ts`
- Modify: 渲染层 window.api 类型声明（`src/preload/*.d.ts` 或引用 `WindowApiType` 处）

- [x] **Step 1: 复制 guest preload 文件**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
cp "$ORCA/src/preload/browser-window-close.ts" src/preload/
cp "$ORCA/src/preload/browser-window-close-installation.ts" src/preload/
cp "$ORCA/src/preload/browser-find-subscriptions.ts" src/preload/
cd src/preload
perl -pi -e "s|'\\.\\./shared/|'../shared/browser/|g" browser-window-close.ts browser-window-close-installation.ts browser-find-subscriptions.ts
```

- [x] **Step 2: 主 preload 增加 browser/session/ui 段**

编辑 `src/preload/index.ts`，在 `api` 对象中增加（方法体逐字参照 orca `src/preload/index.ts:2430-2751`（browser 段）、`:2921-2933`（session 段）、`:3391+`（ui 浏览器订阅段）复制，通道名不变）：

```ts
  browser: {
    // invoke 型（21 个）：registerGuest / unregisterGuest / openDevTools / setViewportOverride /
    // setAnnotationViewportBridge / proceedCertificate / cancelDownload / setGrabMode /
    // awaitGrabSelection / cancelGrab / captureSelectionScreenshot / extractHoverPayload /
    // sessionListProfiles / sessionCreateProfile / sessionDeleteProfile / sessionImportCookies /
    // sessionResolvePartition / sessionDetectBrowsers / sessionImportFromBrowser /
    // sessionClearDefaultCookies / notifyActiveTabChanged
    registerGuest: (args: unknown): Promise<unknown> => ipcRenderer.invoke('browser:registerGuest', args),
    // …… 其余照抄 orca preload 同名方法体 ……
    // 订阅型（15 个）：onGuestLoadFailed / onCertificateFailureChanged / onPermissionDenied /
    // onPopup / onDownloadRequested / onDownloadProgress / onDownloadFinished /
    // onContextMenuRequested / onContextMenuDismissed / onNavigationUpdate / onActivateView /
    // onPaneFocus / onOpenLinkInOrcaTab / onGrabModeToggle / onGrabActionShortcut
  },
  session: {
    // get / set / patch / flush / setSync（sendSync），照抄 orca preload:2921-2933
  },
  ui: {
    // onNewBrowserTab / onFocusBrowserAddressBar / onFindInBrowserPage（经 browser-find-subscriptions
    // 二次分发）/ onReloadBrowserPage / onHardReloadBrowserPage / onBrowserHistoryNavigate /
    // onZoomBrowserPage / onRequestTabCreate / replyTabCreate / onRequestTabSetProfile /
    // replyTabSetProfile / onRequestTabClose / replyTabClose，照抄 orca preload:3391+
  }
```

要求：逐方法从 orca preload 复制（保持参数与通道名一致），不允许只写上面注释中的占位——完成后 `window.api.browser.*` 与 orca 导出逐一比对（数量 21 invoke + 15 subscribe）。其中 `notifyActiveTabChanged`（`browser:activeTabChanged`）是 CLI 路由的关键通道：渲染层激活浏览器标签时发送，主进程 `ipc/browser.ts` 已有对应 handler（维护 bridge 全局活跃 tab）。

- [x] **Step 3: 类型声明与构建验证**

渲染层 `window.api` 的类型若引用 `WindowApiType`（`typeof api`），对象字面量扩展后自动覆盖；若有独立 d.ts 清单则同步补 browser/session/ui 段。

```bash
pnpm typecheck && pnpm build
```

`pnpm build` 验证 electron-vite 多 preload 入口构建出 `out/preload/browser-window-close.js`（Task 3 的 will-attach 策略引用此路径）。

---

### Task 8: 渲染层基建（UI 原语 + i18n shim + 工具 libs）

**Files:**

- Create: `src/renderer/src/features/browser/ui/`（14 个原语 + NOTICE）
- Create: `src/renderer/src/features/browser/i18n.ts`、`i18n-zh.ts`
- Create: `src/renderer/src/features/browser/lib/`、`hooks/`
- Create: `scripts/extract-browser-zh.mjs`

- [x] **Step 1: 迁移 UI 原语**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/renderer/src/features/browser/ui
for f in badge button command dialog dropdown-menu input label popover popover-content-ref \
         scroll-area select separator toggle toggle-group tooltip; do
  cp "$ORCA/src/renderer/src/components/ui/$f.tsx" src/renderer/src/features/browser/ui/ 2>/dev/null || \
  cp "$ORCA/src/renderer/src/components/ui/$f.ts" src/renderer/src/features/browser/ui/
done
printf 'This directory contains code ported from Orca (https://github.com/stablyai/orca),\nCopyright (c) 2026 Lovecast Inc., licensed under the MIT License.\n' > src/renderer/src/features/browser/ui/NOTICE
cd src/renderer/src/features/browser/ui
perl -pi -e "s|'\\@/lib/utils'|'\\@renderer/lib/utils'|g; s|'\\@/i18n/i18n'|'../i18n'|g; s|'\\@/components/ui/|'./|g" *.tsx *.ts 2>/dev/null
```

（Nexus `@renderer/lib/utils` 已有 `cn`；`radix-ui` 统一包已在依赖中。）

- [x] **Step 2: i18n shim**

设计决策（覆盖设计文档 §4.4）：不逐点替换 168 处 `translate()` 调用，而是提供**同签名 shim**——`translate(key, fallback?)` 查中文映射表，未命中返回 orca 原文 fallback。迁移代码零改动，且中文文案直接复用 orca 官方 zh.json 翻译。

`src/renderer/src/features/browser/i18n.ts`：

```ts
// Glue for Nexus: orca @/i18n/i18n 的 translate 等价物（zh 映射 + fallback 原文）
import { BROWSER_ZH } from './i18n-zh'

export function translate(key: string, fallback?: string, _options?: unknown): string {
  return BROWSER_ZH[key] ?? fallback ?? key
}
```

- [x] **Step 3: 从 orca zh.json 提取 browser 中文文案**

`scripts/extract-browser-zh.mjs`：

```js
// 从 orca 的 zh.json 提取浏览器相关 key 的翻译，生成 features/browser/i18n-zh.ts
import { readFileSync, writeFileSync } from 'fs'

const ORCA = '/Users/fanjunjie/Documents/repositories/github/orca'
const zh = JSON.parse(readFileSync(`${ORCA}/src/renderer/src/i18n/locales/zh.json`, 'utf8'))
const en = JSON.parse(readFileSync(`${ORCA}/src/renderer/src/i18n/locales/en.json`, 'utf8'))

const out = {}
const walk = (node, zhNode, path) => {
  for (const [k, v] of Object.entries(node ?? {})) {
    const p = path ? `${path}.${k}` : k
    if (typeof v === 'string') {
      if (/browser/i.test(p) && typeof zhNode?.[k] === 'string') out[p] = zhNode[k]
    } else if (v && typeof v === 'object') {
      walk(v, zhNode?.[k], p)
    }
  }
}
walk(en, zh, '')

const body = JSON.stringify(out, null, 2)
writeFileSync(
  'src/renderer/src/features/browser/i18n-zh.ts',
  `// 生成自 orca zh.json（scripts/extract-browser-zh.mjs），勿手改\nexport const BROWSER_ZH: Record<string, string> = ${body}\n`
)
console.log(`extracted ${Object.keys(out).length} keys`)
```

```bash
node scripts/extract-browser-zh.mjs
# 期望输出 extracted 200+ keys（orca en.json 有 293 个 browser key）
```

- [x] **Step 4: 迁移工具 libs 与 hooks**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/renderer/src/features/browser/lib src/renderer/src/features/browser/hooks
for f in browser-uuid language-detect screen-submit-shortcut browser-cookie-import-toast \
         workspace-session-hydration-keys; do
  cp "$ORCA/src/renderer/src/lib/$f.ts" src/renderer/src/features/browser/lib/ 2>/dev/null || true
done
cp "$ORCA/src/renderer/src/hooks/useShortcutLabel.ts" src/renderer/src/features/browser/hooks/
cp "$ORCA/src/renderer/src/hooks/useMountedRef.ts" src/renderer/src/features/browser/hooks/ 2>/dev/null || true
cd src/renderer/src/features/browser
perl -pi -e "s|'\\@/lib/utils'|'\\@renderer/lib/utils'|g; s|'\\@/i18n/i18n'|'../i18n'|g; s|'\\@/store'|'\\@renderer/stores/browser'|g" lib/*.ts hooks/*.ts
perl -pi -e "s|'((\\./)+)shared/|'\\@shared/browser/|g" lib/*.ts hooks/*.ts
```

typecheck 驱动收敛：lib 文件若引用未迁移模块，裁剪或补复制（同总则规则 4）。

- [x] **Step 5: 验证**

```bash
pnpm typecheck
```

---

### Task 9: 渲染层 browser store + 面板桥接 + 持久化订阅

**Files:**

- Create: `src/renderer/src/stores/browser.ts`（独立 zustand store）
- Create: `src/renderer/src/stores/browser-webview-cleanup.ts`
- Create: `src/renderer/src/features/browser/panel-bridge.ts`
- Create: `src/renderer/src/features/browser/session/`（session-write-subscriber、workspace-session、browser-session-persistence）
- Modify: `src/renderer/src/stores/projectPanel.ts`

- [x] **Step 1: projectPanel store 扩展（Nexus 侧胶水）**

修改 `src/renderer/src/stores/projectPanel.ts`：

① `PanelTab` 增加可选 `label?: string`（浏览器标签标题来自 BrowserWorkspace）。
② `openTab` 签名扩展为 `openTab: (type: PanelTabType, options?: { id?: string; label?: string }) => void`，实现中 `const tab: PanelTab = { id: options?.id ?? crypto.randomUUID(), type, label: options?.label }`。
③ 增加 `renameTab: (id: string, label: string) => void`：

```ts
renameTab: (id, label) =>
  set((state) => ({
    tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, label } : tab))
  }))
```

④ 同步在 interface 中声明 `renameTab` 与 `openTab` 新签名。`ProjectPanel.tsx` 的 `getTabLabel` 改为 `tab.label ?? (tab.type === 'file' && tab.filePath ? basename(tab.filePath) : tabLabel(tab.type))`。

- [x] **Step 2: panel-bridge.ts（orca 统一 tab 系统的 Nexus 等价物）**

`src/renderer/src/features/browser/panel-bridge.ts`：

```ts
// Glue for Nexus: orca browser slice 依赖的统一 tab 系统（unifiedTabsByWorktree/closeUnifiedTab/
// activateTab/setTabLabel）映射到 Nexus projectPanel store。PanelTab.id === BrowserWorkspace.id。
import { useProjectPanelStore } from '@renderer/stores/projectPanel'

export const panelBridge = {
  /** 面板中是否已存在该浏览器标签 */
  hasTab(id: string): boolean {
    return useProjectPanelStore.getState().tabs.some((t) => t.id === id)
  },
  openBrowserTab(id: string, label?: string): void {
    const panel = useProjectPanelStore.getState()
    if (!panel.open) useProjectPanelStore.setState({ open: true })
    panel.openTab('browser', { id, label })
  },
  closeTab(id: string): void {
    const panel = useProjectPanelStore.getState()
    if (panel.tabs.some((t) => t.id === id)) panel.closeTab(id)
  },
  activateTab(id: string): void {
    const panel = useProjectPanelStore.getState()
    if (panel.tabs.some((t) => t.id === id)) panel.setActiveTab(id)
  },
  setTabLabel(id: string, label: string): void {
    useProjectPanelStore.getState().renameTab(id, label)
  },
  /** 记录埋点（orca ui slice recordFeatureInteraction）：Nexus 无此设施，no-op */
  recordFeatureInteraction(..._args: unknown[]): void {}
}
```

- [x] **Step 3: 迁移 browser slice 为独立 store**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
cp "$ORCA/src/renderer/src/store/slices/browser.ts" src/renderer/src/stores/browser.ts
cp "$ORCA/src/renderer/src/store/slices/browser-webview-cleanup.ts" src/renderer/src/stores/
```

改写 `src/renderer/src/stores/browser.ts`：

1. 文件头：`create` 自 zustand，把 slice 工厂改为独立 store：

```ts
// Ported from orca store/slices/browser.ts（2230 行）。改造为独立 store，跨 slice 依赖经
// features/browser/panel-bridge（统一 tab 系统）与 settings-defaults（浏览器设置默认值）注入。
import { create } from 'zustand'
```

原 slice 是 `createBrowserSlice: StateCreator<AppState, ...>` 形式——改为 `export const useBrowserStore = create<BrowserState>()((set, get, store) => ({ ...原 slice 体 ... }))`，保留全部状态字段与 action（约 40 个）。

2. 依赖替换表（逐处机械替换）：

| orca 来源                                                                                                                                                                       | Nexus 替换                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get().unifiedTabsByWorktree` / `closeUnifiedTab` / `activateTab` / `setTabLabel`                                                                                               | `panelBridge.*`（hasTab/closeTab/activateTab/setTabLabel；读 tabs 列表用 `useProjectPanelStore.getState().tabs`）                                                                                   |
| `get().recordFeatureInteraction(...)`                                                                                                                                           | `panelBridge.recordFeatureInteraction(...)`（no-op）                                                                                                                                                |
| `get().keybindings`（用户覆盖）                                                                                                                                                 | `undefined`（走 shared/browser/keybindings 默认绑定）                                                                                                                                               |
| `get().browserDefaultUrl / browserDefaultSearchEngine / browserDefaultZoomLevel / browserKagiSessionLink`                                                                       | `BROWSER_SETTINGS_DEFAULTS`（新建 `features/browser/settings-defaults.ts`，取值照抄 orca `GlobalSettings` 默认值；常量含 `ORCA_BROWSER_BLANK_URL` 语义的首页、google 搜索、缩放 1.0、空 kagi link） |
| `destroyWorkspaceWebviews`                                                                                                                                                      | 从 `./browser-webview-cleanup` 直接 import                                                                                                                                                          |
| `pickNeighbor`（tab-group-state）                                                                                                                                               | 从 orca `store/slices/tab-group-state.ts` 复制该函数到 `features/browser/lib/pick-neighbor.ts`                                                                                                      |
| `buildValidWorktreeIdsForSessionHydration`                                                                                                                                      | 删除该过滤（Nexus 不过滤历史 worktreeId），注释说明                                                                                                                                                 |
| `@/runtime/*`、`runtimeEnvironmentSupportsCapability`、`toRuntimeWorktreeSelector`、`isRemoteRuntimeFileOperation`、`getRuntimeEnvironmentIdForWorktree`、远程 profile 拉取分支 | 删除远程分支，保留本地路径（profile 拉取固定走 `window.api.browser.session*`）；注释 `// TRIMMED from orca: remote runtime 分支`                                                                    |
| `@/i18n/i18n`                                                                                                                                                                   | `../features/browser/i18n`                                                                                                                                                                          |
| `@/lib/browser-uuid` 等小 libs                                                                                                                                                  | `../features/browser/lib/*`                                                                                                                                                                         |
| `shared/...`                                                                                                                                                                    | `@shared/browser/...`                                                                                                                                                                               |

3. `browser-webview-cleanup.ts` 同样改写（`@/store` → `./browser`，shared → `@shared/browser`）。

- [x] **Step 4: session 持久化订阅（渲染层）**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/renderer/src/features/browser/session
cp "$ORCA/src/renderer/src/lib/session-write-subscriber.ts" src/renderer/src/features/browser/session/
cp "$ORCA/src/renderer/src/lib/workspace-session.ts" src/renderer/src/features/browser/session/
cp "$ORCA/src/renderer/src/lib/workspace-session-patch.ts" src/renderer/src/features/browser/session/ 2>/dev/null || true
```

收敛这三个文件：`SESSION_RELEVANT_FIELDS` 只保留 `browserTabsByWorktree / browserPagesByWorkspace / activeBrowserTabIdByWorktree / browserUrlHistory`；store 引用从 `useAppStore` 改为 `useBrowserStore`；persist 回调直接用 `window.api.session.patch(patch)`（本地无 host 概念，去掉 byHost 包装）；shared import 指到 `@shared/browser/`。

新建 `src/renderer/src/features/browser/session/browser-session-persistence.ts`：

```ts
// Glue for Nexus: 订阅 useBrowserStore 变化 → 防抖 patch 到主进程 nexus-browser-session.json；
// 启动时 hydrate。对齐 orca App.tsx:1253-1285 的装配方式。
import { useBrowserStore } from '@renderer/stores/browser'
import { createSessionWriteSubscriber } from './session-write-subscriber'

let started = false

export function startBrowserSessionPersistence(): void {
  if (started) return
  started = true
  createSessionWriteSubscriber({
    store: useBrowserStore,
    persist: (patch) => void window.api.session.patch(patch),
    shouldSchedulePersist: () => true
  })
}

export async function hydrateBrowserSessionFromDisk(): Promise<void> {
  const session = (await window.api.session.get()) as Parameters<
    ReturnType<typeof useBrowserStore.getState>['hydrateBrowserSession']
  >[0]
  useBrowserStore.getState().hydrateBrowserSession(session)
}
```

（`createSessionWriteSubscriber` 的签名以 orca 迁移文件为准对齐实参名。）

`window.addEventListener('beforeunload')` 时 `window.api.session.setSync(...)` 的装配也照 orca App.tsx 一并迁移到本模块。

- [x] **Step 5: 验证**

```bash
pnpm typecheck && pnpm vitest run src/renderer 2>/dev/null || true
```

---

### Task 10: BrowserPane 迁移 + ProjectPanel 挂载

**Files:**

- Create: `src/renderer/src/features/browser/pane/`（约 40 文件 + markup/ + NOTICE）
- Create: `src/renderer/src/features/browser/BrowserPanelTab.tsx`
- Create: `src/renderer/src/features/browser/useBrowserSessionHydration.ts`
- Modify: `src/renderer/src/features/agent/ProjectPanel.tsx`
- Modify: `src/renderer/src/features/agent/AgentPage.tsx`

- [x] **Step 1: 复制 browser-pane（排除远程 driver）**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/renderer/src/features/browser/pane
for f in "$ORCA"/src/renderer/src/components/browser-pane/*.ts "$ORCA"/src/renderer/src/components/browser-pane/*.tsx; do
  base=$(basename "$f")
  case "$base" in
    BrowserMobileDriverOverlay.tsx|remote-browser-frame-style.ts|remote-browser-keyboard.ts) ;;
    *) cp "$f" src/renderer/src/features/browser/pane/ ;;
  esac
done
cp -r "$ORCA/src/renderer/src/components/browser-pane/markup" src/renderer/src/features/browser/pane/
printf 'This directory contains code ported from Orca (https://github.com/stablyai/orca),\nCopyright (c) 2026 Lovecast Inc., licensed under the MIT License.\n' > src/renderer/src/features/browser/pane/NOTICE
```

- [x] **Step 2: import 改写 + 裁剪**

```bash
cd src/renderer/src/features/browser/pane
perl -pi -e "s|'((\\./)+)shared/|'\\@shared/browser/|g" *.ts *.tsx markup/*.ts markup/*.tsx
perl -pi -e "s|'\\@/components/ui/|'../ui/|g; s|'\\@/i18n/i18n'|'../i18n'|g; s|'\\@/store'|'\\@renderer/stores/browser'|g" *.ts *.tsx markup/*.ts markup/*.tsx
perl -pi -e "s|'\\@/lib/|'../lib/|g; s|'\\@/hooks/|'../hooks/|g; s|'\\@/components/browser-pane/|'./|g" *.ts *.tsx markup/*.ts markup/*.tsx
perl -pi -e "s|ORCA_BROWSER_FOCUS_REQUEST_EVENT|ORCA_BROWSER_FOCUS_REQUEST_EVENT|g" *.ts *.tsx
```

裁剪（删除 import + 调用点，保留本地路径，注释 `// TRIMMED from orca:`）：

- `@/components/contextual-tours/use-contextual-tour` → 删除 `useContextualTour(...)` 调用
- `@/runtime/runtime-rpc-client`、`@/runtime/runtime-file-client`、`@/runtime/runtime-worktree-selector`、`@/lib/worktree-runtime-owner`、`@/lib/connection-context`、`@/lib/pane-manager/browser-mobile-driver-state` → 删除远程分支（`runtimeEnvironmentActive` 相关 if 分支取本地路径）
- `@/lib/file-preview`、`@/lib/terminal-links`、`@/lib/workspace-file-drag` → 这三个与 worktree 文件体系耦合：先复制到 `features/browser/lib/` 并收敛其内部依赖；若依赖链拖入 orca repos slice，则裁剪对应调用点（localhost 链接开标签、文件拖入）并注释记录——这两个是增强入口，不是浏览器核心

typecheck 驱动收敛至干净。`BrowserPane.tsx` 的 props 签名保持不变（`{ browserTab, isActive, findShortcutScope? }`）。

- [x] **Step 3: BrowserPanelTab 组件（面板标签 ↔ BrowserWorkspace 桥）**

`src/renderer/src/features/browser/BrowserPanelTab.tsx`：

```tsx
// Glue for Nexus: ProjectPanel 的 browser 标签内容。tab.id === BrowserWorkspace.id；
// 会话切换/标签过期时兜底关闭面板标签。
import { useAgentStore } from '@renderer/features/agent/agentStore'
import { useBrowserStore } from '@renderer/stores/browser'
import type { PanelTab } from '@renderer/stores/projectPanel'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { useEffect, type FC } from 'react'
import BrowserPane from './pane/BrowserPane'

export const BrowserPanelTab: FC<{ tab: PanelTab }> = ({ tab }) => {
  const sessionId = useAgentStore((s) => s.activeSessionId)
  const workspace = useBrowserStore((s) =>
    sessionId ? s.browserTabsByWorktree[sessionId]?.find((t) => t.id === tab.id) : undefined
  )
  const closeTab = useProjectPanelStore((s) => s.closeTab)

  // 面板标签存在但 BrowserWorkspace 已不存在（会话切换残留等）→ 关闭面板标签
  useEffect(() => {
    if (sessionId && !workspace) closeTab(tab.id)
  }, [sessionId, workspace, closeTab, tab.id])

  if (!workspace) return null
  return <BrowserPane browserTab={workspace} isActive={true} />
}
```

- [x] **Step 4: ProjectPanel 挂载**

`src/renderer/src/features/agent/ProjectPanel.tsx`：

① `TabContent` 增加分支（在 file 分支后）：

```tsx
if (tab.type === 'browser') {
  return <BrowserPanelTab tab={tab} />
}
```

（import `BrowserPanelTab`；删除原占位分支中 browser 的落点，其余占位类型 review/terminal/chat 保持原样。）

② 新建浏览器标签入口改为走桥接（`AddTabMenu` 与 `EmptyMenu` 中 `openTab('browser')` 的两处调用点）。新建 `useOpenBrowserTab` hook（放在 ProjectPanel.tsx 内）：

```tsx
function useOpenBrowserTab(): () => void {
  const sessionId = useAgentStore((s) => s.activeSessionId)
  return () => {
    if (!sessionId) return
    // Task 9 审查定案（I2）：createBrowserTab 实际签名 (worktreeId, url?, options?)，
    // 返回 BrowserWorkspace，且尾部已调 panelBridge.openBrowserTab（projectPanel.openTab
    // 对 options.id 已幂等）。此处绝不能再调 panelBridge.openBrowserTab，否则重复标签。
    // 实参以迁移后 slice 实际签名为准。
    useBrowserStore.getState().createBrowserTab(sessionId)
  }
}
```

- [x] **Step 5: 会话水合 + 活跃标签跟踪**

> **Task 5 审查定案（必须实现）**：CLI 无 `--worktree` selector 的命令走 bridge 全局活跃 tab，该状态由渲染层发 `browser:activeTabChanged` 维护。浏览器标签被激活时（PanelTab 激活、会话切换水合、新标签创建）必须调 `window.api.browser.notifyActiveTabChanged({ worktreeId: sessionId, browserPageId })` 同步给主进程。
>
> **Task 9 审查定案（必须实现）**：①会话切换必须调 `useBrowserStore.getState().setActiveWorktreeId(sessionId)`（slice 的 activeWorktreeId 由此维护，hydrate 的活跃 tab 计算与 notify 补发依赖它）；②hydrate 后必须 `rebuildPanelBrowserTabs` 重建面板标签（slice hydrate 对所有持久化会话建了面板标签并激活最后一个，需收敛为仅当前会话 + 激活持久化的 activeBrowserTabId）；③`hydrateBrowserSessionFromDisk()` 必须 `.catch()`（get 失败不得 unhandled rejection）。

`src/renderer/src/features/browser/useBrowserSessionHydration.ts`：

```ts
// Glue for Nexus: 应用启动时 hydrate 浏览器会话；会话切换时把该会话的浏览器标签
// 恢复进面板（旧会话的浏览器标签从面板移除，webview 由 browser-webview-cleanup 销毁），
// 并维护 slice 的 activeWorktreeId（hydrate 活跃 tab 计算与 notifyActiveTabChanged 依赖）。
import { useAgentStore } from '@renderer/features/agent/agentStore'
import { useBrowserStore } from '@renderer/stores/browser'
import { useProjectPanelStore } from '@renderer/stores/projectPanel'
import { useEffect } from 'react'
import {
  hydrateBrowserSessionFromDisk,
  startBrowserSessionPersistence
} from './session/browser-session-persistence'

/** 重建面板的浏览器标签：移除所有浏览器类型面板标签，按指定会话的持久化
 *  BrowserWorkspace 重建，激活态对齐 activeBrowserTabIdByWorktree[sessionId]。 */
function rebuildPanelBrowserTabs(sessionId: string | null): void {
  const panel = useProjectPanelStore.getState()
  const nonBrowserTabs = panel.tabs.filter((t) => t.type !== 'browser')
  const workspaces = sessionId
    ? (useBrowserStore.getState().browserTabsByWorktree[sessionId] ?? [])
    : []
  const nextTabs = [
    ...nonBrowserTabs,
    ...workspaces.map((ws) => ({
      id: ws.id,
      type: 'browser' as const,
      label: ws.title || ws.url || '浏览器'
    }))
  ]
  const persistedActiveId = sessionId
    ? useBrowserStore.getState().activeBrowserTabIdByWorktree[sessionId]
    : null
  const activeTabId = nextTabs.some((t) => t.id === panel.activeTabId)
    ? panel.activeTabId
    : persistedActiveId && nextTabs.some((t) => t.id === persistedActiveId)
      ? persistedActiveId
      : (nextTabs[nextTabs.length - 1]?.id ?? null)
  useProjectPanelStore.setState({ tabs: nextTabs, activeTabId })
}

export function useBrowserSessionHydration(): void {
  const sessionId = useAgentStore((s) => s.activeSessionId)

  useEffect(() => {
    startBrowserSessionPersistence()
    // 启动时也设置 activeWorktreeId：hydrate 的活跃 tab 计算依赖它
    useBrowserStore.getState().setActiveWorktreeId(useAgentStore.getState().activeSessionId)
    hydrateBrowserSessionFromDisk()
      .then(() => rebuildPanelBrowserTabs(useAgentStore.getState().activeSessionId))
      .catch((error) => console.error('浏览器会话 hydrate 失败', error))
  }, [])

  useEffect(() => {
    if (!sessionId) return
    useBrowserStore.getState().setActiveWorktreeId(sessionId)
    rebuildPanelBrowserTabs(sessionId)
  }, [sessionId])
}
```

注意：slice 的 `hydrateBrowserSession` 内部会对所有持久化会话调 `panelBridge.openBrowserTab`（orca createUnifiedTab 的忠实映射），`rebuildPanelBrowserTabs` 在其后收敛面板标签——顺序上 hydrate 完成（`.then`）再重建。若实现中发现 panelBridge.openBrowserTab 在 hydrate 期间强制打开面板造成闪烁，可在 panelBridge 增加静默模式或在重建前暂存面板开关态，但不得改 slice 逻辑。

`AgentPage.tsx`：在 `AgentPage` 组件内调用 `useBrowserSessionHydration()`（import 自 `@renderer/features/browser/useBrowserSessionHydration`）。

- [x] **Step 6: 手工验证（第一轮端到端）**

```bash
pnpm dev
```

验证清单：

1. ProjectPanel「+」→ 浏览器 → 出现 BrowserPane（工具栏/地址栏）
2. 地址栏输入 `example.com` 回车 → 页面加载（webview 注入成功，will-attach 白名单放行 `persist:nexus-browser`）
3. 前进/后退/刷新、多标签切换
4. 缩放窗口/折叠侧栏 → webview 尺寸自适应
5. 关闭 Nexus 重开 → 该会话的浏览器标签恢复（`nexus-browser-session.json` 有内容）

---

### Task 11: cookie 导入 UI + 设置页

**Files:**

- Create: `src/renderer/src/features/browser/settings/`（BrowserSessionCookiesSection、BrowserNewProfileDialog、BrowserProfileRow、BrowserSettingsPane）
- Modify: Nexus 设置页（`src/renderer/src/pages/settings/` 入口组件）

- [x] **Step 1: 迁移 settings 组件**

```bash
ORCA=/Users/fanjunjie/Documents/repositories/github/orca
mkdir -p src/renderer/src/features/browser/settings
for f in BrowserSessionCookiesSection.tsx BrowserNewProfileDialog.tsx BrowserProfileRow.tsx; do
  cp "$ORCA/src/renderer/src/components/settings/$f" src/renderer/src/features/browser/settings/
done
```

改写同 Task 10 Step 2 的 perl 规则；额外裁剪：`./settings-search`、`./SearchableSetting`、`shared/execution-host`、`shared/host-setting-overrides`、`../sidebar/sidebar-host-options`、`@/lib/agent-feature-install-commands` 等 orca 设置页/agent 基础设施引用（注释记录）。`sonner` toast 保留（Task 1 已装）。

**范围决定（明确裁掉，非占位）**：orca settings/BrowserPane.tsx 的主页 URL/搜索引擎/默认缩放设置项与 BrowserUsePane.tsx（agent skill 安装引导）不迁移——前者依赖 orca GlobalSettings 体系（Nexus 用 `BROWSER_SETTINGS_DEFAULTS` 常量，Task 9），后者依赖 orca agent skill 安装体系（Nexus 的 skill 由 Task 12 内置分发，无需安装步骤）。

- [x] **Step 2: 组装 BrowserSettingsPane 并挂入设置页**

`src/renderer/src/features/browser/settings/BrowserSettingsPane.tsx`：

```tsx
// Glue for Nexus: 浏览器设置分区——session profile 与 cookie 管理（导入/清除），
// 各子组件自 orca settings 迁移。
import type { FC } from 'react'
import { BrowserSessionCookiesSection } from './BrowserSessionCookiesSection'

export const BrowserSettingsPane: FC = () => {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium">浏览器</h3>
      <BrowserSessionCookiesSection />
    </div>
  )
}
```

在 Nexus 设置页（`src/renderer/src/pages/settings/`）新增「浏览器」分区渲染 `BrowserSettingsPane`（挂法参照现有 ProviderSettings/PluginSettings 分区的注册方式）。

- [x] **Step 3: 验证**

```bash
pnpm typecheck && pnpm dev
```

设置页出现「浏览器」分区；BrowserPane 工具栏菜单 → profile 对话框、导入提示按钮可用；执行一次「从 Chrome 导入 cookie」→ 访问已登录站点验证登录态（macOS 会弹 Keychain 授权）。

---

### Task 12: Agent 控制链端到端（env 注入 + CLI shim + skill 文档）

**Files:**

- Create: `src/main/browser/browser-cli-env.ts`
- Create: `resources/agent/skills/nexus-cli/SKILL.md`
- Modify: `src/main/index.ts`
- Modify: `resources/agent/builtin-packages.json` 或 AgentResourceService 对应注册（以 Nexus 现有 skill 分发机制为准）

- [x] **Step 1: 主进程 env 注入（agent shell 可达 CLI）**

`src/main/browser/browser-cli-env.ts`：

```ts
// Glue for Nexus: 让 agent 的 shell 能找到 `nexus` CLI 并定位 runtime。
// orca 在 PTY 创建处注入（buildPtyHostEnv）；Nexus 的 agent 工具是主进程的子进程，
// 在主进程启动时注入 process.env 即可全继承。
import { app } from 'electron'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { delimiter, join } from 'path'

export function installBrowserCliEnv(): void {
  const userData = app.getPath('userData')
  process.env.NEXUS_USER_DATA_PATH = userData

  let cliBinDir: string
  if (app.isPackaged) {
    // 打包态：Resources/bin/nexus（electron-builder extraResources 的 shim）
    cliBinDir = join(process.resourcesPath, 'bin')
  } else {
    // 开发态：<userData>/cli/bin/nexus → node <repo>/out/cli/index.js
    cliBinDir = join(userData, 'cli', 'bin')
    const shim = join(cliBinDir, 'nexus')
    const cliEntry = join(app.getAppPath(), 'out', 'cli', 'index.js')
    if (!existsSync(shim) && existsSync(cliEntry)) {
      mkdirSync(cliBinDir, { recursive: true })
      writeFileSync(shim, `#!/bin/bash\nexec node "${cliEntry}" "$@"\n`, 'utf8')
      chmodSync(shim, 0o755)
    }
  }
  const current = process.env.PATH ?? ''
  if (existsSync(cliBinDir) && !current.split(delimiter).includes(cliBinDir)) {
    process.env.PATH = `${cliBinDir}${delimiter}${current}`
  }
}
```

`src/main/index.ts` 的 `startApp()` 中（RPC server 启动之后）调用 `installBrowserCliEnv()`。

- [x] **Step 2: electron-builder 打包配置**

修改 `electron-builder.yml`：

```yaml
asarUnpack:
  - resources/**
  - '**/node_modules/@earendil-works/**'
  - '**/node_modules/@silvia-odwyer/**'
  - '**/node_modules/@mariozechner/**'
  # nexus CLI（tsc 编译非 bundle，ELECTRON_RUN_AS_NODE 启动，asar 内依赖不可见）
  - out/package.json
  - out/cli/**
  - out/shared/**
  - '**/node_modules/ws/**'
  - '**/node_modules/zod/**'
  - '**/node_modules/agent-browser/**'
extraResources:
  - from: resources/provider
    to: provider
    filter:
      - '*.json'
  - from: resources/agent
    to: agent
  # agent-browser 原生二进制（Resources 根，agent-browser-bridge resolveAgentBrowserBinary 约定）
  - from: node_modules/agent-browser/bin/agent-browser-darwin-arm64
    to: agent-browser-darwin-arm64
  - from: node_modules/agent-browser/bin/agent-browser-darwin-x64
    to: agent-browser-darwin-x64
  # CLI 启动 shim（Resources/bin/）
  - from: resources/darwin/bin/nexus
    to: bin/nexus
afterPack: build/afterPack.cjs
```

（win/linux 的 extraResources 参照 orca 配置同款追加：`agent-browser-win32-x64.exe`、`agent-browser-linux-${arch}`、`resources/win32/bin/nexus.cmd`、`resources/linux/bin/nexus`。）

新建 `resources/darwin/bin/nexus`（照 orca `resources/darwin/bin/orca` 改写）：

```bash
#!/bin/bash
# nexus CLI launcher: 解析 .app 内路径，用 ELECTRON_RUN_AS_NODE 跑 tsc 编译的 CLI
SOURCE="$0"
while [ -h "$SOURCE" ]; do SOURCE="$(readlink "$SOURCE")"; done
BIN_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
CONTENTS="$(cd "$BIN_DIR/.." >/dev/null 2>&1 && pwd)"
ELECTRON="$(cd "$CONTENTS/MacOS" >/dev/null 2>&1 && pwd)/$(ls "$CONTENTS/MacOS" | head -1)"
CLI="$CONTENTS/Resources/app.asar.unpacked/out/cli/index.js"
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
```

`chmod +x resources/darwin/bin/nexus`。

新建 `build/afterPack.cjs`（照 orca afterPack 的 chmod 段）：

```js
const { chmodSync, readdirSync } = require('fs')
const { join } = require('path')

exports.default = async function afterPack(context) {
  const resourcesDir = context.appOutDir.endsWith('.app')
    ? join(context.appOutDir, 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  for (const filename of readdirSync(resourcesDir)) {
    if (filename.startsWith('agent-browser-')) chmodSync(join(resourcesDir, filename), 0o755)
  }
  const binDir = join(resourcesDir, 'bin')
  try {
    for (const filename of readdirSync(binDir)) chmodSync(join(binDir, filename), 0o755)
  } catch {
    /* 无 bin 目录时忽略 */
  }
}
```

- [x] **Step 3: skill 文档**

`resources/agent/skills/nexus-cli/SKILL.md`：内容取自 orca `skill-guides/orca-cli.md` 的 `## Built-In Browser` 章节（:227-295），命令改为 `nexus`。骨架：

```markdown
---
name: nexus-cli
description: Control the built-in browser inside Nexus — open pages, snapshot, click, fill, screenshot, manage tabs/profiles/cookies via the `nexus` CLI. Use when the user asks to browse the web, operate a website, or verify a page in the built-in browser.
---

# Nexus Built-In Browser

The `nexus` CLI controls the app's built-in browser. The Nexus app must be running.

## Tabs

`nexus tab list|current|create --url <url>|switch|close`（`--json` 输出结构化结果）

## Navigate & observe

`nexus goto --url <url>` / `nexus back|forward|reload`
`nexus snapshot`（a11y 树 + @e 引用，后续 click/fill 用 `--element <ref>` 定位）
`nexus screenshot [--full-page]` / `nexus pdf`

## Interact

`nexus click --element <ref>` / `nexus fill --element <ref> --text <text>` /
`nexus type --text <text>` / `nexus keypress <key>` / `nexus scroll --dy <px>` /
`nexus hover --element <ref>` / `nexus select --element <ref> --value <v>` /
`nexus upload --element <ref> --file <path>` / `nexus wait --selector <css>|--timeout <ms>`

## Data

`nexus cookie get|set|delete` / `nexus storage local|session get|set|clear`

## Tips

- 一律先 `nexus snapshot` 拿元素引用再交互；页面变化后重新 snapshot（ref 会失效）
- 多标签时用 `--worktree <sessionId>` 与 `--page <pageId>` 定位目标
- 所有命令支持 `--json`
```

正文命令清单**必须照抄 orca 指南 browser 章节的真实命令与参数**（可从 `out/cli/index.js --help` 或 specs 文件核对），上面骨架仅示意结构。

注册方式：先读 `resources/agent/README` 与 `src/main/agent/AgentResourceService.ts`，按 Nexus 现有机制把 `skills/nexus-cli` 注册为内置 skill（与 builtin-packages/prompts 同机制）；若当前机制只支持 prompts 追加，则把 SKILL.md 内容追加进 prompts 目录一个 `nexus-browser.md` 作为过渡，并在文件头注明。

- [x] **Step 4: 端到端手工验证**

```bash
pnpm build:cli && pnpm dev
```

1. 终端执行 `NEXUS_USER_DATA_PATH=~/Library/Application\ Support/Electron node out/cli/index.js tab create --url https://example.com`（dev userData 目录以 Task 5 Step 5 实测为准）→ Nexus 中弹出新浏览器标签
2. `node out/cli/index.js snapshot` → 输出 a11y 树与 @e 引用
3. 在 Nexus 对话中让 agent：「用内置浏览器打开 example.com，截图并告诉我页面标题」→ agent 应通过 skill 指引调用 `nexus` CLI 完成

---

### Task 13: 回归验证 + 文档收尾

- [x] **Step 1: 全量自动验证**

```bash
pnpm typecheck && pnpm lint && pnpm format
pnpm vitest run
pnpm build
```

- [x] **Step 2: Electron 39 回归点逐项手工验证（pnpm dev）**

1. `<webview>` 加载/导航/弹窗策略（target=_blank 弹 origin bar 子窗口）
2. `webContents.debugger`：CLI `snapshot`/`click`/`screenshot` 全通
3. `session.fromPartition('persist:nexus-browser')`：重启后 cookie/登录态保留
4. `nexus pdf`（原生 printToPDF 通道）
5. 设备模拟：工具栏 viewport 预设切换（Emulation.setDeviceMetricsOverride）
6. anti-detection：访问 Cloudflare 校验站点观察 Turnstile
7. 证书错误：访问自签名站点 → 挑战 UI → proceed
8. grab 框选：⌘C grab 模式选元素 → 标注发送给 agent

- [x] **Step 3: 设计 §9 手工验收清单 8 项全过**

（清单见 `docs/superpowers/specs/2026-08-02-orca-browser-migration-design.md` §9。）

- [x] **Step 4: 更新 AGENTS.md**

在 `AGENTS.md` 的仓库结构、`项目约定` 中补充：

- `src/main/browser/`（orca 迁移的内置浏览器域）、`src/main/runtime/`（CLI runtime RPC）、`src/cli/`（nexus CLI）、`src/shared/browser/`（orca 迁移的共享类型/常量）
- 浏览器域 IPC 独立于 IpcRouter 的说明（`src/main/ipc/browser.ts` + `browser-session.ts`，orca 风格 `ipcMain.handle`，含 `isTrustedBrowserRenderer` 信任边界）
- `agent-browser`/`ws`/`zod` 在 dependencies 的原因；`build:cli` 并入 build 链
- `src/renderer/src/features/browser/` 与 `src/renderer/src/stores/browser.ts` 的职责与「原样迁移、仅适配层可改」的维护约定（NOTICE 文件、TRIMMED 注释约定）

---

## 自查记录

- **Spec 覆盖**：§3 目录布局 → Task 2/3/5/6/7/8/9/10/11；§4 适配层 10 条 → Task 3(7/8)、Task 5(2)、Task 6(6)、Task 8(4/5)、Task 9(1/2)、Task 12(1)、Task 13(2 回归)；§5 数据流 → Task 4/9/10；§6 安全骨架 → Task 3 Step 5 + Task 5 Step 1；§7 Agent 链路 → Task 5/6/12；§8 错误体系 → 随 orca 代码原样（Task 3/5/6）；§9 测试 → Task 1 + 各 Task 验证 + Task 13。
- **与设计文档的偏差（已在计划中注明）**：i18n 由「逐点替换中文硬编码」改为「translate shim + orca zh.json 提取」（Task 8 Step 2，零改动迁移代码）；settings/BrowserPane 与 BrowserUsePane 不迁移（Task 11 Step 1，依赖 orca GlobalSettings 与 agent skill 安装体系）；主进程保留 screencast 流（`browser-screencast-stream` 等随域复制），仅裁渲染层远程 driver 与 offscreen 后端。
- **不做的事**：git 提交（用户明确要求）；`review/terminal/chat` 占位标签的实现；远程 relay。
