import { useEffect, useState } from 'react'
import { CircleUserRound, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { useNavigationStore } from '@renderer/stores/navigation'

/** 边栏底部账户入口：本地账户（无登录态），菜单提供设置 */
function AccountMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigationStore((state) => state.navigate)

  // 浮层打开期间禁用窗口拖拽，确保点击外部/菜单项的事件可达（app-drag 区域会拦截 mousedown）
  useEffect(() => {
    if (open) {
      document.body.dataset.overlayOpen = ''
    } else {
      delete document.body.dataset.overlayOpen
    }
    return () => {
      delete document.body.dataset.overlayOpen
    }
  }, [open])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
        >
          <CircleUserRound className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">本地账户</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>本地账户</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('settings')}>
          <Settings className="size-4" />
          设置
          <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { AccountMenu }
