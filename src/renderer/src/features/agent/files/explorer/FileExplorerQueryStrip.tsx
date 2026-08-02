import React from 'react'

type FileExplorerQueryStripProps = {
  children: React.ReactNode
}

export function FileExplorerQueryStrip({
  children
}: FileExplorerQueryStripProps): React.JSX.Element {
  return <div className="border-b border-border px-2 py-1.5">{children}</div>
}
