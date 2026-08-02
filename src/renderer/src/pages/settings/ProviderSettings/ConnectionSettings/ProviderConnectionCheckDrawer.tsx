import {
  Avatar,
  AvatarFallback,
  Button,
  Combobox,
  type ComboboxOption,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label
} from '@nexus/ui'
import { useIcon } from '@nexus/ui/icons'
import { showErrorDetailPopup } from '@renderer/components/ErrorDetailModal'
import type { SerializedError } from '@renderer/types/error'
import { maskApiKey } from '@renderer/utils/api'
import { getModelLogoRef } from '@renderer/utils/model'
import type { Model } from '@shared/data/types/model'
import { sortBy } from 'es-toolkit/compat'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { drawerClasses } from '../primitives/ProviderSettingsPrimitives'
import { healthCheckErrorToDisplayString } from '../utils/healthCheck'

interface ProviderConnectionCheckDrawerProps {
  open: boolean
  models: readonly Model[]
  apiKeys: string[]
  connectionError?: SerializedError
  isSubmitting: boolean
  requiresApiKey?: boolean
  onClose: () => void
  onStart: (config: { model: Model; apiKey: string }) => Promise<void>
  onOpenModelHealthCheck?: () => void
}

type ModelOption = ComboboxOption<{ model: Model }>
type ApiKeyOption = ComboboxOption

const CONNECTION_ERROR_DESCRIPTION_COLOR =
  'color-mix(in oklch, var(--foreground) 66.6667%, transparent)'
const CONNECTION_ERROR_DETAIL_COLOR = 'color-mix(in oklch, var(--foreground) 44.4444%, transparent)'

function ModelOptionIcon({ model, size = 20 }: { model: Model; size?: number }) {
  const Icon = useIcon(getModelLogoRef(model))

  return Icon ? (
    <Icon.Avatar size={size} />
  ) : (
    <Avatar size="sm">
      <AvatarFallback>{model.name.trim().charAt(0) || 'M'}</AvatarFallback>
    </Avatar>
  )
}

function renderModelOptionContent(model: Model) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ModelOptionIcon model={model} />
      <span className="min-w-0 flex-1 truncate" title={model.name}>
        {model.name}
      </span>
    </div>
  )
}

export default function ProviderConnectionCheckDrawer({
  open,
  models,
  apiKeys,
  connectionError,
  isSubmitting,
  requiresApiKey = true,
  onClose,
  onStart,
  onOpenModelHealthCheck
}: ProviderConnectionCheckDrawerProps) {
  const sortedModels = useMemo(() => sortBy(models, 'name'), [models])
  const modelOptions = useMemo<ModelOption[]>(
    () => sortedModels.map((model) => ({ value: model.id, label: model.name, model })),
    [sortedModels]
  )
  const apiKeyOptions = useMemo<ApiKeyOption[]>(
    () => apiKeys.map((key, index) => ({ value: String(index), label: maskApiKey(key) })),
    [apiKeys]
  )
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0)

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedModelId(sortedModels[0]?.id ?? '')
    setSelectedKeyIndex(0)
  }, [open, sortedModels])

  const selectedModel = useMemo(
    () => sortedModels.find((item) => item.id === selectedModelId) ?? sortedModels[0],
    [selectedModelId, sortedModels]
  )

  const selectedApiKey = apiKeys[selectedKeyIndex] ?? apiKeys[0] ?? ''
  const hasMultipleKeys = apiKeys.length > 1
  const connectionErrorText = healthCheckErrorToDisplayString(connectionError)
  const handleShowConnectionErrorDetail = () => {
    showErrorDetailPopup({ error: connectionError })
  }
  const handleOpenModelHealthCheck = () => {
    onClose()
    onOpenModelHealthCheck?.()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="gap-4 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base leading-5">{'请选择要检测的模型'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label className="mb-2.5 block text-[13px] text-foreground/85">{'选择模型'}</Label>
              {sortedModels.length > 0 ? (
                <Combobox
                  className="h-9 w-full justify-between px-2.5 text-left font-normal"
                  emptyText={'无结果'}
                  options={modelOptions}
                  value={selectedModel?.id ?? ''}
                  onChange={(value) =>
                    setSelectedModelId(Array.isArray(value) ? (value[0] ?? '') : value)
                  }
                  placeholder={'请选择模型'}
                  popoverClassName="w-(--radix-popover-trigger-width) [&_[data-slot=command-list]]:max-h-[280px]"
                  renderOption={(option) => renderModelOptionContent(option.model)}
                  renderValue={(value, options) => {
                    const selectedValue = Array.isArray(value) ? value[0] : value
                    const option = options.find((item) => item.value === selectedValue)

                    return option ? renderModelOptionContent(option.model) : null
                  }}
                  searchPlaceholder={'搜索'}
                />
              ) : (
                <div className={drawerClasses.emptyInline}>
                  {'没有可以被检测的模型（例如对话模型）'}
                </div>
              )}
            </div>

            {hasMultipleKeys ? (
              <div>
                <Label className="mb-2.5 block text-[13px] text-foreground/85">
                  {'选择要使用的 API 密钥：'}
                </Label>
                <Combobox
                  className="h-9 w-full justify-between px-2.5 text-left font-mono text-[12px]"
                  emptyText={'无结果'}
                  options={apiKeyOptions}
                  value={String(selectedKeyIndex)}
                  onChange={(value) =>
                    setSelectedKeyIndex(Number(Array.isArray(value) ? (value[0] ?? 0) : value))
                  }
                  placeholder={'选择要使用的 API 密钥：'}
                  popoverClassName="w-(--radix-popover-trigger-width)"
                  renderOption={(option) => (
                    <span className="truncate font-mono text-[12px]">{option.label}</span>
                  )}
                  renderValue={(value, options) => {
                    const selectedValue = Array.isArray(value) ? value[0] : value
                    const option = options.find((item) => item.value === selectedValue)

                    return option ? (
                      <span className="truncate font-mono text-[12px]">{option.label}</span>
                    ) : null
                  }}
                  searchPlaceholder={'搜索'}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[13px] text-foreground/85">{'API 密钥'}</div>
                <div className="rounded-md border border-border-muted bg-muted/20 px-3 py-2 font-mono text-[12px] text-foreground/70">
                  {selectedApiKey ? maskApiKey(selectedApiKey) : '—'}
                </div>
              </div>
            )}
          </div>
        </div>
        {connectionErrorText ? (
          <button
            type="button"
            aria-label={`${'连接失败'}: ${connectionErrorText}. ${'详情'}`}
            className="group w-full cursor-pointer rounded-lg border border-border border-l-[3px] border-l-error-border bg-transparent px-3.5 py-3 text-left text-[13px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
            onClick={handleShowConnectionErrorDetail}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <div className="flex shrink-0 items-center justify-center text-error-base">
                <AlertTriangle size={15} className="lucide-custom" />
              </div>
              <div className="pr-5 text-[13px] leading-[1.4]">{'连接失败'}</div>
            </div>
            <div
              className="wrap-break-word ml-5.75 line-clamp-3 text-xs leading-normal"
              style={{ color: CONNECTION_ERROR_DESCRIPTION_COLOR }}
            >
              {connectionErrorText}
            </div>
            <div className="mt-2.5 ml-5.75 flex items-center">
              <div
                className="ml-auto inline-flex items-center gap-0.5 text-xs transition-colors duration-150 group-hover:text-foreground"
                style={{ color: CONNECTION_ERROR_DETAIL_COLOR }}
              >
                {'详情'}
                <ChevronRight size={14} />
              </div>
            </div>
          </button>
        ) : null}
        <DialogFooter className="mt-1 flex-row items-center justify-between gap-3 sm:justify-between">
          <div>
            {onOpenModelHealthCheck ? (
              <Button
                variant="outline"
                className="h-9 px-3 text-sm"
                onClick={handleOpenModelHealthCheck}
              >
                {'检测所有模型'}
              </Button>
            ) : null}
          </div>
          <div className={drawerClasses.footer}>
            <Button variant="outline" onClick={onClose}>
              {'取消'}
            </Button>
            <Button
              disabled={!selectedModel || (requiresApiKey && !selectedApiKey)}
              loading={isSubmitting}
              onClick={() =>
                selectedModel && void onStart({ model: selectedModel, apiKey: selectedApiKey })
              }
            >
              {'开始'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
