import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SegmentedControl
} from '@nexus/ui'
import { ipcApi } from '@renderer/ipc/ipcApi'
import { useAgentPackagesStore } from '@renderer/stores/agentPackages'
import { FolderOpen } from 'lucide-react'
import { useState } from 'react'

type SourceKind = 'npm' | 'git' | 'local'

const KIND_OPTIONS = [
  { value: 'npm', label: 'npm 包' },
  { value: 'git', label: 'Git 仓库' },
  { value: 'local', label: '本地目录' }
] as const satisfies readonly { value: SourceKind; label: string }[]

const NPM_NAME_PATTERN = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i
const LOCAL_PATH_PATTERN = /^(\/|~\/|[a-zA-Z]:[\\/])/

interface AddPackageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 添加扩展包弹窗：按来源类型分字段录入，组装为 pi source 字符串安装。
 * 本地目录为引用（不复制），需包含 pi 清单（package.json 的 pi 字段）
 * 或约定目录（extensions/、skills/、prompts/）。
 */
export function AddPackageDialog({ open, onOpenChange }: AddPackageDialogProps): React.JSX.Element {
  const install = useAgentPackagesStore((state) => state.install)

  const [kind, setKind] = useState<SourceKind>('npm')
  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [repo, setRepo] = useState('')
  const [ref, setRef] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = (): void => {
    setName('')
    setVersion('')
    setRepo('')
    setRef('')
    setLocalPath('')
    setError('')
    setSubmitting(false)
  }

  const compose = (): { source: string; error?: string } => {
    if (kind === 'npm') {
      const trimmed = name.trim()
      if (!trimmed) return { source: '', error: '请填写包名' }
      if (!NPM_NAME_PATTERN.test(trimmed)) return { source: '', error: '包名格式不正确' }
      const tag = version.trim()
      return { source: `npm:${trimmed}${tag ? `@${tag}` : ''}` }
    }
    if (kind === 'git') {
      const trimmed = repo.trim().replace(/^git:/, '')
      if (!trimmed) return { source: '', error: '请填写仓库地址' }
      const tag = ref.trim()
      return { source: `git:${trimmed}${tag ? `@${tag}` : ''}` }
    }
    const trimmed = localPath.trim()
    if (!trimmed) return { source: '', error: '请选择或填写目录路径' }
    if (!LOCAL_PATH_PATTERN.test(trimmed))
      return { source: '', error: '需要绝对路径（或以 ~/ 开头）' }
    return { source: trimmed }
  }

  const handleSubmit = async (): Promise<void> => {
    const { source, error: message } = compose()
    if (message) {
      setError(message)
      return
    }
    setSubmitting(true)
    try {
      if (await install(source)) {
        onOpenChange(false)
        reset()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const browseLocal = async (): Promise<void> => {
    const result = await ipcApi.request('agent.package.pickLocalDir')
    if (result) setLocalPath(result.path)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>添加扩展包</DialogTitle>
          <DialogDescription>从 npm、Git 仓库或本地目录安装 pi 扩展包。</DialogDescription>
        </DialogHeader>

        <SegmentedControl options={KIND_OPTIONS} value={kind} onValueChange={setKind} />

        <div className="flex flex-col gap-3 py-1">
          {kind === 'npm' && (
            <>
              <Field label="包名" required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如 pi-skills 或 @scope/pkg"
                />
              </Field>
              <Field label="版本（可选）">
                <Input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="如 1.2.3，留空为 latest（可自动更新）"
                />
              </Field>
            </>
          )}

          {kind === 'git' && (
            <>
              <Field label="仓库地址" required>
                <Input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="github.com/user/repo 或完整 URL"
                />
              </Field>
              <Field label="引用（可选）">
                <Input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="分支 / 标签 / commit，留空为默认分支（可自动更新）"
                />
              </Field>
            </>
          )}

          {kind === 'local' && (
            <Field label="目录路径" required>
              <div className="flex items-center gap-2">
                <Input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="扩展包目录的绝对路径"
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={() => void browseLocal()}>
                  <FolderOpen className="size-3.5" />
                  浏览…
                </Button>
              </div>
              <p className="text-foreground-muted text-xs">
                引用该目录（不会复制），需包含 pi 清单或 extensions/、skills/、prompts/ 约定目录。
              </p>
            </Field>
          )}

          {error && <div className="text-destructive text-xs">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="emphasis" onClick={() => void handleSubmit()} disabled={submitting}>
            安装
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  required,
  children
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-foreground text-xs font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  )
}
