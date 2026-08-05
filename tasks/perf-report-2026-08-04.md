# Nexus 桌面端性能分析报告

**项目：** Nexus（Electron 39 / React 19 / pi-coding-agent / better-sqlite3 + drizzle-orm）
**范围：** 全项目，性能视角（主进程启动与数据层、Agent 事件管线、渲染层 UI、内置浏览器域）
**日期：** 2026-08-04
**方法：** 静态代码分析（4 路并行探索），所有结论附 file:line 证据；未做运行时 profiling，标注的优化收益为机制推断，落地前建议用 Profiler 实测确认

---

## Executive Summary

Nexus 的整体工程基础健康：IPC 事件通道绕开了 zod 校验、swr 配置合理、主流程的订阅清理成对、DB 索引覆盖良好、浏览器 store 的高频更新已有防抖门控。**性能风险高度集中在 Agent 流式输出这条最热路径上**，且存在两处随消息长度平方增长（O(n²)）的实锤：

1. `convertMessage` 回调身份每批事件必变，导致 assistant-ui 丢弃整个消息转换缓存、对**全部历史消息**重转换；
2. `message_update` 事件载荷携带**双份累积全文**，structured clone 成本随消息增长线性、整回合平方。

叠加渲染层「react-markdown 每次提交全量重解析」与「侧栏订阅整个 sessionStates 导致 20Hz 全量重渲染」，**长会话流式输出时的卡顿是当前最可感知的性能问题**。次要风险在启动关键路径的同步阻塞、provider registry 的 30s 过期重载、以及内置浏览器域「所有 guest 禁用后台节流且无驱逐」带来的多标签内存/CPU 无界增长。

Top 5 关键问题（详见下文）：

| # | 问题 | 严重度 | 改动成本 |
|---|------|--------|----------|
| P0-1 | convertMessage 身份不稳定 → 每批全量重转换 O(n²) | 🔴 高 | 小 |
| P0-2 | 事件载荷双份累积全文 → IPC 序列化 O(n²) | 🔴 高 | 极小 |
| P0-3 | 流式 markdown 全量重解析（且实际未用 streamdown） | 🔴 高 | 中 |
| P0-4 | 流式期间侧栏全体会话行 20Hz 重渲染 | 🔴 高 | 小 |
| P0-5 | 浏览器 guest 禁后台节流 + 驱逐机制未接线 | 🔴 高 | 小 |

---

## 一、Agent 流式事件管线（最热路径）

数据流：pi agent-loop 每个 delta 发 `message_update`（携带完整累积消息）→ `AgentEventBridge` 50ms 窗口合帧（约 20 批/秒，设计正确）→ 逐窗口 `webContents.send` → 渲染层 `agentStore.applyEventBatch` → `applyAgentEvents` reducer → `usePiRuntime` 经 `convertMessage` 转 assistant-ui 消息渲染。

### 🔴 P0-1 convertMessage 身份每批变化，全量消息重转换（O(n²)）

- **位置：** `src/renderer/src/features/agent/PiRuntimeAdapter.tsx:53-76`；assistant-ui core `external-store-thread-runtime-core.js:122`
- **证据：** `convertMessage` 的 `useCallback` 依赖 `toolResults`/`toolJoin`，而 `toolResults = useMemo(() => indexToolResults(allMessages), [allMessages])` 每批事件都产生新 Map → `convertMessage` 身份每批必变。assistant-ui core 检测到 `convertMessage` 引用变化即 `new ThreadMessageConverter()`，WeakMap 转换缓存全部丢弃，随后对**所有消息**重新执行转换。
- **机制：** 每 50ms 一批 × 每批 O(全部消息内容) = 长会话流式整体 O(n²)，并引发全消息列表 React diff。这是管线中最大的单点开销。
- **优化：** 稳定 `convertMessage` 身份——`toolResults`/`toolJoin` 不进闭包（用稳定 ref 容器，或在消息对象上预合并后再喂入）。小改动，直接消除 O(n²)。

### 🔴 P0-2 message_update 载荷携带双份累积全文

- **位置：** `src/shared/agent/types.ts:124-128`、`src/main/agent/AgentEventBridge.ts:61`、`src/renderer/src/features/agent/eventReducer.ts:57-60`
- **证据：** DTO 同时带 `message`（完整累积消息）和 `assistantMessageEvent`（其 `partial` 字段是同一累积文本的第二份拷贝）；reducer 只消费 `event.message`，`assistantMessageEvent` 从未被读取。
- **机制：** 每次 flush（≥20 次/秒/流式会话/每窗口）structured clone 约 2× 累积文本，单事件 O(n)、整回合 O(n²)，主进程序列化与渲染层反序列化双侧付费。
- **优化：** bridge forward 时裁掉 `assistantMessageEvent`（bridge 是唯一映射点，约一行改动）。同理 `agent_end.messages`（本轮全部新消息，含大 toolResult）reducer 只用 `willRetry`，可一并裁剪（`types.ts:119`、`eventReducer.ts:50-52`）。

### 🟡 P1-6 reducer 逐事件 O(n) 数组拷贝 + 全表 findIndex

- **位置：** `src/renderer/src/features/agent/eventReducer.ts:26-32,61-66`
- **证据：** `upsertMessage` 用 `findIndex`（流式消息恒在尾部却全表扫）+ `[...messages]` 整数组复制；`turn_end` 对 K 个 toolResult 循环调用 upsert，即 K 次 O(n) 拷贝。
- **优化：** 从尾部反向查找，或消息按 timestamp 建 Map 索引；与 P0-1 叠加放大，优先级随之。

### 🟡 P1-7 渲染层会话状态无限保留 + 历史全量加载无分页

- **位置：** `src/renderer/src/stores/agentStore.ts:34,210-226`；`src/main/agent/AgentSessionService.ts:321-337`
- **证据：** `sessionStates` 仅在删除会话时清条目，打开过的每个会话全量消息常驻渲染层内存（主进程有 `MAX_LIVE_SESSIONS=10` 驱逐，渲染层无对应上限）；`openSession` 一次性返回完整消息，`snapshot` 还把 `toMessageDtos` 算了两次（`:324/:333`）。
- **优化：** 渲染层对非激活会话状态做 LRU 驱逐；历史消息分页/懒加载；修掉 snapshot 的重复转换。

### 🟡 P1-8 全窗口无差别广播，后台会话事件无人消费却全额付费

- **位置：** `src/main/agent/AgentEventBridge.ts:127-134`；`src/renderer/src/stores/agentStore.ts:300-306`
- **证据：** `send` 遍历 `BrowserWindow.getAllWindows()` 全部发送；渲染层对任意 sessionId 应用批次，`?? EMPTY_SESSION_STATE` 会为当前窗口从未打开的会话凭空创建并持续维护状态副本。
- **机制：** N 窗口 × M 并发流式会话的乘积开销。
- **优化：** 按窗口订阅的会话集合过滤发送（主进程维护订阅表），或渲染侧直接丢弃未打开会话的批次（改动更小）。

### ✅ 已验证无问题

- 事件通道直发 `webContents.send`，不经 IpcRouter，无 zod 热路径开销（`IpcApiService.ts:44-45`）。
- 订阅清理成对：主进程 subscribe/unsubscribe（`AgentSessionService.ts:149,240,314`）、evict/delete 均 `bridge.detach`；渲染层有初始化守卫。
- 50ms 合帧窗口 + 按 key 就地替换的设计正确，IPC 频率已压到约 20 批/秒。

---

## 二、渲染层 UI

整体状况：zustand 选择器整体质量良好（未发现无选择器订阅或漏 shallow 的对象选择器）、swr 无轮询、tanstack 虚拟化已用在文件树与模型列表。热点集中在流式路径与侧栏扇出。

### 🔴 P0-3 流式 markdown 每次提交全量重解析

- **位置：** `src/renderer/src/components/assistant-ui/markdown-text.tsx:60-69`
- **证据：** `MarkdownTextPrimitive` 内部是 `<ReactMarkdown children={resolvedText}>`；`useSmooth` 的 TextStreamAnimator 以 rAF 按字符节奏提交（`DEFAULT_MAX_CHAR_INTERVAL_MS=5`），`defer` 仅 `useDeferredValue` 降优先级。react-markdown 无增量解析：每次提交全量重解析累积文本并重建子树，单条消息总成本随长度平方增长。长代码块/表格流式时的掉帧主要来源于此。
- **注：** AGENTS.md 记载「streamdown Markdown 渲染」，但聊天实际走 react-markdown；streamdown 仅用于 `@nexus/ui` 的文件预览（`FilePreviewPanel.tsx:19`）。文档与实现不符，建议一并修正。
- **优化：** 聊天文本切换到 streamdown（其设计目标即流式增量渲染），或至少提高 smooth 提交批粒度、对非流式消息走 memo 化静态渲染。

### 🔴 P0-4 流式期间整个侧栏 20Hz 全量重渲染

- **位置：** `src/renderer/src/features/agent/AgentSidebar.tsx:70`、`SessionRow:279,285`；`src/renderer/src/stores/agentStore.ts:300-306`
- **证据：** `AgentSidebar` 与每个 `SessionRow` 都订阅整个 `sessionStates` 只取 isStreaming 标记 → 任一会话流式时所有会话行以约 20Hz 重渲染；`project.sessions` 无条数上限全量渲染（`:228-234`，仅 chats 有 5 条预览截断）。
- **优化：** store 派生只在实际变化时才变的 `streamingIds` 集合；行内改用返回原始值的细选择器 `s.sessionStates[id]?.isStreaming`；项目会话列表加上限或虚拟化。

### 🟡 P1-9 聊天消息列表未虚拟化

- **位置：** `src/renderer/src/features/agent/AgentThread.tsx:139-158`
- **证据：** `ThreadPrimitive.Viewport` 全量挂载消息（assistant-ui 0.15.1 无虚拟视口）。part 级 memo 存在（流式时主要只重渲末条消息），但长会话 DOM 体量无界。
- **优化：** 长会话历史消息折叠/窗口化（如「仅渲染最近 N 条 + 向上滚动懒加载」）。

### 🟡 P1-10 usePiRuntime 每批重建对象与适配器

- **位置：** `src/renderer/src/features/agent/PiRuntimeAdapter.tsx:41-43,100,103-118`；`converters.ts:42`
- **证据：** 每批事件 hook 全量重跑；每次 render `new SimpleImageAttachmentAdapter()`；threads 数组每次 flatMap 重建；图片消息每次 convert 重拼 base64 data URL。20 次/秒的分配 churn。
- **优化：** adapters 提升为模块级/稳定引用，threadList 用 useMemo；与 P0-1 同批修。

### 🟡 P1-11 面板拖拽 resize 每次 mousemove 写 zustand

- **位置：** `src/renderer/src/features/agent/ProjectPanel.tsx:373-390`；`FileTreeDock.tsx:56`
- **证据：** handleMove 每事件 `setWidth` → 面板子树每 mousemove 重渲（监听器清理正确）。
- **优化：** 拖拽中用本地 state/rAF 节流，mouseup 时一次性提交 store。

### 🔵 P2 项

- **死代码：** `GroupedSortableVirtualList.tsx`（1510 行）+ `GroupedVirtualList` 全仓无消费方；`assistant-ui/thread.tsx`（555 行）、`thread-list.tsx`（297 行）亦未引用。删除可减少维护面与打包体积。
- **CacheService（渲染层）无容量上限**：`data/CacheService.ts:90,108-115` 三层 Map 仅读时惰性清理，persist 全量写单个 localStorage key（350ms debounce）。当前消费方少，风险低。
- **swr 配置已验证健康**：`useDataApi.ts:66-77` 无轮询、dedupingInterval 5000、数据变更走推送。

---

## 三、主进程启动与数据层

### 🔴 P0-7 RegistryLoader 30s 空闲过期后同步重载 ~900KB JSON

- **位置：** `packages/provider-registry/src/registry-loader.ts:56`（DEFAULT_IDLE_TTL_MS=30_000）、`:19-26`、`:249-268`
- **证据：** 缓存空闲 30s 即全量释放，下次访问重新 `readFileSync` models.json(348KB) + provider-models.json(552KB)，zod 全量校验后重建 8 个 Map 索引。调用方遍布热路径：`ModelService.enrichRowsFromRegistry`（`ModelService.ts:472`）、`ProviderService.ts:105-110`。
- **机制：** 用户每次打开设置/模型选择器（距上次访问超 30s）都阻塞主进程事件循环一次。
- **优化：** 去掉或大幅延长 idle TTL（进程级常驻即可，总量 ~1MB）；或启动预热 + 异步重载。

### 🟡 P1-12 启动关键路径的同步阻塞块

启动链（`src/main/index.ts:161-265`）总体合理（AgentService.initialize 已异步化 ✓），但有三处同步块位于首窗口创建之前：

1. **DbService 构造全同步**（`index.ts:184`、`DbService.ts:146-162`）：每次启动 exec 全量 `CREATE TABLE IF NOT EXISTS` DDL + 两次迁移探测（sqlite_master + PRAGMA table_info×2）。→ 用 `user_version` pragma 记录 schema 版本，一次探测跳过 DDL/迁移。
2. **PresetProviderSeeder 同步对账**（`index.ts:199`、`presetProviderSeeder.ts:81-105`）：readFileSync providers.json + zod + 事务对账；且 seeder 自建 RegistryLoader 与 `ProviderRegistryService.ts:488-493` 的实例不共享，providers.json 被解析两遍。→ 共享 loader；registry 版本未变时跳过对账；或移出关键路径。
3. **浏览器会话 cookie 重放**（`index.ts:219` → `browser-session-registry.ts:211-270`）：`copyFileSync` Cookies DB（可达数 MB）+ wal/shm。→ 移到窗口显示后异步执行。

### 🟡 P1-13 AgentSessionStore 每次 mutation 全量重建 + 广播

- **位置：** `src/main/data/services/AgentSessionStore.ts:279-284,58-63`；触发点 `AgentSessionService.ts:286-290`（每轮 agent 结束 `touchSession`）
- **证据：** 任何单行变更后都跑 3 条全表 SELECT 重建 SessionListsDto 并广播到所有窗口。表小单次不贵，但流式对话每轮触发，写放大。
- **优化：** 3 条查询合 1 条 + 广播防抖；或增量广播。

### 🟡 P1-14 /models、/providers 全量返回且逐行 enrich

- **位置：** `src/main/data/services/ModelService.ts:428-457`（`list` 全表 + 逐行 registry lookup，capability 在 JS 侧 post-filter；`rowToRuntimeModel:310` 每行 zod parse reasoning）
- **机制：** 大 payload 跨 IPC + 主进程逐行 normalize CPU；swr revalidate 反复触发。
- **优化：** enrich 结果按 registry 版本缓存；调用方优先走已有的按 provider/分页查询，避免无过滤全量。

### 🔵 P2 项

- `batchUpsert` 事务内逐行 insert（`ModelService.ts:1050-1090`），可改批量 values。
- `listPackages` 逐个 await 读 package.json（`AgentResourceService.ts:152-167`），可 Promise.all。
- 主进程 CacheService 无上限 Map，只写 key 永不回收（`src/main/data/CacheService.ts:12-13`），慢膨胀。
- 索引覆盖良好（user_provider/user_model/agent_project/agent_session 均有复合索引，`DbService.ts:32-110`）；仅 `endpointType` 过滤走 `json_extract` 全扫（`ProviderService.ts:187-189`），表小影响低。
- Logger 纯 console + dev 门控，非问题。

---

## 四、内置浏览器域

架构：网页显示走 `<webview>` tag（每 page 一个 guest，跨标签切换持久保留不卸载以保 SPA 状态）；自动化链路 CLI/agent → Unix socket RPC → AgentBrowserBridge 每命令 `execFile` 启动 agent-browser → 每标签一个 CdpWsProxy（本地 ws → `webContents.debugger`）。

> 维护约定：该域为上游迁移代码，原样保留、仅适配层可改。下列建议区分「Nexus 适配层可做」与「记录在案需上游决策」。

### 🔴 P0-5 所有 guest 禁用后台节流，且驱逐机制未接线

- **位置：** `src/main/browser/browser-manager.ts:644`（`guest.setBackgroundThrottling(false)`）；`src/renderer/src/stores/browser-webview-cleanup.ts:45`（`destroyWorktreeBrowserGuests` 全仓只有测试调用，生产无接线）；`BrowserPane.tsx:563` 注释要求 inactive webview 常驻
- **机制：** 多标签内存/CPU 随总页数线性增长，后台页 timer/rAF 全速运行，无任何冻结/丢弃策略。长时间多标签使用是最容易内存失控的场景。
- **优化（Nexus 适配层可做）：** 把现成的 `destroyWorktreeBrowserGuests` 接到隐藏 worktree 切换路径；或将 `setBackgroundThrottling(false)` 收窄到「正在被自动化/截图订阅」的标签，其余恢复节流。

### 🟡 P1-15 每标签常驻 CDP debugger + 事件无过滤转发

- **位置：** `browser-manager.ts:287-340`（所有 guest `debugger.attach` + `Page.enable` + 反检测注入，detach 后 500ms 自动 reattach）；`cdp-ws-proxy.ts:237-251,540-546`（全部 CDP 事件 JSON.stringify 转发；每次导航全量 `Network.enable + Page.enable`）
- **机制：** 常驻 instrumentation 有基础开销；自动化期间高请求页面产生 Network.* 事件洪水全部穿越主进程。缓解项：无 client 时直接丢弃。
- **处置：** agent-browser 依赖 network idle 判定，不能简单关闭——记录在案；Nexus 层可评估反检测按 profile/开关启用。

### 🟡 P1-16 其他中低成本项

- **agent-browser 每命令 spawn 进程**（`agent-browser-bridge.ts:2656-2668`，`maxBuffer: 50MB`）：高频自动化时进程创建开销叠加；daemon 常驻不重建，尚可。记录在案。
- **大 payload 穿越主进程**：printToPDF/截图 base64、`browserSnapshot` 整页 DOM 快照走 socket JSON（`nexus-runtime-browser.ts:328`）。单次调用非持续流；如需优化可给 snapshot 走分块/二进制通道（适配层可做）。
- **screencast 默认 `minFrameIntervalMs=0`**（`nexus-runtime-browser.ts:496-505`）：动画页帧率无上限，仅 CLI 订阅时发生。调高默认值属 Nexus 配置层改动，一行。
- **BrowserPane.tsx（3340 行）运行时整体健康**：22 个 store 选择器均按字段取、webview 监听器清理完整；残留小项：250ms 错误页轮询（`:1972`）、grab 标注经 `console-message` 同步逐条 JSON.parse（`:1816`）。文件巨大主要是维护性问题。
- **生命周期清理已验证完整**：`unregisterGuest`（`browser-manager.ts:1040`）、`destroyPersistentWebview`、退出 `destroyAllSessions`、reattachTimer 清理、PDF stream TTL 均在位，未发现泄漏。browser store 持久化已有 150ms 防抖 + 字段级 diff 门控（`session-write-subscriber.ts:58-120`）。

---

## 五、优化路线图

### 立即（本周可做，均为小改动、消除 O(n²)/高频浪费）

1. **稳定 `convertMessage` 身份**（P0-1）：toolResults/toolJoin 移出闭包。— 流式性能最大单点
2. **裁剪事件冗余载荷**（P0-2）：bridge forward 裁掉 `assistantMessageEvent` 与 `agent_end.messages`
3. **侧栏细选择器 + streamingIds 派生**（P0-4）
4. **RegistryLoader 去掉/延长 idle TTL**（P0-7）
5. **浏览器 guest 节流收窄 + 驱逐接线**（P0-5）
6. screencast 默认 `minFrameIntervalMs` 调至 ~100ms（一行配置）

### 短期（1–4 周）

7. **聊天 markdown 切 streamdown**（P0-3）：需验证流式渲染质量与样式一致性；同步修正 AGENTS.md 表述
8. 启动同步块治理（P1-12）：DB `user_version` 快速路径、seeder 共享 loader + 版本跳过、cookie 重放后置异步
9. 渲染层会话状态 LRU 驱逐 + 历史消息分页（P1-7）
10. 事件广播按窗口订阅过滤（P1-8）
11. eventReducer 尾部插入优化 + AgentSessionStore 查询合并/广播防抖（P1-6、P1-13）
12. /models enrich 按 registry 版本缓存（P1-14）

### 中长期（按需）

13. 长会话消息列表窗口化/虚拟化（P1-9，assistant-ui 层需要设计）
14. 删除死代码（GroupedSortableVirtualList、thread.tsx/thread-list.tsx 模板）
15. CacheService 两端加容量上限与 LRU
16. 浏览器域上游记录项跟踪：CDP 事件过滤、反检测可开关、snapshot 二进制通道

---

## 六、验证建议（落地前后）

- **流式路径**：React DevTools Profiler 录制一轮长消息流式，对比修复前后 commit 次数/时长；关注 AgentSidebar、AgentThread 的 render 计数。
- **IPC/序列化**：主进程对 `webContents.send` payload 打点 `structuredClone` 前后字节数，或直接看任务管理器中渲染进程内存曲线。
- **启动**：`app.commandLine.appendSwitch('enable-logging')` + console.time 打点启动链各步骤；或 Electron `--trace-startup`。
- **多标签内存**：任务管理器观察 N 个后台标签的进程内存，验证节流/驱逐生效。

---

## 附：已验证的健康项（勿重复排查）

- 事件通道无 zod 热路径；订阅/监听清理成对（agent 域 + 浏览器域）
- swr 无轮询、去重合理；数据变更走推送
- DB 索引覆盖良好；Logger 无同步写
- browser store 高频更新已有防抖与 diff 门控；文件树/模型列表已用 tanstack 虚拟化且实现质量良好
- AgentService.initialize 已异步化，不阻塞首窗口

---

# 实施记录（2026-08-04 第二轮）

按「最优方案」落地了全部 P0 与大部分 P1，验证：`pnpm typecheck`（node+web）✓、`pnpm lint`（Oxlint 0 问题）✓、`pnpm test` 1295/1295 ✓。

## P0-1 流式重转换 O(n²) → O(delta)
- `PiRuntimeAdapter.tsx`：`convertMessage` 依赖清空（身份恒定），工具上下文经 ref 读取；attachment adapter 提升为模块单例；threads 列表 useMemo。assistant-ui WeakMap 转换缓存从此在流式批次间存活，每批只重转换被 reducer 替换的消息。
- `converters.ts`：常规 assistant 消息不再返回显式 status，交给 runtime auto status 派生（已逐行核对 @assistant-ui/core 的 `auto-status.js` 与 external-store 缓存失效条件：auto 状态变化精确失效受影响消息）；仅 error/aborted 保留显式 incomplete。
- `eventReducer.ts`：`SessionState.toolResults` 由 reducer 增量维护（纯文本 delta 批次身份稳定）；`tool_execution_end` 替换携带该 toolCall 的 assistant 消息身份，精确失效其转换缓存（工具 part 状态/结果随之刷新）；`upsertMessage` 尾部快速路径（流式消息恒在尾部，O(1) 比较）。
- `agentStore.ts`：`openSession` 一次性构建 toolResults；`applyEventBatch` 丢弃本窗口未打开会话的批次（侧栏指示由 meta 驱动，打开时快照 + delta 全量 partial 自愈）。

## P0-2 事件载荷裁剪
- `shared/agent/types.ts`：删除 `AssistantMessageEventDto` 与 `agent_end.messages`（全仓无消费方，已核实）。
- `AgentEventBridge.ts`：新增 `toDto` 重建 message_update/agent_end 载荷——消除「累积文本双份拷贝」与「回合末全量消息（含大 toolResult）」的 structured clone。

## P0-3 流式 Markdown：react-markdown → Streamdown
- `markdown-text.tsx` 重写：Streamdown 块级 memo，流式更新只重解析末尾未闭合块（原先 useSmooth 每次提交全量重解析整段）；`@streamdown/code` Shiki 高亮 + 自带复制控件、`@streamdown/cjk`；保留本地文件链接/内置浏览器链接拦截；Reasoning 面板复用同一组件一并受益。
- 依赖：`streamdown@^2.5.0`、`@streamdown/code@^1.1.1`、`@streamdown/cjk@^1.0.3` 加入根 devDependencies（与 packages/ui 版本一致；`tailwind.css` 的 @source 扫描规则已预置）。

## P0-4 侧栏 20Hz 全量重渲染
- `AgentSidebar.tsx`：`AgentSidebar` 不再订阅 sessionStates；`ProjectSection`/`SessionRow` 改为返回原始布尔的选择器——仅自身流式状态翻转时重渲染。

## P0-5 浏览器域：节流收窄 + 驱逐接线
- 新增 `src/main/browser/guest-frame-lease.ts`（Glue）：引用计数帧租约，持租解除后台节流、租约耗尽恢复；对精简测试 mock 做能力探测降级。
- `electron-debugger-lease.ts`：debugger 租约同步持有/释放帧租约（覆盖 CdpWsProxy 自动化、screencast、agent-browser CDP 三条取帧路径）。
- `browser-manager.ts`：`attachGuestPolicies` 移除全局 `setBackgroundThrottling(false)`（默认恢复 Chromium 节流）；`acquireAutomationVisibility` 全程持有帧租约（覆盖自动化等待 hidden pane 出帧的窗口期），所有 restore 路径释放。
- `browser-webview-cleanup.ts`：新增 `evictBrowserGuestsOverBudget`——接线上游现成的 LRU 预算原语（保留 4 个隐藏 worktree），`isEvictable` 保护自动化可见性租约与进行中下载。
- `stores/browser.ts`：`setActiveWorktreeId` 切换工作区时执行驱逐。
- `browser-manager.test.ts`：3 处断言随行为变更同步（Glue 注释标记）。

## P1 已实施
- `AgentSessionStore.ts`：列表查询 3 条合 2 条（会话单查内存分流）；`emitChanged` 100ms 合帧，连续 mutation 只重建/广播一次。
- `AgentSessionService.ts`：snapshot 的 `toMessageDtos` 去重（此前标题提取与快照各转换一遍全量历史）。
- `registry-loader.ts`：移除 30s 空闲过期（缓存进程级常驻，`invalidate()` 保留）——设置页/模型选择器不再周期性阻塞主进程重载 ~900KB JSON。
- `nexus-runtime-browser.ts`：screencast 默认 `minFrameIntervalMs` 0→100（约 10fps 上限，显式传 0 仍可解除）。
- `AgentResourceService.ts`：`listPackages` 的 package.json 元数据改 Promise.all 并行。
- `ProjectPanel.tsx` / `files/explorer/FileTreeDock.tsx`：拖拽 resize 改 rAF 合帧（每帧最多一次 store 写入）。

## 暂缓（建议后续跟进）
- 启动同步块治理：DB `user_version` 快速路径、Seeder 与 ProviderRegistryService 共享 RegistryLoader、cookie 重放后置异步（绝对耗时小，收益有限，改动触面大）。
- `/models` enrich 按 registry 版本缓存（P0-6 已消除最大头的重载成本，逐行 lookup 已是 O(1) Map 命中）。
- 渲染层 sessionStates LRU 驱逐 + 历史消息分页、长会话消息列表窗口化（需要交互设计配合）。
- 死代码清理：GroupedSortableVirtualList（1510 行）、assistant-ui thread/thread-list 模板。
- 浏览器域上游记录项：CDP 事件过滤、反检测按开关启用、snapshot 二进制通道。

## 风险提示
- P0-1 依赖 assistant-ui auto status 语义（已对 0.3.2 dist 逐行核对）；升级 @assistant-ui 时应复查 external-store 缓存失效条件。
- P0-5 收窄节流后，若发现「隐藏标签截图空白」类回归，优先检查对应取帧路径是否持有帧租约（guest-frame-lease）。
