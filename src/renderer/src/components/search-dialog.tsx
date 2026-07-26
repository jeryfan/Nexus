import { Dialog, DialogContent, DialogTitle } from '@renderer/components/ui/dialog'

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 搜索弹窗：居中靠上的命令面板样式，列表数据待接入，暂为空 */
function SearchDialog({ open, onOpenChange }: SearchDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[20%] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 shadow-xl sm:max-w-lg"
      >
        <DialogTitle className="sr-only">搜索</DialogTitle>
        <input
          autoFocus
          placeholder="搜索任务"
          className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-muted-foreground"
        />
        {/* 可选列表：暂为空 */}
        <div className="h-48" />
      </DialogContent>
    </Dialog>
  )
}

export { SearchDialog }
