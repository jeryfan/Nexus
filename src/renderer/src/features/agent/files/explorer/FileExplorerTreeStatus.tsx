import React from 'react'
import { Loader2 } from 'lucide-react'

type FileExplorerTreeStatusProps = {
  isLoading: boolean
  error: string | null
  isEmpty: boolean
  emptyMessage?: string
}

export function FileExplorerTreeStatus({
  isLoading,
  error,
  isEmpty,
  emptyMessage
}: FileExplorerTreeStatusProps): React.JSX.Element | null {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
        {'无法加载此目录的文件：'} {error}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
        {emptyMessage ?? '此目录下没有文件'}
      </div>
    )
  }

  return null
}
