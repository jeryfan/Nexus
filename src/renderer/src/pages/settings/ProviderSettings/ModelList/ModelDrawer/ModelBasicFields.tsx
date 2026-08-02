import { Input } from '@nexus/ui'
import ProviderField from '@renderer/pages/settings/ProviderSettings/primitives/ProviderField'
import { drawerClasses } from '@renderer/pages/settings/ProviderSettings/primitives/ProviderSettingsPrimitives'
import { cn } from '@renderer/utils/style'
import type { ReactNode, Ref } from 'react'

import { ModelEndpointTypeChips } from './ModelEndpointTypeChips'
import { ModelEndpointTypeSelect } from './ModelEndpointTypeSelect'
import type { ModelBasicFormState, ModelDrawerEndpointType } from './types'

interface ModelBasicFieldsProps {
  values: ModelBasicFormState
  showEndpointType: boolean
  endpointTypeControl?: 'select' | 'chips'
  showRequiredIndicator?: boolean
  layout?: 'vertical' | 'horizontal'
  modelIdDisabled?: boolean
  modelIdInputRef?: Ref<HTMLInputElement>
  modelIdAction?: ReactNode
  modelIdError?: string
  endpointTypeError?: string
  onModelIdChange: (value: string) => void
  onNameChange: (value: string) => void
  onNameBlur?: () => void
  onGroupChange: (value: string) => void
  onGroupBlur?: () => void
  onEndpointTypesChange: (next: readonly ModelDrawerEndpointType[]) => void
}

export function ModelBasicFields({
  values,
  showEndpointType,
  endpointTypeControl = 'select',
  showRequiredIndicator = false,
  layout = 'vertical',
  modelIdDisabled = false,
  modelIdInputRef,
  modelIdAction,
  modelIdError,
  endpointTypeError,
  onModelIdChange,
  onNameChange,
  onNameBlur,
  onGroupChange,
  onGroupBlur,
  onEndpointTypesChange
}: ModelBasicFieldsProps) {
  return (
    <>
      <ProviderField
        title={
          showRequiredIndicator ? (
            <span className="inline-flex items-baseline gap-1">
              <span>{'模型 ID'}</span>
              <span aria-hidden className="text-destructive">
                *
              </span>
            </span>
          ) : (
            '模型 ID'
          )
        }
        titleClassName={drawerClasses.fieldTitle}
        layout={layout}
        className={drawerClasses.field}
        help={modelIdError ? <div className={drawerClasses.errorText}>{modelIdError}</div> : null}
      >
        <div className={drawerClasses.valueRow}>
          <Input
            ref={modelIdInputRef}
            required
            spellCheck={false}
            maxLength={200}
            aria-label={'模型 ID'}
            value={values.modelId}
            readOnly={modelIdDisabled}
            aria-readonly={modelIdDisabled}
            aria-invalid={Boolean(modelIdError)}
            placeholder={'例如 gpt-5.5'}
            className={cn(drawerClasses.input, modelIdDisabled && drawerClasses.inputDisabled)}
            onChange={(event) => onModelIdChange(event.target.value)}
          />
          {modelIdAction}
        </div>
      </ProviderField>

      <ProviderField
        title={'模型名称'}
        titleClassName={drawerClasses.fieldTitle}
        layout={layout}
        className={drawerClasses.field}
      >
        <Input
          spellCheck={false}
          aria-label={'模型名称'}
          value={values.name}
          placeholder={'例如 GPT-5.5'}
          className={drawerClasses.input}
          onChange={(event) => onNameChange(event.target.value)}
          onBlur={onNameBlur}
        />
      </ProviderField>

      <ProviderField
        title={'分组名称'}
        titleClassName={drawerClasses.fieldTitle}
        layout={layout}
        className={drawerClasses.field}
      >
        <Input
          spellCheck={false}
          aria-label={'分组名称'}
          value={values.group}
          placeholder={'例如 ChatGPT'}
          className={drawerClasses.input}
          onChange={(event) => onGroupChange(event.target.value)}
          onBlur={onGroupBlur}
        />
      </ProviderField>

      {showEndpointType && (
        <ProviderField
          title={'端点类型'}
          titleClassName={drawerClasses.fieldTitle}
          layout={layout}
          className={drawerClasses.field}
          help={
            endpointTypeError ? (
              <div className={drawerClasses.errorText}>{endpointTypeError}</div>
            ) : null
          }
        >
          <div data-testid="provider-settings-model-endpoint-type-field">
            {endpointTypeControl === 'chips' ? (
              <ModelEndpointTypeChips
                value={values.endpointTypes ?? []}
                onChange={onEndpointTypesChange}
              />
            ) : (
              <ModelEndpointTypeSelect
                value={values.endpointTypes ?? []}
                onChange={onEndpointTypesChange}
              />
            )}
          </div>
        </ProviderField>
      )}
    </>
  )
}
