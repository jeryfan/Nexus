# Nexus

桌面端应用，基于 electron-vite + React + TypeScript。移动端暂缓。

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
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm build:mac    # 打包 macOS 安装包（另有 build:win / build:linux）
```

## 目录结构

```
src/main/       Electron 主进程（Node 环境，可用 Node API）
src/preload/    预加载脚本（contextBridge 暴露受控 API 给渲染进程）
src/renderer/   React 渲染进程（浏览器环境，禁止直接用 Node API）
out/            构建产物（勿提交）
resources/      打包资源（图标等）
build/          electron-builder 配置资源
```

## 项目约定

1. **主进程与渲染进程通信**：渲染进程需要系统能力时，一律在 preload 中通过 `contextBridge` 暴露最小 API，不开 `nodeIntegration`，保持 `contextIsolation` 默认开启。
2. **类型检查分两套**：`tsconfig.node.json`（main/preload）与 `tsconfig.web.json`（renderer），新增目录时确认被正确的 tsconfig 覆盖。
3. **原生依赖**：添加 native 模块前，先在 `pnpm-workspace.yaml` 的 `allowBuilds` 中显式允许其构建脚本（pnpm 11 默认全部拦截），并确认 electron-builder rebuild 兼容。
4. **pnpm 11 注意**：`package.json` 的 `pnpm.*` 字段已不被读取，所有 pnpm 配置写在 `pnpm-workspace.yaml`。
5. 变更工具链版本（Node/pnpm/Electron 大版本）前先在 issue 或对话中说明理由。

## AI 辅助开发说明

- Electron 官方**未提供** Agent Skills 或 llms.txt（已核实 electron org 全部仓库与 anthropics/skills）。
- 本项目相关的工作流约定维护在本文件中；如后续沉淀出可复用的 Electron 调试/打包流程，再抽取为 `.pi/skills/` 下的项目级 skill。
