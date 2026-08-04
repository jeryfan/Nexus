# 内置 pi 包离线预打包设计

日期：2026-08-02
状态：已确认（用户批准）

## 背景与问题

Nexus 的「插件」即 pi package（extensions/skills/prompts 资源包）。当前内置包机制是**首启联网 reconcile**：启动时 `AgentResourceService.reconcileBuiltins()` 对每个内置包调 pi 的 `installAndPersist`，pi 内部 spawn **外部 `npm` CLI** 执行 `npm install --prefix ~/.nexus/agent/npm`。

问题：

1. 目标用户是非开发人员，客户端机器上**没有 `npm`/`git`**，联网 reconcile 必然失败；
2. 即使能装，首次启动也强依赖可访问 npm registry，离线/弱网环境内置包不可用；
3. 内置包目前只有 `pi-mcp-adapter`，需要扩充能力。

## 目标

- 内置包扩到三个（全部钉版，维护在 `resources/agent/builtin-packages.json`）：
  - `pi-mcp-adapter@2.17.0`（MCP 桥接，现有）
  - `pi-web-access@0.17.1`（网页搜索/抓取/PDF/视频理解）
  - `pi-subagents@0.40.0`（子代理委派）
- 三个包的**完整 node_modules 依赖树随安装包分发**，用户装完即用，首次启动**零网络请求**。
- 现有 UI 零改动：内置包开关、安装状态、失败重试、Skills 页自动列出包内 skills，全部沿用。

## 非目标（本期不做，设计上不堵死）

- 在线安装（预留方向：内嵌 npm CLI + `ELECTRON_RUN_AS_NODE`，pi 的 `npmCommand` 指向它；git 来源需 isomorphic-git 或 patch pi）
- MCP server 预置、独立 Skills 分发
- 体积深度优化（esbuild 把扩展打成单文件，预计可砍到 ~10-20MB，需验证 pi 的 jiti 加载兼容性）

## 关键事实（已验证）

- pi 安装机制：`installAndPersist` = 写 `settings.json` 的 `packages` 数组 + spawn 外部 `npm install --prefix ~/.nexus/agent/npm --legacy-peer-deps`；pi 自身无下载/解压能力。
- pi 的 `PackageManager` 接口有 **`addSourceToSettings(source)`**：只登记不安装——离线落位的关键 API。
- npm install 必须带 `--legacy-peer-deps`（与 pi 内部一致）：`pi-subagents` 的 peerDependencies 声明了 `@earendil-works/pi-coding-agent` 等，不带该参数 npm 会自动把 172MB 的 pi-coding-agent 拽进来（总树 428MB）；带上后为 **133MB / 211 包**（macOS arm64 口径）。
- 依赖树含**平台原生二进制**：`recheck`（macOS arm64 变体 27MB + `recheck-jar` Java fallback 23MB）、`@napi-rs/keyring` 平台变体。npm 只安装当前平台的变体 → **预装树必须按目标平台分别生成**，生成脚本必须挂在打包流程里（per-platform）。N-API 二进制 ABI 稳定，Electron 内可直接加载，无需 rebuild。
- 运行时落位（沿用现状）：`~/.nexus/agent/npm/node_modules/<包名>`，`settings.json` 登记 `npm:<名>@<版本>`；pi 的 resolve/enable 过滤/update 跳过逻辑全部以此为准。
- `electron-builder.yml` 现状：`extraResources` 已把 `resources/agent → agent` 整目录映射；`asarUnpack` 已覆盖 `resources/**`。

## 总体架构

```
构建时（打包机，per-platform）                运行时（用户机器）
┌─────────────────────────────┐      ┌──────────────────────────────┐
│ scripts/build-agent-        │      │ AgentResourceService          │
│ builtins.mjs                │      │  reconcileBuiltins()          │
│  1. 读 builtin-packages.json│      │   版本不符/缺失 → 从          │
│  2. npm install --prefix    │ 打   │   resources/agent/npm 拷贝    │
│     (临时目录, --omit=dev   │ 包   │   到 ~/.nexus/agent/npm       │
│     --legacy-peer-deps)     │ ───▶ │   （临时目录+rename 原子化）  │
│  3. 剪枝 .bin/文档/测试/    │      │   → addSourceToSettings 登记  │
│     sourcemap               │      │   → reloadAll + 广播          │
│  4. 产物写 resources/agent/ │      │   全程无网络调用              │
│     npm/ + manifest.json    │      │                              │
└─────────────────────────────┘      └──────────────────────────────┘
```

## 构建时生成脚本

新增 `scripts/build-agent-builtins.mjs`（根 `package.json` 加 `agent:builtins` script）：

1. 以 `resources/agent/builtin-packages.json` 为唯一版本源，解析出 `npm:<name>@<version>` 列表；
2. 在临时目录执行 `npm install --prefix <tmp> <specs...> --omit=dev --legacy-peer-deps --no-audit --no-fund`；
3. 把 `node_modules` 整体拷入 `resources/agent/npm/`；
4. 生成 `resources/agent/npm/manifest.json`：顶层目录清单、每个内置包 name@version、生成平台（os/arch）；
5. 剪枝：删 `.bin`（含符号链接，Windows 打包会出问题）、`*.md`、`test`/`__tests__`、`*.map`、`LICENSE`/`CHANGELOG` 等；`recheck-jar`（23MB Java fallback，用户机器无 JVM 用不上）列入剪枝候选，**前提是验证 recheck 加载路径不硬引用它，验证不过则保留**。

分发与版本管理：

- 挂 electron-builder `beforePack` 钩子，`build:mac`/`build:win`/`build:linux` 各自在打包机上生成对应平台的树；
- `resources/agent/npm/` 加入 `.gitignore`（~100MB 不进 git）；
- 开发模式同样需要：clone/pull 后或 `builtin-packages.json` 变更后手动跑一次 `pnpm agent:builtins`（写进 README 与 AGENTS.md）；
- 可复现性：靠 builtin-packages.json 钉版 + npm 解析，与现状 reconcile 语义同级，接受。

## 运行时 reconcile 改造（`src/main/agent/AgentResourceService.ts`）

`reconcileBuiltins()` 判定逻辑不变（`listConfiguredPackages()` 比对 source 串，含钉版，不一致即换装），将 `pm.installAndPersist(def.source)` 替换为离线拷贝：

1. 产物目录结构镜像目标位置：`resources/agent/npm/node_modules/<顶层目录>` ↔ `~/.nexus/agent/npm/node_modules/<顶层目录>`，manifest 在 `resources/agent/npm/manifest.json`；
2. 按 manifest 把顶层目录逐个落到 `~/.nexus/agent/npm/node_modules/`：先删目标目录，再拷到同级临时目录后 `rename`，保证原子性（半成品不会被 pi resolve 到）；
3. 旧版本残留清理：以 agentDir 侧上次成功应用的 manifest（拷贝全部成功后写到 `~/.nexus/agent/npm/manifest.applied.json`）为准，在其中但不在新 manifest 的顶层目录删除；
4. 拷贝成功后 `pm.addSourceToSettings(def.source)` 登记（不触发安装）；
5. 全部完成后 `reloadAll()` + 广播 `agent.package.changed`（沿用现有）。

错误处理：

- 任一拷贝失败 → `builtinStatus = failed` + error，**不登记 source**（pi 的 resolve 不会尝试联网补装）；
- UI 重试沿用现有 `retryBuiltinReconcile`（设置页内置包行的重试按钮）；
- 磁盘空间不足等 fs 错误原样进 `builtinError` 展示。

不变的部分：enable/disable（`filterDisabledBuiltinExtensions` 按安装路径前缀过滤）、`listPackages` 占位合成、`packageSmoke` 之外的全部 IPC 与 shared 契约、渲染层。

## 体积

- 预装树 133MB（macOS arm64），剪枝后预估 80-100MB，安装包下载增量约 40-50MB（压缩后）。接受为首发代价。
- 后续优化项：esbuild 单文件化（见非目标）。

## 变更文件清单

- 新增：`scripts/build-agent-builtins.mjs`；构建产物 `resources/agent/npm/`（gitignored）
- 修改：
  - `resources/agent/builtin-packages.json` —— 加 `pi-web-access` / `pi-subagents`
  - `src/main/agent/AgentResourceService.ts` —— reconcile 离线化
  - `electron-builder.yml` —— `beforePack` 钩子
  - `package.json` —— `agent:builtins` script
  - `src/main/agent/packageSmoke.ts` —— 冒烟改离线语义（断言拷贝落位 + 加载成功，不再依赖 npm registry）
  - `resources/agent/README.md`、`AGENTS.md` —— 同步约定
  - `.gitignore` —— `resources/agent/npm/`
- 不改：`src/shared/agent/**`、IPC 路由、渲染层全部代码

## 测试

- 单测（若主进程已有测试基建则沿用，否则以冒烟为主）：
  - manifest 解析与目录集合运算（新增/覆盖/删除）；
  - reconcile 离线路径：缺失 → 拷贝 + 登记；版本一致 → 跳过；版本不符 → 覆盖换装；拷贝失败 → failed 且不登记。
- 冒烟：`NEXUS_PACKAGE_SMOKE=1` 在无网络环境（断网或屏蔽 registry）跑通，三个包 `builtinStatus=ok` 且 skills/extensions 出现在 loader 结果里。
- 手工：macOS 打包安装验证；Windows/Linux 以 CI 或有条件时验证（重点是 recheck / keyring 平台二进制是否正确落位）。
