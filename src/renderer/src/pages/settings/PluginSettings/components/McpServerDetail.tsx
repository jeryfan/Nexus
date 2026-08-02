import { Button, Input, SegmentedControl } from '@nexus/ui'
import { SettingGroup } from '@renderer/components/SettingsPrimitives'
import { popup } from '@renderer/services/popup'
import { useAgentMcpStore } from '@renderer/stores/agentMcp'
import type { McpServerDto, McpServerType } from '@shared/agent/types'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface KeyValueRow {
  key: string
  value: string
}

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

const TYPE_OPTIONS = [
  { value: 'stdio', label: 'stdio（本地命令）' },
  { value: 'http', label: 'HTTP（远程服务）' }
] as const satisfies readonly { value: McpServerType; label: string }[]

interface McpServerDetailProps {
  /** 编辑已有服务器时传原名；缺省为新建 */
  originalName?: string
  onBack: () => void
}

/**
 * MCP 服务器详情（新建/编辑）。表单字段对齐 pi-mcp-adapter 的 ServerEntry
 * 管理面子集；高级字段（oauth/lifecycle 等）保存时由主进程原样保留。
 * 宿主环境变量默认全部传递给 stdio 子进程（adapter 行为），故无「环境变量传递」项。
 */
export function McpServerDetail({ originalName, onBack }: McpServerDetailProps): React.JSX.Element {
  const isCreate = originalName === undefined
  const existing = useAgentMcpStore((state) =>
    originalName ? state.servers.find((server) => server.name === originalName) : undefined
  )
  const save = useAgentMcpStore((state) => state.save)
  const remove = useAgentMcpStore((state) => state.remove)
  const saving = useAgentMcpStore((state) =>
    originalName ? state.busy[originalName] === 'save' : Object.values(state.busy).includes('save')
  )

  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<McpServerType>(existing?.type ?? 'stdio')
  const [command, setCommand] = useState(existing?.command ?? '')
  const [args, setArgs] = useState<string[]>(existing?.args ?? [])
  const [envRows, setEnvRows] = useState<KeyValueRow[]>(recordToRows(existing?.env))
  const [cwd, setCwd] = useState(existing?.cwd ?? '')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(recordToRows(existing?.headers))
  const [error, setError] = useState('')

  if (!isCreate && !existing) {
    return (
      <div className="py-6 text-center text-foreground-muted text-sm">
        服务器「{originalName}」不存在或已被移除。
        <Button variant="link" size="sm" onClick={onBack}>
          返回列表
        </Button>
      </div>
    )
  }

  const validate = (): string => {
    if (isCreate) {
      if (!name.trim()) return '请填写名称'
      if (!NAME_PATTERN.test(name.trim())) return '名称仅支持字母、数字开头，后续可跟 - _ .'
    }
    if (type === 'stdio' && !command.trim()) return '请填写启动命令'
    if (type === 'http') {
      if (!url.trim()) return '请填写服务地址'
      if (!/^https?:\/\//.test(url.trim())) return '服务地址需以 http:// 或 https:// 开头'
    }
    return ''
  }

  const handleSave = async (): Promise<void> => {
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    const server: McpServerDto = {
      name: isCreate ? name.trim() : (existing?.name ?? ''),
      type,
      command: command.trim(),
      args: args.map((arg) => arg.trim()).filter(Boolean),
      env: rowsToRecord(envRows),
      cwd: cwd.trim(),
      url: url.trim(),
      headers: rowsToRecord(headerRows),
      disabled: existing?.disabled ?? false
    }
    if (await save(isCreate ? undefined : originalName, server)) {
      onBack()
    }
  }

  const handleRemove = async (): Promise<void> => {
    if (!originalName) return
    const confirmed = await popup.confirm({
      title: '卸载 MCP 服务器',
      content: `确定卸载「${originalName}」吗？该配置将从 mcp.json 中移除。`,
      okText: '卸载',
      cancelText: '取消',
      okButtonProps: { danger: true }
    })
    if (confirmed && (await remove(originalName))) {
      onBack()
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-foreground-muted text-sm hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        返回
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isCreate ? '添加 MCP 服务器' : `更新 ${originalName} MCP`}
        </h2>
        {!isCreate && (
          <Button size="sm" variant="outline" onClick={() => void handleRemove()}>
            <Trash2 className="size-3.5 text-destructive" />
            <span className="text-destructive">卸载</span>
          </Button>
        )}
      </div>
      {!isCreate && (
        <p className="mt-1 text-foreground-muted text-xs">
          如需切换 MCP 服务器类型，请先卸载当前配置。
        </p>
      )}

      <SettingGroup className="mt-4">
        {isCreate && (
          <>
            <FieldLabel text="名称" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如 chrome-devtools-mcp"
              className="mt-1.5"
            />
            <FieldLabel text="类型" className="mt-4" />
            <SegmentedControl
              className="mt-1.5"
              options={TYPE_OPTIONS}
              value={type}
              onValueChange={(value) => setType(value)}
            />
          </>
        )}

        {type === 'stdio' ? (
          <>
            <FieldLabel text="启动命令" className={isCreate ? 'mt-4' : undefined} />
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="如 npx"
              className="mt-1.5"
            />

            <FieldLabel text="参数" className="mt-4" />
            <div className="mt-1.5 flex flex-col gap-2">
              {args.map((arg, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={arg}
                    onChange={(e) =>
                      setArgs(args.map((item, i) => (i === index ? e.target.value : item)))
                    }
                  />
                  <RowRemoveButton onClick={() => setArgs(args.filter((_, i) => i !== index))} />
                </div>
              ))}
              <AddRowButton label="添加参数" onClick={() => setArgs([...args, ''])} />
            </div>

            <FieldLabel text="环境变量" className="mt-4" />
            <div className="mt-1.5 flex flex-col gap-2">
              {envRows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={row.key}
                    onChange={(e) =>
                      setEnvRows(
                        envRows.map((item, i) =>
                          i === index ? { ...item, key: e.target.value } : item
                        )
                      )
                    }
                    placeholder="键"
                  />
                  <Input
                    value={row.value}
                    onChange={(e) =>
                      setEnvRows(
                        envRows.map((item, i) =>
                          i === index ? { ...item, value: e.target.value } : item
                        )
                      )
                    }
                    placeholder="值"
                  />
                  <RowRemoveButton
                    onClick={() => setEnvRows(envRows.filter((_, i) => i !== index))}
                  />
                </div>
              ))}
              <AddRowButton
                label="添加环境变量"
                onClick={() => setEnvRows([...envRows, { key: '', value: '' }])}
              />
            </div>

            <FieldLabel text="工作目录" className="mt-4" />
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="如 ~/code（留空使用会话目录）"
              className="mt-1.5"
            />
          </>
        ) : (
          <>
            <FieldLabel text="服务地址" className={isCreate ? 'mt-4' : undefined} />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="mt-1.5"
            />

            <FieldLabel text="请求头" className="mt-4" />
            <div className="mt-1.5 flex flex-col gap-2">
              {headerRows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={row.key}
                    onChange={(e) =>
                      setHeaderRows(
                        headerRows.map((item, i) =>
                          i === index ? { ...item, key: e.target.value } : item
                        )
                      )
                    }
                    placeholder="键"
                  />
                  <Input
                    value={row.value}
                    onChange={(e) =>
                      setHeaderRows(
                        headerRows.map((item, i) =>
                          i === index ? { ...item, value: e.target.value } : item
                        )
                      )
                    }
                    placeholder="值"
                  />
                  <RowRemoveButton
                    onClick={() => setHeaderRows(headerRows.filter((_, i) => i !== index))}
                  />
                </div>
              ))}
              <AddRowButton
                label="添加请求头"
                onClick={() => setHeaderRows([...headerRows, { key: '', value: '' }])}
              />
            </div>
          </>
        )}
      </SettingGroup>

      {error && <div className="mt-2 text-destructive text-xs">{error}</div>}

      <div className="mt-4 flex justify-end">
        <Button variant="emphasis" onClick={() => void handleSave()} disabled={saving}>
          保存
        </Button>
      </div>
    </div>
  )
}

function FieldLabel({ text, className }: { text: string; className?: string }): React.JSX.Element {
  return (
    <div className={`select-none font-medium text-foreground text-sm ${className ?? ''}`}>
      {text}
    </div>
  )
}

function AddRowButton({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1 rounded-lg bg-accent/60 py-2 text-foreground-muted text-xs transition-colors hover:bg-accent hover:text-foreground"
    >
      <Plus className="size-3.5" />
      {label}
    </button>
  )
}

function RowRemoveButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md p-1.5 text-foreground-muted hover:bg-accent hover:text-destructive"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}

function recordToRows(record: Record<string, string> | undefined): KeyValueRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

function rowsToRecord(rows: KeyValueRow[]): Record<string, string> {
  return Object.fromEntries(
    rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value])
  )
}
