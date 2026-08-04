# Orca 内置浏览器完整迁移设计

日期：2026-08-02
状态：已确认（范围 A+B、方案 1、按会话归属、保留 orca 持久化机制）

## 1. 背景与目标

为 Nexus 增加内置浏览器能力。终态目标：像 Codex 一样，用户可在对话中让 Agent 打开并自主操作内置浏览器。

第一阶段（本设计范围）：将 Orca（`/Users/fanjunjie/Documents/repositories/github/orca`，MIT License，Copyright (c) 2026 Lovecast Inc.）的浏览器功能**原样完整迁移**进 Nexus，包括：

- **A. 浏览器本体**：`<webview>` 标签嵌入、两级标签模型、工具栏/地址栏/页内查找、session partition 持久化、cookie 导入管线（Chrome/Edge/Arc/Brave/Comet/Helium/Firefox/Safari）、安全骨架、grab 框选标注
- **B. Agent 控制栈**：`agent-browser` Rust 二进制 + CDP WS 代理 + CLI + runtime RPC（约 75 个 `browser.*` 方法）

明确**不迁移**：C. 远程 relay / offscreen headless 后端 / screencast 远程 driver（Nexus 无远程 runtime 场景）。

迁移原则：**原样复制、禁止重写**。仅在接缝处写薄适配层。Orca 上游后续修复应能逐文件对照同步。

## 2. 总体架构

Orca 的浏览器嵌入方式为渲染进程 `<webview>` 标签（非 BrowserView/WebContentsView），webview 是普通 DOM 元素，**尺寸完全由 CSS 布局决定，无任何 setBounds/尺寸同步代码**。主进程不创建视图，只做 guest 策略注册与 CDP 控制。

```
渲染进程 <webview>（CSS 布局决定尺寸）
   │ dom-ready 后 getWebContentsId()
   ▼ IPC browser:registerGuest
主进程 BrowserManager（WebContents 注册表 + guest 策略）
   ├── BrowserSessionRegistry（partition 白名单、session profile、cookie 暂存/重放）
   └── AgentBrowserBridge ── spawn agent-browser 二进制 ──► CdpWsProxy ──► webContents.debugger
CLI (nexus browser ...) ── Unix Socket（auth token）──► runtime RPC (browser.* ~75 方法) ──► 上述模块
pi Agent 在 shell 中调用 nexus CLI（skill 文档教它用法）
```

## 3. 目录布局（迁移映射）

全部原样复制自 orca，仅调整 import 路径：

| Nexus 路径                                    | Orca 来源                                            | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main/browser/`                           | `src/main/browser/`                                  | 全部 ~35 文件：browser-manager、browser-session-registry、browser-session-startup、browser-cookie-import（+chromium-cookie-snapshot/path）、agent-browser-bridge、cdp-ws-proxy、cdp-bridge（保留，测试用）、snapshot-engine、cdp-screenshot、cdp-print-to-pdf、electron-debugger-lease、browser-text-insertion、anti-detection、browser-guest-ui、browser-clicked-link-routing、popup-origin-bar-window、browser-certificate-_（4 个）、browser-session-permission-policy、browser-media-access、browser-webauthn-access、browser-session-ua、browser-download-destination、browser-grab-_ + grab-guest-script、browser-guest-navigation-state、browser-backend.ts（接口；不迁移 offscreen 实现），连同 `.test.ts` |
| `src/main/runtime/`                           | `src/main/runtime/` 的 browser 部分                  | orca-runtime-browser.ts、rpc/methods/browser-core.ts、browser-extras.ts、browser-text-rpc-methods.ts、browser-schemas.ts、runtime-rpc.ts（Unix socket + token 传输）。不迁移 screencast/relay/driver 相关                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/main/ipc/browser.ts`                     | `src/main/ipc/browser.ts`                            | 全部 `browser:*` 通道注册（ipcMain.handle 风格，独立于 Nexus IpcRouter）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/cli/`                                    | `src/cli/` 的 browser 部分                           | browser-tab/nav/interact/cookie/storage/capture/profile/env handlers、browser-handler-groups、browser-format、RPC client；构建为 nexus CLI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/preload/`                                | `src/preload/` browser 段                            | `window.api.browser.*`（并入现有 preload）、browser-window-close(-installation)（guest preload）、browser-find-subscriptions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/renderer/src/features/browser/`          | `src/renderer/src/components/browser-pane/`          | 全部 ~40 文件（BrowserPane.tsx、browser-page-webview、webview-registry、地址栏 4 件、工具栏菜单 3 件、导入提示 3 件、BrowserFind、load-failure overlay、overlay layer、grab UI、markup/ 标注编辑器 10 件、viewport/zoom/runtime/focus/keyboard/notices/paintability/automation-visibility/page-selection）。不迁移 BrowserMobileDriverOverlay / remote-browser-*                                                                                                                                                                                                                                                                                                                                                   |
| `src/renderer/src/stores/browser.ts`          | `src/renderer/src/store/slices/browser.ts`           | zustand BrowserSlice（独立 store 文件）+ browser-webview-cleanup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/renderer/src/features/browser/settings/` | `src/renderer/src/components/settings/` 的浏览器部分 | BrowserSessionCookiesSection、BrowserNewProfileDialog、BrowserProfileRow（profile/cookie 管理）；挂入 Nexus 设置页。**不迁移**：settings/BrowserPane（主页/搜索引擎/缩放设置，依赖 orca GlobalSettings 体系，Nexus 用默认值常量）与 BrowserUsePane（依赖 orca agent skill 安装体系，Nexus 的 skill 随包内置无需安装）                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/shared/browser/`                         | `src/shared/` browser-*                              | 类型（BrowserWorkspace/BrowserPage/BrowserSessionProfile/BrowserHistoryEntry）、constants、browser-url、browser-guest-events、browser-grab-types、browser-annotation-viewport-bridge、browser-certificate-errors、browser-cookie-import-sources、browser-find-source、browser-window-close-policy、browser-guest-web-preferences、browser-page-zoom、browser-viewport-presets、workspace-session-browser-history、runtime-types 的 Browser*Result、orca-profiles（partition 命名）。不迁移 browser-screencast-protocol                                                                                                                                                                                             |
| `resources/agent/skills/nexus-cli/`           | `skills/orca-cli/`                                   | 教 agent 使用 CLI 的 skill 文档，改名并替换命令名                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

挂载点：`src/renderer/src/features/agent/ProjectPanel.tsx` 的 `TabContent` 为 `tab.type === 'browser'` 增加分支渲染 `<BrowserPane>`，标签生命周期复用 `useProjectPanelStore`。

新增依赖：`agent-browser@~0.27.0`（含 Rust 原生二进制，入根 `dependencies`；electron-builder 按平台打包 asarUnpack）、`ws`。cookie 导入的系统依赖：macOS `security` CLI、Linux `secret-tool`、Windows PowerShell DPAPI；Node 24 `node:sqlite`（Nexus Node 24.14.1 满足）。

## 4. 适配层（只接线，不重写）

1. **worktreeId → sessionId**：BrowserPane 挂载时以当前会话 id 作为 worktreeId 传入；store 的 `browserTabsByWorktree` 的 key 即会话 id。浏览器标签组按会话归属与恢复。
2. **IPC 并存**：`src/main/ipc/browser.ts` 在 `startApp()` 中调用一次完成注册，与 Nexus IpcRouter 并存；browser 域不走 zod RouteDef / ApiResult 信封（保留 orca 错误体系）。
3. **preload**：`window.api.browser` 段并入现有 `src/preload/index.ts`；guest preload（window.close 守卫）由主进程 will-attach-webview 注入。
4. **i18n**：提供与 orca 同签名的 `translate(key, fallback?)` shim——查中文映射表（从 orca 官方 zh.json 提取 browser 相关 key），未命中返回英文 fallback。迁移代码 168 处调用点零改动，中文文案复用 orca 官方翻译。（实施阶段由原定的"逐点替换中文硬编码"优化为此方案，侵入性更小。）
5. **UI 原语**：orca 组件（Button/Tooltip/DropdownMenu/Dialog 等）映射到 Nexus 已有同类组件（`@nexus/ui` + `components/ui/` 本地 shadcn）；两边均 Tailwind v4，类名风格一致。ProjectPanel 已自带 TooltipProvider。
6. **命名**：partition `persist:orca-browser` → `persist:nexus-browser`；CLI `orca browser` → `nexus browser`；env 变量、socket 路径、skill 文档同步改名；`userData/orca-data.json` → 独立 `userData/nexus-browser-session.json`。
7. **主窗口接线**：`src/main/index.ts` 开 `webviewTag: true`；挂 `will-attach-webview` fail-closed 策略（src 可规范化 + partition 白名单；强制 sandbox/contextIsolation/no-node；注入 window.close 守卫 preload）与 `did-attach-webview` → `browserManager.attachGuestPolicies(guest)`。`validateSender.ts:96` 已有 webview guest 拒绝逻辑，天然衔接。现有 `setWindowOpenHandler` deny + openExternal 仅作用于主窗口，guest 弹窗策略由 orca 的 popup 模块独立处理。
8. **启动序列**：`startApp()` 中在 DbService 之后依次：注册 browser IPC → `initializeBrowserSessionsForApp()`（先 `applyPendingCookieImport()`，必须在首次 `session.fromPartition()` 之前，再水合 profile）→ 拉起 runtime RPC socket 服务（Unix socket + 随机 token，token 写入仅用户可读文件）→ `setAgentBrowserBridge(new AgentBrowserBridge(browserManager, ...))`。
9. **测试基础设施**：Nexus 根项目无 vitest，为迁移过来的 `src/main/browser/*.test.ts` 增加根级 vitest 配置（node 环境，对齐 orca 的测试 setup）。
10. **Electron 43 → 39 回归验证点**：`<webview>` 行为、`webContents.debugger`（CDP）、`session.fromPartition` 持久化、`printToPDF`、`Emulation.setDeviceMetricsOverride`。逐项手工/测试验证，发现问题再针对性修补（属 bug 修复，不算重写）。

## 5. 数据流与启动序列

**打开浏览器标签**：ProjectPanel「+」→ 浏览器 → `openTab('browser')` → TabContent 渲染 `<BrowserPane worktreeId={sessionId}>` → `ensureBrowserPageWebview()` 创建 `<webview partition="persist:nexus-browser">`（CSS `display:flex;flex:1;width/height:100%`）→ `dom-ready` → `browser:registerGuest(webContentsId)` → BrowserManager 建立 page↔WebContents 映射。

**导航状态**：webview DOM 事件（did-navigate、page-favicon-updated、new-window 等）在渲染层监听并直接更新 zustand；主进程侧事件（下载/权限/弹窗/证书）经 `browser:*` 推送通道回渲染层。

**持久化**：browser slice 变化 → 防抖 → `session:set` IPC → 主进程原子写 `userData/nexus-browser-session.json`（tmp + rename）；下次启动 `hydrateBrowserSession` 恢复标签/历史。cookie/站点存储由 Chromium partition 自行持久化（`userData/Partitions/nexus-browser/`），应用不直接写（导入时除外）。

**cookie 导入**：导入提示/设置页 → `session:detectBrowsers` → 选浏览器与 profile → `importCookiesFromBrowser` → 快照源 Cookies DB（inode/mtime 校验）→ 平台解密（macOS Keychain `security` → PBKDF2 → AES-128-CBC；Linux peanuts/secret-tool；Windows DPAPI → AES-256-GCM）→ staged → 原子换入 partition 目录（必要时下次启动 `applyPendingCookieImport` 重放）。

**主→渲染反向建 tab**：CLI/runtime 要建 tab 时发 `browser:requestTabCreate`，渲染层建好后回 `browser:tabCreateReply`，主进程 `waitForTabRegistration` 等 guest 注册完成再执行后续命令。要求：agent 通过 CLI 操作浏览器时，目标会话的 ProjectPanel 需处于挂载状态；无挂载渲染层时命令返回明确错误（orca 原有行为保留）。

## 6. 安全骨架（不可裁剪）

- `will-attach-webview` fail-closed：src 必须可规范化、partition 必须在 BrowserSessionRegistry 白名单
- guest webPreferences 强制：sandbox、contextIsolation、禁 node 集成；删除或替换页面自带 preload
- window.close 守卫 preload 注入每个 guest 主世界（普通 tab 禁止页面自关，CLI 建的 tab 才允许）
- `isTrustedBrowserRenderer` IPC 信任边界；`validateSender` 对 webview guest 拒绝 IpcApi
- 弹窗策略 `SAFE_POPUP_WINDOW_OPTIONS` + 带 origin 地址栏的子窗口
- runtime RPC：Unix socket（仅本机）+ 随机 auth token（仅用户可读），CLI 经 env/约定路径获取
- 权限/媒体/WebAuthn/证书挑战按 orca 策略原样保留

## 7. Agent 控制链路

- pi Agent 在 shell 中执行 `nexus browser <cmd>`（goto/back/snapshot/screenshot/click/fill/type/scroll/tab/profile/cookie/storage/console/network 等 ~75 方法）
- CLI 经 Unix socket + token 连主进程 runtime RPC → `AgentBrowserBridge`（每 tab 一个 session，命令按 tab 串行排队，90s 超时、连续 3 次超时重建）→ spawn `agent-browser` 二进制 → 连接 `CdpWsProxy`（loopback HTTP+WS，模拟 CDP endpoint）→ Electron `webContents.debugger` → 操作页面
- Electron 特化直通道保留：文本插入（CDP insertText + DOM.focus 重放）、PDF（原生 printToPDF）、mobile viewport（CDP Emulation）、anti-detection 注入
- CLI 分发：构建 `out/cli/index.js` 随包分发；Agent 会话 shell 环境注入 PATH（CLI 所在目录）+ socket 路径 + token env。接线点在 `AgentSessionService` 起 agent 进程处（实施时确定 env 注入方式）
- skill 文档 `resources/agent/skills/nexus-cli/SKILL.md`：由 orca-cli skill 改名，教 agent 命令用法
- 快照 ref 模型（`@e1`）由 snapshot-engine 产出，agent 凭 ref 点击/填表

## 8. 错误处理

- browser 域沿用 orca `BrowserError` 错误码体系与 IPC 错误返回格式（不接入 Nexus `ApiResult` 信封，避免重写）
- CLI 侧错误经 RPC 原样透传并格式化输出（browser-format.ts）
- 加载失败 overlay、证书挑战 UI、chrome-error:// 轮询等 orca 原机制保留

## 9. 测试

- orca 的全部 `.test.ts` 随源码一并迁移，根级 vitest 配置跑通（node 环境）
- `pnpm typecheck`（node + web 两套）与 `pnpm lint` 必须通过
- 手工验收清单（`pnpm dev`）：
  1. ProjectPanel 打开浏览器标签、输入 URL 导航、前进/后退/刷新
  2. 多标签创建/切换/关闭，关闭 Nexus 重启后按会话恢复
  3. 窗口缩放/侧栏折叠时 webview 尺寸自适应（纯 CSS，无同步代码）
  4. 从本机 Chrome 导入 cookie，访问已登录站点验证登录态
  5. viewport 设备预设切换、页面缩放
  6. 对话中让 agent 用 `nexus browser` 打开页面、snapshot、点击、截图
  7. 反检测：访问 Cloudflare 校验站点观察 Turnstile 表现
  8. Electron 39 回归点（§4.10）逐项验证

## 10. 实施阶段拆分（供实现计划细化）

1. **骨架**：shared/browser 类型 + main/browser 复制 + IPC 注册 + webview 策略 + session 启动序列 + preload
2. **渲染层**：browser slice + browser-pane 组件 + UI 原语映射 + i18n 替换 + ProjectPanel 挂载
3. **持久化恢复**：session:set 落盘 + hydrate
4. **cookie 导入**：导入管线 + 导入提示 UI + 设置页入口
5. **Agent 控制栈**：runtime RPC + CLI 构建 + agent-browser 二进制打包 + AgentBrowserBridge + skill 文档 + agent env 注入
6. **打磨**：设置页浏览器选项、快捷键、grab 标注、anti-detection 与 Electron 39 回归验证

每个阶段以 typecheck + lint + 对应 vitest 通过为完成标准，阶段 5 完成后做端到端手工验收（§9）。
