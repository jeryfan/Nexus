import { Button } from '@nexus/ui'
import { cn } from '@nexus/ui/lib/utils'
import ContentPopup from '@renderer/components/popups/ContentPopup'
import { toast } from '@renderer/services/toast'
import type {
  SerializedAiSdkError,
  SerializedAiSdkErrorUnion,
  SerializedError
} from '@renderer/types/error'
import {
  isSerializedAiSdkApiCallError,
  isSerializedAiSdkDownloadError,
  isSerializedAiSdkError,
  isSerializedAiSdkErrorUnion,
  isSerializedAiSdkInvalidArgumentError,
  isSerializedAiSdkInvalidDataContentError,
  isSerializedAiSdkInvalidMessageRoleError,
  isSerializedAiSdkInvalidPromptError,
  isSerializedAiSdkInvalidToolInputError,
  isSerializedAiSdkJSONParseError,
  isSerializedAiSdkMessageConversionError,
  isSerializedAiSdkNoObjectGeneratedError,
  isSerializedAiSdkNoSpeechGeneratedError,
  isSerializedAiSdkNoSuchModelError,
  isSerializedAiSdkNoSuchProviderError,
  isSerializedAiSdkNoSuchToolError,
  isSerializedAiSdkRetryError,
  isSerializedAiSdkToolCallRepairError,
  isSerializedAiSdkTooManyEmbeddingValuesError,
  isSerializedAiSdkTypeValidationError,
  isSerializedAiSdkUnsupportedFunctionalityError,
  isSerializedError
} from '@renderer/types/error'
import { formatAiSdkError, formatError, safeToString } from '@renderer/utils/error'
import { parseDataUrl } from '@shared/utils/dataUrl'
import { Copy } from 'lucide-react'
import React, { memo, useCallback } from 'react'

import Scrollbar from '../Scrollbar'

interface ErrorDetailContentProps {
  error?: SerializedError
}

const truncateLargeData = (
  data: string
): { content: string; truncated: boolean; isLikelyBase64: boolean } => {
  const parsed = parseDataUrl(data)
  const isLikelyBase64 = parsed?.isBase64 ?? false

  if (!data || data.length <= 100_000) {
    return { content: data, truncated: false, isLikelyBase64 }
  }

  if (isLikelyBase64) {
    return {
      content: `[${'Base64 图片数据已截断，大小'}]`,
      truncated: true,
      isLikelyBase64: true
    }
  }

  return {
    content: data.slice(0, 100_000) + `\n\n... [${'数据已截断，原始大小'}]`,
    truncated: true,
    isLikelyBase64: false
  }
}

const ErrorDetailContainer = ({ className, ...props }: React.ComponentProps<typeof Scrollbar>) => (
  <Scrollbar className={cn('max-h-[60vh] pr-[5px]', className)} {...props} />
)

const ErrorDetailList = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-4', className)} {...props} />
)

const ErrorDetailItem = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-2', className)} {...props} />
)

const ErrorDetailLabel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('font-semibold text-[14px] text-foreground', className)} {...props} />
)

const ErrorDetailValue = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'rounded-[4px] border border-border bg-background-subtle p-2 font-[var(--code-font-family)] text-[12px] text-foreground [word-break:break-word]',
      className
    )}
    {...props}
  />
)

const CodeBlock = ({ className, children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
  <pre
    className={cn(
      'selectable m-0 max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-[4px] border border-border bg-background-subtle p-3 font-[var(--code-font-family)] text-[12px] text-foreground leading-[1.5] [word-break:break-word]',
      className
    )}
    {...props}
  >
    {children}
  </pre>
)

const StackTrace = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'rounded-[6px] border border-error-base bg-background-subtle p-3 [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:font-[var(--code-font-family)] [&_pre]:text-[12px] [&_pre]:text-error-base [&_pre]:leading-[1.4] [&_pre]:[word-break:break-word]',
      className
    )}
    {...props}
  />
)

const TruncatedBadge = ({ className, style, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'ml-2 rounded-[4px] px-1.5 py-0.5 font-normal text-[10px] text-warning',
      className
    )}
    style={{
      background: 'var(--warning-subtle)',
      ...style
    }}
    {...props}
  />
)

// --- Sub-Components ---

const BuiltinError = memo(({ error }: { error: SerializedError }) => {
  return (
    <>
      {error.name && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'错误名称'}:</ErrorDetailLabel>
          <ErrorDetailValue className="selectable">{error.name}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
      {error.message && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'错误信息'}:</ErrorDetailLabel>
          <ErrorDetailValue className="selectable">{error.message}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
      {error.stack && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'堆栈信息'}:</ErrorDetailLabel>
          <StackTrace>
            <pre>{error.stack}</pre>
          </StackTrace>
        </ErrorDetailItem>
      )}
    </>
  )
})

function formatStructuredText(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

const AiSdkErrorBase = memo(({ error }: { error: SerializedAiSdkError }) => {
  const cause = error.cause
  const truncatedCause = truncateLargeData(cause || '')
  const displayedCause = truncatedCause.isLikelyBase64
    ? truncatedCause.content
    : formatStructuredText(truncatedCause.content)

  return (
    <>
      <BuiltinError error={error} />
      {cause && (
        <ErrorDetailItem>
          <ErrorDetailLabel>
            {'错误原因'}:{truncatedCause.truncated && <TruncatedBadge>{'已截断'}</TruncatedBadge>}
          </ErrorDetailLabel>
          <CodeBlock>{displayedCause}</CodeBlock>
        </ErrorDetailItem>
      )}
    </>
  )
})

const TruncatedCodeBlock = memo(({ value, label }: { value: string; label: string }) => {
  const { content, truncated, isLikelyBase64 } = truncateLargeData(value)

  return (
    <ErrorDetailItem>
      <ErrorDetailLabel>
        {label}:{truncated && <TruncatedBadge>{'已截断'}</TruncatedBadge>}
      </ErrorDetailLabel>
      {isLikelyBase64 ? (
        <ErrorDetailValue>{content}</ErrorDetailValue>
      ) : (
        <CodeBlock>{formatStructuredText(content)}</CodeBlock>
      )}
    </ErrorDetailItem>
  )
})

const AiSdkError = memo(({ error }: { error: SerializedAiSdkErrorUnion }) => {
  return (
    <ErrorDetailList>
      {(isSerializedAiSdkApiCallError(error) || isSerializedAiSdkDownloadError(error)) &&
        error.url && (
          <ErrorDetailItem>
            <ErrorDetailLabel>{'请求路径'}:</ErrorDetailLabel>
            <ErrorDetailValue className="selectable">{error.url}</ErrorDetailValue>
          </ErrorDetailItem>
        )}

      {isSerializedAiSdkApiCallError(error) && error.responseBody && (
        <TruncatedCodeBlock value={error.responseBody} label={'响应内容'} />
      )}

      {(isSerializedAiSdkApiCallError(error) || isSerializedAiSdkDownloadError(error)) &&
        error.statusCode && (
          <ErrorDetailItem>
            <ErrorDetailLabel>{'状态码'}:</ErrorDetailLabel>
            <ErrorDetailValue className="selectable">{error.statusCode}</ErrorDetailValue>
          </ErrorDetailItem>
        )}

      {isSerializedAiSdkApiCallError(error) && (
        <>
          {error.responseHeaders && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'响应首部'}:</ErrorDetailLabel>
              <CodeBlock>{JSON.stringify(error.responseHeaders, null, 2)}</CodeBlock>
            </ErrorDetailItem>
          )}

          {error.requestBodyValues && (
            <TruncatedCodeBlock value={safeToString(error.requestBodyValues)} label={'请求体'} />
          )}

          {error.data && <TruncatedCodeBlock value={safeToString(error.data)} label={'数据'} />}
        </>
      )}

      {isSerializedAiSdkDownloadError(error) && error.statusText && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'状态文本'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.statusText}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidArgumentError(error) && error.parameter && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'参数'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.parameter}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {(isSerializedAiSdkInvalidArgumentError(error) ||
        isSerializedAiSdkTypeValidationError(error)) &&
        error.value && (
          <ErrorDetailItem>
            <ErrorDetailLabel>{'值'}:</ErrorDetailLabel>
            <ErrorDetailValue>{safeToString(error.value)}</ErrorDetailValue>
          </ErrorDetailItem>
        )}

      {isSerializedAiSdkInvalidDataContentError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'内容'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.content)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidMessageRoleError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'角色'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.role}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidPromptError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'提示词'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.prompt)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidToolInputError(error) && (
        <>
          {error.toolName && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'工具名'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.toolName}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.toolInput && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'工具输入'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.toolInput}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {(isSerializedAiSdkJSONParseError(error) || isSerializedAiSdkNoObjectGeneratedError(error)) &&
        error.text && (
          <ErrorDetailItem>
            <ErrorDetailLabel>{'文本'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.text}</ErrorDetailValue>
          </ErrorDetailItem>
        )}

      {isSerializedAiSdkMessageConversionError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'原消息'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.originalMessage)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoSpeechGeneratedError(error) && error.responses && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'响应'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.responses.join(', ')}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoObjectGeneratedError(error) && (
        <>
          {error.response && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'响应'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.response)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.usage && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'用量'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.usage)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.finishReason && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'结束原因'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.finishReason}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {(isSerializedAiSdkNoSuchModelError(error) ||
        isSerializedAiSdkNoSuchProviderError(error) ||
        isSerializedAiSdkTooManyEmbeddingValuesError(error)) &&
        error.modelId && (
          <ErrorDetailItem>
            <ErrorDetailLabel>{'模型 ID'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.modelId}</ErrorDetailValue>
          </ErrorDetailItem>
        )}

      {(isSerializedAiSdkNoSuchModelError(error) || isSerializedAiSdkNoSuchProviderError(error)) &&
        error.modelType && (
          <ErrorDetailItem>
            <ErrorDetailLabel>{'模型类型'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.modelType}</ErrorDetailValue>
          </ErrorDetailItem>
        )}

      {isSerializedAiSdkNoSuchProviderError(error) && (
        <>
          <ErrorDetailItem>
            <ErrorDetailLabel>{'提供商 ID'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.providerId}</ErrorDetailValue>
          </ErrorDetailItem>

          <ErrorDetailItem>
            <ErrorDetailLabel>{'可用提供商'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.availableProviders.join(', ')}</ErrorDetailValue>
          </ErrorDetailItem>
        </>
      )}

      {isSerializedAiSdkNoSuchToolError(error) && (
        <>
          <ErrorDetailItem>
            <ErrorDetailLabel>{'工具名'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.toolName}</ErrorDetailValue>
          </ErrorDetailItem>
          {error.availableTools && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'可用工具'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.availableTools?.join(', ') || '无'}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkRetryError(error) && (
        <>
          {error.reason && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'原因'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.reason}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.lastError && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'最后错误'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.lastError)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.errors && error.errors.length > 0 && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'错误'}:</ErrorDetailLabel>
              <ErrorDetailValue>
                {error.errors.map((e) => safeToString(e)).join('\n\n')}
              </ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkTooManyEmbeddingValuesError(error) && (
        <>
          {error.provider && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'提供商'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.provider}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.maxEmbeddingsPerCall && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'每次调用的最大嵌入'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.maxEmbeddingsPerCall}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.values && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'值'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.values)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkToolCallRepairError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'原错误'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.originalError)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkUnsupportedFunctionalityError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'功能'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.functionality}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      <AiSdkErrorBase error={error} />
    </ErrorDetailList>
  )
})

// --- Main Content Component ---

const ErrorDetailContent: React.FC<ErrorDetailContentProps> = ({ error }) => {
  const copyErrorDetails = useCallback(() => {
    if (!error) {
      return
    }

    let errorText: string
    if (isSerializedAiSdkError(error)) {
      errorText = formatAiSdkError(error)
    } else if (isSerializedError(error)) {
      errorText = formatError(error)
    } else {
      errorText = safeToString(error)
    }

    void navigator.clipboard.writeText(errorText)
    toast.success('已复制')
  }, [error])

  const renderErrorDetails = (error?: SerializedError) => {
    if (!error) {
      return <div>{'未知错误'}</div>
    }

    if (isSerializedAiSdkErrorUnion(error)) {
      return <AiSdkError error={error} />
    }

    return (
      <ErrorDetailList>
        <BuiltinError error={error} />
      </ErrorDetailList>
    )
  }

  return (
    <>
      <ErrorDetailContainer>{renderErrorDetails(error)}</ErrorDetailContainer>
      <div className="my-2 mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={copyErrorDetails}>
          <Copy size={14} />
          {'复制'}
        </Button>
      </div>
    </>
  )
}

export function showErrorDetailPopup(params: ErrorDetailContentProps) {
  void ContentPopup.show({
    title: '错误详情',
    content: <ErrorDetailContent {...params} />,
    width: '60vw',
    styles: { content: { maxWidth: '1200px', minWidth: '600px' } }
  })
}

export { ErrorDetailContent }
export type { ErrorDetailContentProps }
