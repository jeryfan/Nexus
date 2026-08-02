import React from 'react'
import { ListFilter, Loader2, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

type FileExplorerNameFilterProps = {
  query: string
  loading?: boolean
  onQueryChange: (value: string) => void
  onClear: () => void
}

export function FileExplorerNameFilter({
  query,
  loading = false,
  onQueryChange,
  onClear
}: FileExplorerNameFilterProps): React.JSX.Element {
  return (
    <div className="flex h-7 items-center gap-1 rounded-sm border border-border bg-input/50 px-1.5 focus-within:border-ring">
      <ListFilter className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        type="text"
        className="min-w-0 flex-1 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
        aria-label="筛选文件…"
        placeholder="筛选文件…"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        spellCheck={false}
      />
      {loading ? <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" /> : null}
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-auto w-auto rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="清除文件筛选"
          onClick={onClear}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
}
