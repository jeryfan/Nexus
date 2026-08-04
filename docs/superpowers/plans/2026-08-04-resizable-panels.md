# 可拉伸边框换用 react-resizable-panels 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 react-resizable-panels v4 替换三处手写拖拽调宽实现（左侧边栏 / 项目面板 / 文件树），修复卡顿、webview 吞事件、宽度不持久化、无键盘调整等问题。

**Architecture:** 库负责布局与拖拽（像素约束、pointer capture、键盘/双击复位、持久化）；zustand 只保留 collapsed/open/maximized/treeVisible 开关标志，经 panelRef 命令式驱动；全屏透明遮罩防内置浏览器 `<webview>`（独立渲染进程）吞掉拖拽指针事件。

**Tech Stack:** react-resizable-panels@^4.12.2（devDependencies，渲染层随 Vite 打包）、zustand、Tailwind CSS v4、vitest + happy-dom + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-08-04-resizable-panels-design.md`

**背景知识（执行者必读）：**

- react-resizable-panels v4 组件名为 `Group` / `Panel` / `Separator`（不是 v2 的 PanelGroup/PanelResizeHandle）。尺寸传数字即像素；`Panel` 支持 `minSize`/`maxSize`/`defaultSize`/`collapsible`/`groupResizeBehavior="preserve-pixel-size"`/`panelRef`（`collapse()/expand()/isCollapsed()`）/`onResize(size: { asPercentage, inPixels })`；`Separator` 自带 `role="separator"`、方向键调整、双击复位到默认尺寸。
- `useDefaultLayout({ id, onlySaveAfterUserInteractions: true })` 返回 `{ defaultLayout, onLayoutChanged }`，分别接到 `Group` 的 `defaultLayout` / `onLayoutChanged` props，实现 localStorage 持久化。
- `Group` 会覆盖自身的 `display`/`flex-direction`/`overflow` 样式，`className` 可加 `flex-1`/`min-w-0` 等布局类。Panel 与 Separator 必须是 Group 的直接 React 子节点（fragment 会被展开，可以）。
- 项目约定：渲染层依赖装 `devDependencies`；别名 `@renderer/*` → `src/renderer/src/*`；测试文件头部用 `// @vitest-environment happy-dom` 声明 DOM 环境（根 vitest 默认 node 环境）。
- 每个 Task 结束才 commit；commit 只 add 该 Task 列出的文件。

---

### Task 1: 安装依赖，新增 resizable 基础组件（含拖拽遮罩）

**Files:**
- Modify: `package.json`（devDependencies）+ `pnpm-lock.yaml`
- Create: `src/renderer/src/components/ui/resizable.tsx`
- Test: `src/renderer/src/components/ui/resizable.test.tsx`

- [ ] **Step 1: 安装依赖**

```bash
pnpm add -D react-resizable-panels@^4.12.2
```

验证：`pnpm list react-resizable-panels` 输出 4.12.x，且列在 devDependencies。

- [ ] **Step 2: 写失败测试**

创建 `src/renderer/src/components/ui/resizable.test.tsx`：

```tsx
// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ResizeDragOverlay, useResizeDragStore } from './resizable'

afterEach(() => {
  cleanup()
  act(() => useResizeDragStore.getState().end())
})

describe('useResizeDragStore', () => {
  it('begin/end 切换 dragging 状态', () => {
    expect(useResizeDragStore.getState().dragging).toBe(false)
    act(() => useResizeDragStore.getState().begin())
    expect(useResizeDragStore.getState().dragging).toBe(true)
    act(() => useResizeDragStore.getState().end())
    expect(useResizeDragStore.getState().dragging).toBe(false)
  })
})

describe('ResizeDragOverlay', () => {
  it('仅拖拽期间渲染全屏透明遮罩', () => {
    const { container } = render(<ResizeDragOverlay />)
    expect(container.firstChild).toBeNull()
    act(() => useResizeDragStore.getState().begin())
    expect(container.firstChild).not.toBeNull()
    act(() => useResizeDragStore.getState().end())
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run src/renderer/src/components/ui/resizable.test.tsx`
Expected: FAIL（`./resizable` 模块不存在）

- [ ] **Step 4: 实现 resizable.tsx**

创建 `src/renderer/src/components/ui/resizable.tsx`：

```tsx
import { cn } from '@renderer/lib/utils'
import type { FC } from 'react'
import { Separator, type SeparatorProps } from 'react-resizable-panels'
import { create } from 'zustand'

// v4 的 Group/Panel/useDefaultLayout/usePanelRef 直接透传复用，不额外包装
export { Group as ResizableGroup, Panel as ResizablePanel, useDefaultLayout, usePanelRef } from 'react-resizable-panels'

/**
 * 拖拽状态：任一分隔条 pointerdown 起、窗口 pointerup/pointercancel 止。
 * 用于挂全屏透明遮罩，防止内置浏览器 <webview>（独立渲染进程）
 * 吞掉指针事件导致拖拽断连。键盘调宽不经 pointerdown，不触发遮罩。
 */
interface ResizeDragState {
  dragging: boolean
  begin: () => void
  end: () => void
}

export const useResizeDragStore = create<ResizeDragState>((set) => ({
  dragging: false,
  begin: () => set({ dragging: true }),
  end: () => set({ dragging: false })
}))

/** 全屏透明拖拽遮罩：App 根部挂载一次，仅拖拽期间渲染（z-index 压过 webview 与弹层） */
export const ResizeDragOverlay: FC = () => {
  const dragging = useResizeDragStore((s) => s.dragging)
  if (!dragging) return null
  return <div aria-hidden className="fixed inset-0 z-[9999]" />
}

/** 拖拽分隔条：8px 热区 + 居中 1px 线（hover 高亮）。库自带键盘调整与双击复位。 */
export function ResizableSeparator({
  className,
  onPointerDown,
  ...props
}: SeparatorProps): React.JSX.Element {
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    useResizeDragStore.getState().begin()
    const end = (): void => {
      useResizeDragStore.getState().end()
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    onPointerDown?.(event)
  }
  return (
    <Separator
      {...props}
      onPointerDown={handlePointerDown}
      className={cn(
        'group relative flex w-2 shrink-0 items-center justify-center outline-none select-none',
        className
      )}
    >
      <div className="bg-border h-full w-px transition-colors group-hover:bg-primary/25" />
    </Separator>
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run src/renderer/src/components/ui/resizable.test.tsx`
Expected: PASS（2 个用例）

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/renderer/src/components/ui/resizable.tsx src/renderer/src/components/ui/resizable.test.tsx
git commit -m "feat(ui): 新增 react-resizable-panels 薄封装与拖拽遮罩"
```

---

### Task 2: 迁移左侧边栏（Shell）+ 挂载遮罩

**Files:**
- Modify: `src/renderer/src/stores/sidebar.ts`（整体重写）
- Modify: `src/renderer/src/components/shell.tsx`（整体重写）
- Modify: `src/renderer/src/App.tsx`（挂 `<ResizeDragOverlay />`）

- [ ] **Step 1: 重写 sidebar store**

`src/renderer/src/stores/sidebar.ts` 全文替换为（删 width/setWidth，新增 setCollapsed，导出默认宽度）：

```ts
import { create } from 'zustand'

export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 480
export const SIDEBAR_DEFAULT_WIDTH = 260

interface SidebarState {
  collapsed: boolean
  toggleCollapsed: () => void
  setCollapsed: (collapsed: boolean) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed })
}))
```

- [ ] **Step 2: 重写 shell.tsx**

`src/renderer/src/components/shell.tsx` 全文替换为：

```tsx
import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { WindowControls } from '@renderer/components/window-controls'
import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
  useDefaultLayout,
  usePanelRef
} from '@renderer/components/ui/resizable'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarStore
} from '@renderer/stores/sidebar'

interface ShellProps {
  /** 边栏内容（顶栏控制按钮之下） */
  sidebar?: React.ReactNode
  /** 右侧内容区 */
  children?: React.ReactNode
}

/** 应用外壳：左侧边栏（可折叠 / react-resizable-panels 拖拽调宽，宽度 localStorage 记忆）
 *  + 右侧内容区，首页与设置页共用 */
function Shell({ sidebar, children }: ShellProps): React.JSX.Element {
  const collapsed = useSidebarStore((state) => state.collapsed)
  const setCollapsed = useSidebarStore((state) => state.setCollapsed)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const sidebarPanelRef = usePanelRef()
  const layout = useDefaultLayout({ id: 'nexus-shell', onlySaveAfterUserInteractions: true })

  // macOS 全屏时红绿灯隐藏，顶栏不再预留左侧间距
  useEffect(() => {
    window.api.isFullscreen().then(setIsFullscreen)
    return window.api.onFullscreenChange(setIsFullscreen)
  }, [])

  // 折叠开关（WindowControls）写 store，这里命令式驱动 panel；
  // 拖拽越过最小宽度时库自动折叠，经 onResize 反向同步 store
  useEffect(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    if (collapsed) panel.collapse()
    else panel.expand()
  }, [collapsed, sidebarPanelRef])

  return (
    // nexus index.css 将 #root 设为 flex-row，Group 作为其 flex item 需 flex-1 撑满宽度
    <ResizableGroup
      id="nexus-shell"
      className="min-w-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      {/* 左侧边栏：可折叠，拖拽调宽（区间为像素约束） */}
      <ResizablePanel
        id="sidebar"
        defaultSize={SIDEBAR_DEFAULT_WIDTH}
        minSize={SIDEBAR_MIN_WIDTH}
        maxSize={SIDEBAR_MAX_WIDTH}
        collapsible
        groupResizeBehavior="preserve-pixel-size"
        panelRef={sidebarPanelRef}
        onResize={() => setCollapsed(sidebarPanelRef.current?.isCollapsed() ?? false)}
      >
        <div className="bg-sidebar border-sidebar-border relative flex h-full flex-col border-r">
          {/* 顶部拖拽区：窗口化时避让左侧红绿灯，全屏时贴到最左 */}
          <div
            className={cn(
              'app-drag flex h-12 shrink-0 items-center transition-[padding]',
              isFullscreen ? 'pl-3' : 'pl-[84px]'
            )}
          >
            <WindowControls />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
        </div>
      </ResizablePanel>

      <ResizableSeparator className="w-1.5" />

      {/* 右侧内容区：折叠后在顶部显示控制按钮 */}
      <ResizablePanel id="main" groupResizeBehavior="preserve-pixel-size">
        <main className="app-drag relative flex h-full min-w-0 flex-col bg-background">
          {collapsed && (
            <div
              className={cn(
                'flex h-12 shrink-0 items-center transition-[padding]',
                isFullscreen ? 'pl-3' : 'pl-[84px]'
              )}
            >
              <WindowControls />
            </div>
          )}
          {/* flex 链说明同旧实现：控制条(h-12)与内容区需 min-h-0 flex-1 避免 48px 溢出 */}
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </ResizablePanel>
    </ResizableGroup>
  )
}

export { Shell }
```

注意：旧实现的 200ms 折叠动画按 spec 取舍移除（折叠变瞬时）。

- [ ] **Step 3: App.tsx 挂载拖拽遮罩**

`src/renderer/src/App.tsx`：

1. import 区加：

```tsx
import { ResizeDragOverlay } from '@renderer/components/ui/resizable'
```

2. `return` 内 `<PopupHost />` 之后加一行：

```tsx
      <PopupHost />
      <ResizeDragOverlay />
```

- [ ] **Step 4: 类型检查 + 测试**

Run: `pnpm typecheck:web && pnpm test`
Expected: 全部通过（shell 无独立测试，类型检查覆盖 props 用法）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/sidebar.ts src/renderer/src/components/shell.tsx src/renderer/src/App.tsx
git commit -m "refactor(shell): 左侧边栏调宽迁移到 react-resizable-panels"
```

---

### Task 3: 迁移项目面板（AgentPage + ProjectPanel）

**Files:**
- Modify: `src/renderer/src/stores/projectPanel.ts`（删 width/setWidth，导出 PANEL_DEFAULT_WIDTH；treeWidth 留到 Task 4）
- Modify: `src/renderer/src/features/agent/AgentPage.tsx`（整体重写）
- Modify: `src/renderer/src/features/agent/ProjectPanel.tsx`（删自研拖拽，maximized 变可选 prop）

- [ ] **Step 1: projectPanel store 删面板宽度字段**

`src/renderer/src/stores/projectPanel.ts` 三处修改：

1. `const PANEL_DEFAULT_WIDTH = 320` 改为 `export const PANEL_DEFAULT_WIDTH = 320`
2. interface 中删除：

```ts
  /** 面板宽度（非最大化时生效，拖拽左缘调整） */
  width: number
```

与

```ts
  /** 设置宽度，自动限制在 [最小值, 最大值] 区间 */
  setWidth: (width: number) => void
```

3. 实现中删除 `width: PANEL_DEFAULT_WIDTH,` 与
   `setWidth: (width) => set({ width: Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width)) }),`

（`PANEL_MIN_WIDTH`/`PANEL_MAX_WIDTH`/`open`/`maximized`/`treeWidth` 等其余全部保留。）

- [ ] **Step 2: 重写 AgentPage.tsx**

`src/renderer/src/features/agent/AgentPage.tsx` 全文替换为：

```tsx
import { useProjectPanelStore, PANEL_DEFAULT_WIDTH, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from '@renderer/stores/projectPanel'
import type { FC } from 'react'

import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
  useDefaultLayout
} from '@renderer/components/ui/resizable'
import { AgentHeader, AgentThread } from './AgentThread'
import { selectActiveCwd, useAgentStore } from './agentStore'
import { ProjectPanel } from './ProjectPanel'

/** Agent 对话区（runtime 由 AgentRuntimeProvider 在 Shell 外层提供）。
 *  对话区与项目面板经 react-resizable-panels 调宽（宽度 localStorage 记忆）。 */
export const AgentPage: FC = () => {
  const cwd = useAgentStore(selectActiveCwd)
  const panelOpen = useProjectPanelStore((s) => s.open)
  const maximized = useProjectPanelStore((s) => s.maximized)
  const showPanel = cwd !== null && panelOpen
  // 最大化时对话区整体隐藏（保留组件状态），面板占满内容区
  const conversationHidden = showPanel && maximized
  const layout = useDefaultLayout({ id: 'nexus-agent-page', onlySaveAfterUserInteractions: true })

  const conversation = (
    <div className="bg-background flex h-full w-full flex-1 flex-col overflow-hidden rounded-lg">
      <AgentHeader />
      <main className="flex-1 overflow-hidden">
        <AgentThread />
      </main>
    </div>
  )

  // 外层 Shell 的 <main> 是 app-drag（窗口拖拽区），对话区整体需 app-no-drag 才能交互
  return (
    <div className="app-no-drag h-full">
      <div className="bg-muted/30 flex h-full overflow-hidden p-2">
        {conversationHidden ? (
          <ProjectPanel maximized />
        ) : showPanel ? (
          <ResizableGroup
            id="nexus-agent-page"
            className="min-w-0 flex-1"
            defaultLayout={layout.defaultLayout}
            onLayoutChanged={layout.onLayoutChanged}
          >
            <ResizablePanel id="thread" groupResizeBehavior="preserve-pixel-size">
              {conversation}
            </ResizablePanel>
            <ResizableSeparator />
            <ResizablePanel
              id="project"
              defaultSize={PANEL_DEFAULT_WIDTH}
              minSize={PANEL_MIN_WIDTH}
              maxSize={PANEL_MAX_WIDTH}
              groupResizeBehavior="preserve-pixel-size"
            >
              <ProjectPanel />
            </ResizablePanel>
          </ResizableGroup>
        ) : (
          conversation
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: ProjectPanel.tsx 删自研拖拽**

`src/renderer/src/features/agent/ProjectPanel.tsx` 四处修改：

1. import 行 `import { useCallback, useEffect, useState, type FC } from 'react'` 删掉 `useState`（文件内无其他使用）。

2. 组件定义与 store 读取（约 362-369 行）改为：

```tsx
export const ProjectPanel: FC<{ maximized?: boolean }> = ({ maximized = false }) => {
  const tabs = useProjectPanelStore((s) => s.tabs)
  const activeTabId = useProjectPanelStore((s) => s.activeTabId)
  const toggleOpen = useProjectPanelStore((s) => s.toggleOpen)
  const toggleMaximized = useProjectPanelStore((s) => s.toggleMaximized)
```

（删除 `width`/`setWidth` 读取与 `const [dragging, setDragging] = useState(false)`。）

3. 删除整个 `startResize` 函数（含「拖拽左缘调整面板宽度」注释，约 371-399 行）。

4. `<aside>` 改为（去掉 ml-2/shrink-0/width style——面板内填满 Panel，最大化时占满）：

```tsx
      <aside
        className={cn(
          'bg-background relative flex min-w-0 flex-col overflow-hidden rounded-lg',
          maximized ? 'flex-1' : 'h-full w-full'
        )}
      >
```

5. 删除 aside 内左缘拖拽手柄整段（约 453-468 行，`{!maximized && (<div role="separator" ...` 到对应闭合）。

6. 组件顶部 doc 注释更新为：

```tsx
/**
 * 项目面板：仅本地项目会话渲染（AgentPage 保证仅在 cwd 非空且 open 时挂载）。
 * 顶部标签栏（标签页 + 「+」菜单 + 最大化/收起按钮），主体为标签页内容；
 * 无标签页时只显示菜单列表。面板宽度由 AgentPage 的 react-resizable-panels
 * 分隔条调整（最大化时占满内容区，无分隔条）。
 */
```

- [ ] **Step 4: 类型检查 + 相关测试**

Run: `pnpm typecheck:web && pnpm vitest run src/renderer/src/features/agent/project-panel-browser-close.test.tsx`
Expected: 全部通过（该测试 mock 了 FileTreeDock/FilePreviewPanel，不受影响）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/projectPanel.ts src/renderer/src/features/agent/AgentPage.tsx src/renderer/src/features/agent/ProjectPanel.tsx
git commit -m "refactor(agent): 项目面板调宽迁移到 react-resizable-panels"
```

---

### Task 4: 迁移文件树（FileTreeLayout + 两个消费方）

**Files:**
- Modify: `src/renderer/src/stores/projectPanel.ts`（删 treeWidth/setTreeWidth，导出 TREE_DEFAULT_WIDTH）
- Modify: `src/renderer/src/features/agent/files/explorer/FileTreeDock.tsx`（整体重写）
- Modify: `src/renderer/src/features/agent/ProjectPanel.tsx`（FileBrowserPanel 改用 FileTreeLayout）
- Modify: `src/renderer/src/features/agent/files/preview/FilePreviewPanel.tsx`（改用 FileTreeLayout）
- Modify: `src/renderer/src/features/agent/project-panel-browser-close.test.tsx`（mock 增加 FileTreeLayout）

- [ ] **Step 1: projectPanel store 删树宽字段**

`src/renderer/src/stores/projectPanel.ts`：

1. `const TREE_DEFAULT_WIDTH = 144` 改为 `export const TREE_DEFAULT_WIDTH = 144`
2. interface 中删除：

```ts
  /** 文件树区域宽度（拖拽树的左缘调整） */
  treeWidth: number
```

与

```ts
  /** 设置文件树区域宽度，自动限制在 [最小值, 最大值] 区间 */
  setTreeWidth: (width: number) => void
```

3. 实现中删除 `treeWidth: TREE_DEFAULT_WIDTH,` 与
   `setTreeWidth: (width) => set({ treeWidth: Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, width)) }),`

- [ ] **Step 2: 重写 FileTreeDock.tsx**

`src/renderer/src/features/agent/files/explorer/FileTreeDock.tsx` 全文替换为：

```tsx
import { TooltipIconButton } from '@renderer/components/assistant-ui/tooltip-icon-button'
import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
  useDefaultLayout
} from '@renderer/components/ui/resizable'
import { cn } from '@renderer/lib/utils'
import {
  TREE_DEFAULT_WIDTH,
  TREE_MAX_WIDTH,
  TREE_MIN_WIDTH,
  useProjectPanelStore
} from '@renderer/stores/projectPanel'
import { FolderIcon, FolderOpenIcon } from 'lucide-react'
import type { FC, ReactNode } from 'react'

import { FileExplorer } from './FileExplorer'

/**
 * 文件树显隐开关（文件夹图标，选中态 = 树展示中）。
 * 位于文件标签的面包屑行右侧（「打开」按钮左侧），不在标签栏。
 */
export const TreeToggleButton: FC = () => {
  const treeVisible = useProjectPanelStore((s) => s.treeVisible)
  const toggleTreeVisible = useProjectPanelStore((s) => s.toggleTreeVisible)
  return (
    <TooltipIconButton
      variant="ghost"
      size="icon"
      tooltip="文件树"
      side="bottom"
      onClick={toggleTreeVisible}
      className={cn('size-6 shrink-0', treeVisible && 'bg-muted')}
    >
      {treeVisible ? (
        <FolderOpenIcon className="size-3.5" />
      ) : (
        <FolderIcon className="size-3.5" />
      )}
    </TooltipIconButton>
  )
}

/** 停靠在内容区右侧的文件树：宽度由 FileTreeLayout 的分隔条调整 */
export const FileTreeDock: FC = () => {
  return (
    <div className="border-border relative flex h-full w-full flex-col border-l">
      <FileExplorer />
    </div>
  )
}

/**
 * 内容区 + 文件树的可拉伸布局（react-resizable-panels，宽度 localStorage 记忆）。
 * 供「打开文件」页与文件预览标签使用；两者同一时刻只挂载其一，共享 group id。
 */
export const FileTreeLayout: FC<{ children: ReactNode }> = ({ children }) => {
  const treeVisible = useProjectPanelStore((s) => s.treeVisible)
  const layout = useDefaultLayout({ id: 'nexus-project-panel', onlySaveAfterUserInteractions: true })
  return (
    <ResizableGroup
      id="nexus-project-panel"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <ResizablePanel id="content" groupResizeBehavior="preserve-pixel-size">
        {children}
      </ResizablePanel>
      {treeVisible && (
        <>
          <ResizableSeparator />
          <ResizablePanel
            id="tree"
            defaultSize={TREE_DEFAULT_WIDTH}
            minSize={TREE_MIN_WIDTH}
            maxSize={TREE_MAX_WIDTH}
            groupResizeBehavior="preserve-pixel-size"
          >
            <FileTreeDock />
          </ResizablePanel>
        </>
      )}
    </ResizableGroup>
  )
}
```

- [ ] **Step 3: ProjectPanel.tsx 的 FileBrowserPanel 改用 FileTreeLayout**

1. import 行 `import { FileTreeDock, TreeToggleButton } from './files/explorer/FileTreeDock'`
   改为 `import { FileTreeLayout, TreeToggleButton } from './files/explorer/FileTreeDock'`

2. `FileBrowserPanel` 组件替换为：

```tsx
/**
 * 「打开文件」标签页（未选择文件时）：面包屑行（"/" + 文件树开关）
 * + 占位提示 + 右侧文件树（可显隐/调宽）。选中文件后被该文件的标签原位替换。
 */
const FileBrowserPanel: FC = () => {
  // 「打开文件」页中树即内容，不受窄面板让位规则影响（占位提示可压缩）
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex h-8 min-h-8 items-center gap-2 border-b px-2">
        <span className="text-muted-foreground flex-1 text-xs">/</span>
        <TreeToggleButton />
      </div>
      <FileTreeLayout>
        <div className="flex h-full w-full min-w-0 flex-col items-center justify-center gap-2">
          <FolderIcon className="text-muted-foreground size-8" />
          <div className="text-sm font-medium">打开文件</div>
          <div className="text-muted-foreground text-xs">从工作区目录树中选择文件</div>
        </div>
      </FileTreeLayout>
    </div>
  )
}
```

（删除了原来的 `treeVisible` 读取——FileTreeLayout 内部自行读取。）

- [ ] **Step 4: FilePreviewPanel.tsx 改用 FileTreeLayout**

`src/renderer/src/features/agent/files/preview/FilePreviewPanel.tsx` 三处修改：

1. import 行 `import { FileTreeDock, TreeToggleButton } from '../explorer/FileTreeDock'`
   改为 `import { FileTreeLayout, TreeToggleButton } from '../explorer/FileTreeDock'`

2. 删除 `const treeVisible = useProjectPanelStore((s) => s.treeVisible)`（约 152 行；`useProjectPanelStore` import 保留，`setTabDirty`/`isActiveTab` 仍在用）。

3. 主体容器（约 314-318 行）替换为：

```tsx
      {/* 文件树停靠在面包屑行之下：预览区与树之间的边框从「打开」一行下面开始 */}
      <FileTreeLayout>
        <div className="h-full w-full min-w-0">{renderBody()}</div>
      </FileTreeLayout>
```

- [ ] **Step 5: 更新回归测试的 mock**

`src/renderer/src/features/agent/project-panel-browser-close.test.tsx` 中 FileTreeDock 的 mock 增加 `FileTreeLayout`（透传 children，保持「树即内容」的隔离语义）：

```tsx
vi.mock('./files/explorer/FileTreeDock', () => ({
  FileTreeDock: () => null,
  FileTreeLayout: ({ children }: { children?: unknown }) => children ?? null,
  TreeToggleButton: () => null
}))
```

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `pnpm typecheck:web && pnpm test`
Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/stores/projectPanel.ts src/renderer/src/features/agent/files/explorer/FileTreeDock.tsx src/renderer/src/features/agent/ProjectPanel.tsx src/renderer/src/features/agent/files/preview/FilePreviewPanel.tsx src/renderer/src/features/agent/project-panel-browser-close.test.tsx
git commit -m "refactor(agent): 文件树调宽迁移到 react-resizable-panels"
```

---

### Task 5: 全量验证 + 手工验收

**Files:** 无新改动（发现问题才修）

- [ ] **Step 1: 全量静态检查与测试**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全部通过。lint 报未用 import 等小问题时修掉并补 commit。

- [ ] **Step 2: 残留引用扫描**

Run: `grep -rn 'startResize\|setTreeWidth\|treeWidth' src/renderer/src --include='*.ts*'`
Expected: 无输出（旧实现彻底清除）。`grep -rn 'setWidth' src/renderer/src/stores/sidebar.ts src/renderer/src/stores/projectPanel.ts` 也应无输出。

- [ ] **Step 3: 手工验收（`pnpm dev`）**

逐项确认：

1. 左侧边栏：拖拽流畅；到 200/480px 停住；双击分隔条复位 260；聚焦分隔条按 ←/→ 可调。
2. 边栏折叠按钮：瞬时折叠/展开；展开后宽度是折叠前的值。
   折叠态下分隔条仍在且可用（拖拽/双击/键盘均可重新展开）。
2.5 拖拽越过最小宽度使边栏自动折叠 → 重启应用：启动时边栏一律展开，
   宽度为最小值 200px（折叠态不保存宽度，属预期）。
3. 打开项目面板：拖拽分隔条 240–640px；双击复位 320。
4. 面板最大化/还原：还原后对话区 + 面板布局恢复。
5. 面板收起再打开：宽度保持。
6. 「打开文件」页/文件标签：文件树显隐开关正常；树宽拖拽 120–480px。
7. **关键**：打开内置浏览器标签页，把鼠标按在项目面板分隔条上拖过 webview 区域——拖拽不断连（遮罩生效）。
8. 重启应用（Cmd+R / 退出重开）：边栏、面板、文件树宽度均保留。
9. 极窄窗口下边栏可能被库自动折叠（像素约束让位），展开后恢复，属预期；
   同时目测边栏与内容区间隔只有一条分隔线（无双边框）。

- [ ] **Step 4: 若有修复，收尾 commit**

```bash
git add -u && git commit -m "fix(ui): 可拉伸边框迁移验收修复"
```

（无修复则跳过。）
