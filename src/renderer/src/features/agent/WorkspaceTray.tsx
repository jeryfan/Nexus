import { unwrap } from '@shared/agent/api/result'
import { FolderIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import type { FC } from 'react'

import { useAgentStore } from './agentStore'
import { localCapabilities } from './services/agentApi'

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * 工作空间托盘条：仅新会话（草稿）显示，渲染在 composer 壳内底部，
 * 与输入框等宽、贴合成一体（负 margin 抵消壳内 padding）。
 * 未选择：文件夹图标 + "选择工作空间"，点击打开目录选择器；
 * 已选择：显示项目名，hover 出现 × 取消选择（回到对话，即应用托管的独立工作区）。
 * 草稿发出首条消息后变为真实会话，本组件随之隐藏。
 */
export const WorkspaceTray: FC = () => {
  const draft = useAgentStore((s) => s.draft)
  const isDraftActive = useAgentStore((s) => s.draft !== null && s.activeSessionId === s.draft.id)
  const setDraftCwd = useAgentStore((s) => s.setDraftCwd)

  if (!isDraftActive || !draft) return null

  const pick = async (): Promise<void> => {
    const picked = unwrap(await localCapabilities.pickWorkspace())
    if (picked) setDraftCwd(picked.path)
  }

  return (
    // -mx/-mb 抵消 composer 壳的 padding，使托盘条与输入框等宽且底部贴合；
    // rounded-b 取 composer 半径减去壳 padding，保持圆角连续
    <div className="border-border/50 bg-muted/60 -mx-2 -mb-2 mt-1 flex items-center rounded-b-[calc(var(--composer-radius)-0.5rem)] border-t px-3 py-2">
      {draft.cwd ? (
        <div
          className="group text-muted-foreground inline-flex items-center gap-1.5 text-xs select-none"
          title={draft.cwd}
        >
          <span className="relative inline-flex size-3.5 items-center justify-center">
            <FolderIcon className="size-3.5 group-hover:hidden" />
            <button
              type="button"
              aria-label="取消选择项目"
              onClick={() => setDraftCwd(null)}
              className="hover:bg-muted-foreground/20 absolute inset-0 hidden items-center justify-center rounded-full group-hover:inline-flex"
            >
              <XIcon className="size-3" />
            </button>
          </span>
          <span className="max-w-60 truncate">{basename(draft.cwd)}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void pick()}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <FolderIcon className="size-3.5" />
          选择工作空间
          <ChevronDownIcon className="size-3" />
        </button>
      )}
    </div>
  )
}
