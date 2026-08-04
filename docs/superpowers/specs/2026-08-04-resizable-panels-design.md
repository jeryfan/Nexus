# 可拉伸边框改造设计：换用 react-resizable-panels

日期：2026-08-04
状态：已批准

## 背景

应用内三处可拉伸边框（左侧边栏、右侧项目面板、面板内文件树）均为手写实现：
`mousedown` + `window` 上挂 `mousemove`/`mouseup` 监听，同一逻辑复制粘贴在三个文件，
没有共享 hook：

- `src/renderer/src/components/shell.tsx` —— 左侧边栏宽度
- `src/renderer/src/features/agent/ProjectPanel.tsx` —— 右侧项目面板宽度
- `src/renderer/src/features/agent/files/explorer/FileTreeDock.tsx` —— 面板内文件树宽度

已知问题：

1. 三处实现不一致：`ProjectPanel`/`FileTreeDock` 有 rAF 合帧，`shell.tsx` 没有，
   每次 mousemove 直写 zustand store，高频重渲染导致拖动卡顿。
2. 拖拽经过内置浏览器 `<webview>`（独立渲染进程）时事件被 guest 吞掉，拖拽失灵。
3. mouse 事件无 pointer capture：mouseup 发生在窗口外时拖拽状态卡住。
4. 宽度不持久化：重启应用后丢失，回到默认值。
5. 无键盘调整、无双击复位；`role="separator"` 只是摆设。

## 方案选型

采用 **react-resizable-panels v4**（npm 最新版 4.12.2），布局状态交给库管理。
已核实 v4 API（发布包类型定义 + 官方 README）：

- 组件：`Group` / `Panel` / `Separator`（v4 改名，shadcn snippet 面向 v2，故不走
  `pnpm dlx shadcn add resizable`，手写薄封装）。
- 尺寸支持像素单位：数字即像素（`minSize={200}` = 200px），现有 MIN/MAX 常量直接复用。
- `Separator` 自带键盘方向键调整（WAI-ARIA）与双击复位到默认尺寸。
- 库在拖拽时自行管理光标样式，并内置 `setPointerCapture`。
- `useDefaultLayout({ id, onlySaveAfterUserInteractions })` 提供布局持久化
  （localStorage），替代 v2 的 autoSaveId。
- `Panel` 支持 `collapsible`、`panelRef.collapse()/expand()` 命令式 API、
  `groupResizeBehavior="preserve-pixel-size"`（窗口缩放时保持像素宽度）。

## 依赖与组件层

- `react-resizable-panels@^4.12.2` 装入 **devDependencies**（渲染层依赖随 Vite
  打包，遵守项目依赖放置约定）。
- 新增 `src/renderer/src/components/ui/resizable.tsx`：`Group`/`Panel`/`Separator`
  的薄封装，样式沿用 shadcn 风格（1px 高亮线 + 宽命中热区，`data-separator`
  hover/active 状态）。

## 三处改造点

| 位置 | Group id | 面板约束（复用现 store 常量） |
|---|---|---|
| `shell.tsx` 左侧边栏 | `nexus-shell` | 默认 260px，min 200 / max 480，`collapsible` |
| `AgentPage` 对话区 + 项目面板 | `nexus-agent-page` | 面板默认 320px，min 240 / max 640 |
| `ProjectPanel` 内文件树 + 标签区（嵌套 Group） | `nexus-project-panel` | 树默认 144px，min 120 / max 480 |

- 折叠/展开、open/maximized/treeVisible 等**开关标志保留在 zustand**，通过
  `panelRef.collapse()/expand()` 命令式驱动；`window-controls.tsx` 读 `collapsed`
  的现有逻辑不变。
- 面板统一 `groupResizeBehavior="preserve-pixel-size"`，保持现有像素语义。
- `maximized` 沿用现策略：卸载对话区 Panel、项目面板占满；v4 支持条件渲染 Panel，
  恢复时布局自动还原。若还原有偏差，用 `useDefaultLayout` 的 `panelIds` 参数显式
  声明布局集。

## webview 吞事件防护

双保险：

1. v4 的 pointer capture 理论上使捕获后的 pointermove 不再被 guest 抢走；
2. 兜底遮罩：`Separator` 封装内 `pointerdown` 置全局 dragging 状态，App 根部渲染
   `fixed inset-0` 透明遮罩（z-index 压在 webview 之上），`pointerup`/`pointercancel`
   移除。键盘调整不触发遮罩。

实施时须在开着内置浏览器标签页的界面实测拖拽验证。

## 状态清理

- 删除 sidebar store 的 `width`/`setWidth`；删除 projectPanel store 的
  `width`/`treeWidth`/`setWidth`/`setTreeWidth`。`SIDEBAR_MIN/MAX_WIDTH`、
  `PANEL_MIN/MAX_WIDTH`、`TREE_MIN/MAX_WIDTH` 常量保留，改作 Panel 约束；
  现为模块私有的三个默认宽度常量（260/320/144）改为导出，供 Panel `defaultSize` 使用。
- 删除三处手写 `startResize` 与 `document.body.style.cursor` 操作。
- 引用被删字段的现有 vitest 同步更新。

## 持久化

每个 Group 接 `useDefaultLayout({ id, onlySaveAfterUserInteractions: true })`，
布局存 localStorage。附带修复：重启应用后宽度不再丢失。

## 取舍

- **折叠动画消失**：现 shell 折叠有 200ms width 过渡，库无内置动画，折叠变为瞬时
  （与 VSCode 行为一致）。接受，不自造动画。
- 双击复位为库默认行为，保留（如需关闭可用 `disableDoubleClick`）。

## 验证

- `pnpm typecheck && pnpm lint && pnpm test` 全绿。
- dev 模式手工验证：三处拖拽流畅；拖过内置浏览器 webview 不断连；重启后宽度保留；
  键盘方向键调整；双击复位；边栏折叠/展开切换；项目面板最大化/还原后布局恢复。
