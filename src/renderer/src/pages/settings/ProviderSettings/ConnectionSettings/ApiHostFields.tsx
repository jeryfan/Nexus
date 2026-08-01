import { Button, InputGroup, InputGroupAddon, InputGroupInput, Tooltip } from '@nexus/ui'
import { cn } from '@renderer/utils/style'
import { Copy, RotateCcw, Settings } from 'lucide-react'

import ProviderField from '../primitives/ProviderField'
import ProviderSection from '../primitives/ProviderSection'
import { fieldClasses } from '../primitives/ProviderSettingsPrimitives'
import { copyApiKeyToClipboard } from './copyApiKeyToClipboard'

function ApiHostEndpointButton({ onClick }: { onClick: () => void }) {
  const label = '添加端点'

  return (
    <button
      type="button"
      aria-label={label}
      className={fieldClasses.titleHelpLink}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

interface ApiHostFieldProps {
  apiHost: string
  isApiHostResettable: boolean
  onApiHostChange: (value: string) => void
  onApiHostCommit: () => void
  onResetApiHost: () => void
  onOpenRequestConfig: () => void
}

export function ApiHostField({
  apiHost,
  isApiHostResettable,
  onApiHostChange,
  onApiHostCommit,
  onResetApiHost,
  onOpenRequestConfig
}: ApiHostFieldProps) {
  const trimmedApiHost = apiHost.trim()

  return (
    <ProviderField
      title={
        <span className={fieldClasses.titleWithHelp}>
          <span>{'API 地址'}</span>
          <ApiHostEndpointButton onClick={onOpenRequestConfig} />
        </span>
      }
      titleClassName="text-foreground"
    >
      <div className={cn(fieldClasses.inputRow, 'group')}>
        <InputGroup className={`${fieldClasses.inputGroup} min-w-0 flex-1`}>
          <InputGroupInput
            className={cn(fieldClasses.input, 'font-mono tabular-nums')}
            value={apiHost}
            placeholder={'未配置'}
            aria-label={'API 地址'}
            title={trimmedApiHost}
            onChange={(event) => onApiHostChange(event.target.value)}
            onBlur={onApiHostCommit}
            autoComplete="off"
          />
          {trimmedApiHost ? (
            <InputGroupAddon align="inline-end" className="-mr-0.5 pr-0">
              <Tooltip content={'复制'}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-5 shrink-0 rounded-md p-0 text-muted-foreground/35 opacity-0 shadow-none transition-opacity hover:bg-accent/50 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={'复制'}
                  onClick={() => {
                    void copyApiKeyToClipboard(trimmedApiHost)
                  }}
                >
                  <Copy className="size-2.5" />
                </Button>
              </Tooltip>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        {isApiHostResettable ? (
          <Tooltip content={'重置'}>
            <span className="inline-flex shrink-0">
              <button
                type="button"
                className={fieldClasses.inputActionButton}
                aria-label={'重置'}
                onClick={() => {
                  onResetApiHost()
                }}
              >
                <RotateCcw size={14} />
              </button>
            </span>
          </Tooltip>
        ) : null}
        <Tooltip content={'配置 API Host 与自定义请求头'}>
          <span className="inline-flex shrink-0">
            <button
              type="button"
              className={fieldClasses.inputActionButton}
              aria-label={'配置 API Host 与自定义请求头'}
              onClick={onOpenRequestConfig}
            >
              <Settings size={14} aria-hidden />
            </button>
          </span>
        </Tooltip>
      </div>
    </ProviderField>
  )
}

interface AnthropicApiHostFieldProps {
  anthropicApiHost: string
  anthropicHostPreview: string
  onAnthropicApiHostChange: (value: string) => void
  onAnthropicApiHostCommit: () => void
  onOpenRequestConfig: () => void
}

export function AnthropicApiHostField({
  anthropicApiHost,
  anthropicHostPreview,
  onAnthropicApiHostChange,
  onAnthropicApiHostCommit,
  onOpenRequestConfig
}: AnthropicApiHostFieldProps) {
  const trimmedAnthropicApiHost = anthropicApiHost.trim()

  return (
    <ProviderField
      title={
        <span className={fieldClasses.titleWithHelp}>
          <span>{'Anthropic API 地址'}</span>
          <ApiHostEndpointButton onClick={onOpenRequestConfig} />
        </span>
      }
      help={
        <div className="break-all pt-1 text-[12px] text-foreground/55 leading-[1.35]">
          {`Anthropic 预览：${anthropicHostPreview || '—'}`}
        </div>
      }
    >
      <div className={cn(fieldClasses.inputRow, 'group')}>
        <InputGroup className={`${fieldClasses.inputGroup} min-w-0 flex-1`}>
          <InputGroupInput
            className={cn(fieldClasses.input, 'font-mono tabular-nums')}
            value={anthropicApiHost}
            placeholder={'未配置'}
            aria-label={'Anthropic API 地址'}
            title={trimmedAnthropicApiHost}
            onChange={(event) => onAnthropicApiHostChange(event.target.value)}
            onBlur={onAnthropicApiHostCommit}
            autoComplete="off"
          />
          {trimmedAnthropicApiHost ? (
            <InputGroupAddon align="inline-end" className="-mr-0.5 pr-0">
              <Tooltip content={'复制'}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-5 shrink-0 rounded-md p-0 text-muted-foreground/35 opacity-0 shadow-none transition-opacity hover:bg-accent/50 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={'复制'}
                  onClick={() => {
                    void copyApiKeyToClipboard(trimmedAnthropicApiHost)
                  }}
                >
                  <Copy className="size-2.5" />
                </Button>
              </Tooltip>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <Tooltip content={'配置 API Host 与自定义请求头'}>
          <span className="inline-flex shrink-0">
            <button
              type="button"
              className={fieldClasses.inputActionButton}
              aria-label={'配置 API Host 与自定义请求头'}
              onClick={onOpenRequestConfig}
            >
              <Settings size={14} aria-hidden />
            </button>
          </span>
        </Tooltip>
      </div>
    </ProviderField>
  )
}

export function ApiHostSection({ children }: { children: React.ReactNode }) {
  return <ProviderSection>{children}</ProviderSection>
}
