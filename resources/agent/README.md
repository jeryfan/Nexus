# agent/

Nexus 自有的 agent 资源，随应用分发（electron-builder `extraResources` 映射到 `<resources>/agent`），由 `AgentResourceService` 在运行时读取（`application.getPath('resources.agent', ...)`）。

- `prompts/*.md` — 追加到 pi 系统提示词的规则文本（`DefaultResourceLoader` 的 `appendSystemPrompt`，按文件名排序拼接）。新增 `.md` 文件即生效（新建会话的 loader 创建时扫描），无需改代码。
- `builtin-packages.json` — 内置 pi 包清单，`[{ "id", "source" }]`，钉版（`@version`）使 pi 的 update 跳过它们：升级节奏由 Nexus 发版控制（改这里的 source 发新版，启动 reconcile 检测不一致即原位换装）。

注意：`resources/provider/` 下的 JSON 是生成产物，禁止手改（见其 README）。
