import React from 'react'
import { Ellipsis, ListCollapse, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'

type FileExplorerToolbarProps = {
  refresh: {
    isRefreshing: boolean
    showRefreshSpinner: boolean
    handleRefresh: () => void
  }
  canCollapseAll: boolean
  onCollapseAll: () => void
  showDotfiles: boolean
  onToggleDotfiles: () => void
}

export function FileExplorerToolbar({
  refresh,
  canCollapseAll,
  onCollapseAll,
  showDotfiles,
  onToggleDotfiles
}: FileExplorerToolbarProps): React.JSX.Element {
  return (
    <div className="flex h-8 min-h-8 items-center justify-end gap-2 border-b border-border px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'text-muted-foreground hover:text-foreground',
              !canCollapseAll && 'cursor-not-allowed opacity-50'
            )}
            aria-label="折叠全部"
            aria-disabled={!canCollapseAll}
            // Why: native disabled buttons suppress Radix tooltip triggers in Chromium.
            onClick={(event) => {
              if (!canCollapseAll) {
                event.preventDefault()
                return
              }
              onCollapseAll()
            }}
          >
            <ListCollapse className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          折叠全部
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            aria-label="刷新文件树"
            disabled={refresh.isRefreshing}
            onClick={() => refresh.handleRefresh()}
          >
            {refresh.showRefreshSpinner ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          刷新文件树
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                aria-label="更多文件树操作"
              >
                <Ellipsis className="size-3" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            更多文件树操作
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuCheckboxItem checked={showDotfiles} onCheckedChange={onToggleDotfiles}>
            显示隐藏文件
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
