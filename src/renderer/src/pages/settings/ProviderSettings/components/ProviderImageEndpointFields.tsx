import { Field, FieldError, FieldLabel, Input } from '@nexus/ui'
import { useId } from 'react'

import type {
  ProviderImageEndpointDraft,
  ProviderImageEndpointDraftField
} from '../utils/providerImageEndpoints'

interface ProviderImageEndpointFieldsProps {
  value: ProviderImageEndpointDraft
  invalidField?: ProviderImageEndpointDraftField | null
  onChange: (value: ProviderImageEndpointDraft) => void
}

export function ProviderImageEndpointFields({
  value,
  invalidField,
  onChange
}: ProviderImageEndpointFieldsProps) {
  const uid = useId()
  const generationInputId = `${uid}-image-generation-base-url`
  const generationHelpId = `${uid}-image-generation-base-url-help`
  const generationErrorId = `${uid}-image-generation-base-url-error`
  const editInputId = `${uid}-image-edit-base-url`
  const editHelpId = `${uid}-image-edit-base-url-help`
  const editErrorId = `${uid}-image-edit-base-url-error`

  return (
    <div className="flex flex-col gap-4">
      <Field className="gap-2">
        <FieldLabel htmlFor={generationInputId} className="text-[13px] text-foreground">
          {'图像生成 Base URL'}
        </FieldLabel>
        <Input
          id={generationInputId}
          value={value.imageGenerationBaseUrl}
          placeholder={'Base URL：https://example.com'}
          aria-invalid={invalidField === 'imageGenerationBaseUrl'}
          aria-describedby={
            invalidField === 'imageGenerationBaseUrl' ? generationErrorId : generationHelpId
          }
          onChange={(event) => onChange({ ...value, imageGenerationBaseUrl: event.target.value })}
        />
        <p id={generationHelpId} className="text-foreground-muted text-xs leading-tight">
          {'用于 /images/generations；留空时使用默认对话端点的 Base URL'}
        </p>
        <FieldError
          id={generationErrorId}
          className="text-xs"
          errors={
            invalidField === 'imageGenerationBaseUrl'
              ? [{ message: '请输入有效的 HTTP 或 HTTPS 地址' }]
              : undefined
          }
        />
      </Field>

      <Field className="gap-2">
        <FieldLabel htmlFor={editInputId} className="text-[13px] text-foreground">
          {'图像编辑 Base URL'}
        </FieldLabel>
        <Input
          id={editInputId}
          value={value.imageEditBaseUrl}
          placeholder={'Base URL：https://example.com'}
          aria-invalid={invalidField === 'imageEditBaseUrl'}
          aria-describedby={invalidField === 'imageEditBaseUrl' ? editErrorId : editHelpId}
          onChange={(event) => onChange({ ...value, imageEditBaseUrl: event.target.value })}
        />
        <p id={editHelpId} className="text-foreground-muted text-xs leading-tight">
          {'用于 /images/edits；留空时使用默认对话端点的 Base URL'}
        </p>
        <FieldError
          id={editErrorId}
          className="text-xs"
          errors={
            invalidField === 'imageEditBaseUrl'
              ? [{ message: '请输入有效的 HTTP 或 HTTPS 地址' }]
              : undefined
          }
        />
      </Field>
    </div>
  )
}
