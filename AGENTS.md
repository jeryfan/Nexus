# Nexus

桌面 Agent 应用：以 `@earendil-works/pi-coding-agent` 为 Agent 运行时的 Electron 客户端，对标 Codex / WorkBuddy。Agent 会话运行在主进程，渲染层负责会话 UI 与提供商/模型/插件配置管理。

## 工具链（版本已锁定，不要随意升级）

- **Node.js 24.14.1**：由 `.nvmrc` / `.node-version` 锁定（fnm/nvm/asdf/mise 均可识别）
- **pnpm 11.17.0**：由 `package.json` 的 `packageManager` 字段锁定，corepack 自动切换
- electron-vite 5 / Electron 39 / React 19 / TypeScript 5.9 / **Vite 8**
- 注：electron-vite 5.0.0 官方 peer 声明仅到 vite ^7，vite 8 为显式超前使用，已在 `pnpm-workspace.yaml` 的 `peerDependencyRules` 中声明；升级 electron-vite 后应移除此例外

## 常用命令

```bash
pnpm dev          # 开发模式（Vite HMR + Electron 窗口）
pnpm build        # 类型检查 + 构建到 out/
pnpm typecheck    # 仅类型检查（node + web 两套 tsconfig）
pnpm lint         # Oxlint
pnpm format       # Prettier
pnpm build:mac    # 打包 macOS 安装包（另有 build:win / build:linux / build:unpack）

# workspace 包（packages/* 自带 vitest / tsdown，按需执行）
pnpm --filter @nexus/provider-registry generate   # 重新生成 resources/provider/ 注册表产物
pnpm --filter @nexus/ui storybook                 # 组件库 Storybook（:6006）
pnpm --filter <包名> test                          # 跑某个包的 vitest
```

## 仓库结构（pnpm monorepo）

```
packages/aiCore            @nexus/ai-core —— 基于 Vercel AI SDK 6 的统一模型接口
packages/ai-sdk-provider   @nexus/ai-sdk-provider —— AI SDK provider 补充实现
packages/provider-registry @nexus/provider-registry —— Provider/Model 注册表（含图标/推理配置）
packages/ui                @nexus/ui —— React 组件库（主题 tokens、图标生成脚本、Storybook）
```

**源码消费约定**：`electron.vite.config.ts` 与两套 tsconfig 把 `@nexus/*` alias 到 `packages/*/src`，主/渲染进程直接引用源码、随 electron-vite 一起构建，**无需先构建 packages**，改动即时生效。packages 里的 `dist/` 构建与 `react-native` 出口仅服务于未来的独立发布，桌面端不消费。

## 进程架构

```
src/main/       Electron 主进程（Node 环境，可用 Node API）
  agent/        pi-coding-agent 集成层：AgentSessionService（会话生命周期）、PiLoader（动态加载 pi 模块）、
                AgentEventBridge + broadcast（agent 事件推送渲染层）、ModelRuntimeService、
                McpConfigService、WorkspaceService、ArtifactService、TitleSummarizer、
                AgentResourceService（读取 resources/agent）
  ai/           AiService + provider factory：非 agent 场景的模型调用（设置页连通性检查、标题总结等），
                含 dashscope / newapi 等 custom provider
  data/         better-sqlite3 + drizzle-orm（DbService / schemas / seeding）、CacheService、DataApiService
  ipc/          IpcRouter + handlers + nativeCommandMenu
  core/         application（@application）、lifecycle、logger（@logger）、security、platform
src/preload/    预加载脚本（contextBridge 暴露受控 API 给渲染进程）
src/renderer/   React 渲染进程（浏览器环境，禁止直接用 Node API）
  src/features/agent/   Agent 会话 UI：PiRuntimeAdapter 把主进程 agent 事件接入 React
                        （eventReducer / converters），AgentThread / AgentSidebar / ProjectPanel 等
  src/pages/settings/   ProviderSettings（提供商与模型）、PluginSettings（MCP / pi 包 / Skills）
  src/stores/           zustand 按领域拆分：sidebar、navigation、projectPanel、fileExplorer、
                        agentMcp / agentPackages / agentSkills
  src/components/       ui/（shadcn 本地组件）、assistant-ui/（聊天组件）、command/、popups/ 等
src/shared/     三进程共享契约：IpcChannel.ts、agent/（api / schemas / types）、ai/、data/、fs/、
                shell/、跨平台路径工具（WSL、VSCode Remote SSH、Windows batch spawn）
resources/agent/    随包分发的 agent 资源（extraResources）：prompts/*.md 追加 pi 系统提示词
                    （按文件名排序拼接，新增 .md 即生效）、builtin-packages.json 内置 pi 包钉版清单
                    —— 详见其 README
resources/provider/ @nexus/provider-registry 的生成产物，禁止手改（见其 README）
out/            构建产物（勿提交）
build/          electron-builder 配置资源
```

## 项目约定

1. **pi-coding-agent 集成**
   - 仅主进程 import pi；渲染层经 `PiRuntimeAdapter` + IPC 与 agent 交互，不直接依赖 pi。
   - 通过 pnpm patch 定制（`patches/@earendil-works__pi-coding-agent@0.83.0.patch`）：`piConfig.name = "nexus"`、`configDir = ".nexus"`（用户级配置目录 `~/.nexus`）。升级 pi 版本必须同步重建 patch 并更新 `pnpm-workspace.yaml` 的 `patchedDependencies`。
   - 内置 pi 包钉版在 `resources/agent/builtin-packages.json`，升级节奏由 Nexus 发版控制。
2. **主进程与渲染进程通信**：渲染进程需要系统能力时，一律在 preload 中通过 `contextBridge` 暴露最小 API，不开 `nodeIntegration`，保持 `contextIsolation` 默认开启。IPC 通道名统一定义在 `src/shared/IpcChannel.ts`。
3. **依赖放置**：根 `dependencies` 只放主进程运行时依赖（pi-coding-agent、better-sqlite3、@electron-toolkit/*）——electron.vite 将它们 external 并随 app 分发 node_modules；渲染层依赖（react / radix-ui / zustand 等经 Vite 打包进产物的库）一律装 `devDependencies`。
4. **类型检查分两套**：`tsconfig.node.json`（main/preload）与 `tsconfig.web.json`（renderer），新增目录时确认被正确的 tsconfig 覆盖。路径别名在 `electron.vite.config.ts`、两套 tsconfig、`components.json` 多处同步，新增别名需全部更新。
5. **原生依赖**：添加 native 模块前，先在 `pnpm-workspace.yaml` 的 `allowBuilds` 中显式允许其构建脚本（pnpm 11 默认全部拦截），并确认 electron-builder rebuild 兼容。
6. **pnpm 11 注意**：`package.json` 的 `pnpm.*` 字段已不被读取，所有 pnpm 配置写在 `pnpm-workspace.yaml`（`allowBuilds` / `patchedDependencies` / `peerDependencyRules`）。
7. **生成产物禁手改**：`resources/provider/*.json` 由 `pnpm --filter @nexus/provider-registry generate` 产出，维护入口在 `packages/provider-registry/src/`（creators/providers）。
8. 变更工具链版本（Node/pnpm/Electron 大版本）前先在 issue 或对话中说明理由。

## 接口规范

接口契约集中在 `src/shared/`，以类型 + zod schema 表达，本文件即规范入口（仓库内无独立 SPEC/docs 文档，注释不要引用外部文档路径）：

- **Agent 数据面（PORT）**：`src/shared/agent/api/AgentDataApi.ts` 是渲染层获取/变更 agent 数据的唯一接口。本地实现 `LocalAgentApiService`（IPC → 主进程 → SQLite），未来云端实现（HTTP → 团队后端）复用同一接口；本地专属能力（目录选择、访达显示等）拆在 `LocalCapabilitiesApi`，不进 PORT。
- **统一信封**：服务边界返回值一律 `ApiResult<T>`（`{ code, msg, data }`，见 `src/shared/agent/api/result.ts`）；错误码与 HTTP 语义对齐（200/401/403/404/409/422/500），配套 `ApiError` / `ok()` / `err()` / `unwrap()`；流式事件走 `subscribe*` 通道，不进信封。
- **薄渲染**：查询类接口返回的数据由服务端完成分组/排序/标志位合并，调用方不做二次加工。
- **IPC 路由**：通道名集中在 `src/shared/IpcChannel.ts`（`域:动作` kebab-case）；IpcApi 每条路由须定义 `RouteDef` + zod input schema（校验始终开启），Router 只分发不 catch，错误由传输层统一归一化（见 `src/main/ipc/IpcRouter.ts`）。

## UI 技术选型

- **组件库**：优先使用 `@nexus/ui`（workspace 组件库，Radix 系 + Tailwind CSS v4）；`src/renderer/src/components/ui/` 保留 shadcn 本地组件
  - 添加 shadcn 组件：`pnpm dlx shadcn@latest add <组件名> --yes`（CLI 会把依赖装进 `dependencies`，装完需手动移到 `devDependencies`）
  - 应用层主题 token 在 `src/renderer/src/assets/main.css`（stone 暖灰浅色系，圆角 0.75rem，含 dark 变量）；组件库主题在 `packages/ui/src/styles/`（`theme:build` 生成），两处不要混改
- **图标库**：lucide-react（另有 `@nexus/ui/icons` 的生成图标与提供商 logo）
- **聊天 UI**：assistant-ui（`components/assistant-ui/`）+ streamdown Markdown 渲染
- **状态管理**：zustand（见 `src/renderer/src/stores/`）；服务端/异步数据用 swr
- **路径别名**：`@renderer/*` → `src/renderer/src/*`，`@main/*` / `@shared/*` / `@data/*` / `@logger` 等见上文约定 4

## AI 辅助开发说明

- Electron 官方**未提供** Agent Skills 或 llms.txt（已核实 electron org 全部仓库与 anthropics/skills）。
- pi-coding-agent 的 API 以 `node_modules/@earendil-works/pi-coding-agent` 的类型声明与 `src/main/agent/` 的现有用法为准。
- 本项目相关的工作流约定维护在本文件中；如后续沉淀出可复用的 Electron 调试/打包流程，再抽取为 `.pi/skills/` 下的项目级 skill。
