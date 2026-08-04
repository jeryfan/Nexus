# agent/

Nexus 自有的 agent 资源，随应用分发（electron-builder `extraResources` 映射到 `<resources>/agent`），由 `AgentResourceService` 在运行时读取（`application.getPath('resources.agent', ...)`）。

- `prompts/*.md` — 追加到 pi 系统提示词的规则文本（`DefaultResourceLoader` 的 `appendSystemPrompt`，按文件名排序拼接）。新增 `.md` 文件即生效（新建会话的 loader 创建时扫描），无需改代码。
- `skills/<name>/SKILL.md` — 随包分发的内置 pi 技能（`DefaultResourceLoader` 的 `additionalSkillPaths`，pi 按 SKILL.md 递归发现）。设置页技能列表标注「内置」，可启用/禁用。现有：`nexus-cli`（教 agent 用 `nexus` CLI 控制内置浏览器，见 `src/main/browser/browser-cli-env.ts` 的 env 注入）。
- `builtin-packages.json` — 内置 pi 包清单，`[{ "id", "source" }]`，仅支持钉版的 `npm:<name>@<version>` 来源：升级节奏由 Nexus 发版控制（改版本发新版，启动 reconcile 检测不一致即整树换装）。
- `npm/` — 内置包预装树（`pnpm agent:builtins` 生成，**勿提交、勿手改**，已 gitignore；其中 `package-lock.json` 例外，提交以保证可复现）。构建机在当前平台执行 `npm install`（`--omit=dev --legacy-peer-deps`）后剪枝产出，含平台原生二进制（recheck、@napi-rs/keyring）；`manifest.json` 记录顶层目录清单，供运行时增量清理旧版本残留。electron-builder `beforePack` 打包时自动生成对应平台的树；本地开发在 clone/pull 或 `builtin-packages.json` 变更后需手动跑一次 `pnpm agent:builtins`，否则启动时内置包 reconcile 报「预装树缺失」。

运行时语义：启动时 `AgentResourceService` 把预装树逐目录原子拷贝到 `~/.nexus/agent/npm/node_modules/`，再用 `addSourceToSettings` 登记 source，全程离线（不经 npm/git/网络）。已知限制：用户自行安装的包与内置包共享同一 node_modules 顶层命名空间（如 `zod`），npm reify 与离线同步以 last-write-wins 互相覆盖顶层同名依赖；内置树在用户包操作后由 `repairBuiltinTree` 即时修复。

注意：`resources/provider/` 下的 JSON 是生成产物，禁止手改（见其 README）。
