import {
  FieldLegend,
  FieldSet,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@nexus/ui'
import { cn } from '@renderer/utils/style'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import { useId } from 'react'

import type { ModelChatEndpointType, ModelPurpose } from './modelPurpose'

interface ModelPurposeFieldsProps {
  purpose: ModelPurpose
  chatEndpointType: ModelChatEndpointType
  chatEndpointTypes: ModelChatEndpointType[]
  onPurposeChange: (purpose: ModelPurpose) => void
  onChatEndpointTypeChange: (endpointType: ModelChatEndpointType) => void
}

const PURPOSES: ModelPurpose[] = ['chat', 'image-generation', 'image-edit']

const ENDPOINT_LABELS: Record<ModelChatEndpointType, string> = {
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'OpenAI',
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'OpenAI Responses',
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'Anthropic',
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'Gemini'
}

const PURPOSE_LABELS: Record<ModelPurpose, { label: string; description: string }> = {
  chat: {
    label: '对话',
    description: '使用 Provider 的文本 API'
  },
  'image-generation': {
    label: '图像生成',
    description: '根据提示词生成图片'
  },
  'image-edit': {
    label: '图像编辑',
    description: '接收输入图片并返回编辑后的图片'
  }
}

export function ModelPurposeFields({
  purpose,
  chatEndpointType,
  chatEndpointTypes,
  onPurposeChange,
  onChatEndpointTypeChange
}: ModelPurposeFieldsProps) {
  const uid = useId()
  const descriptionId = `${uid}-purpose-description`

  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-0 text-[13px] text-foreground">
        {'模型用途'}
      </FieldLegend>
      <p id={descriptionId} className="text-foreground-muted text-xs">
        {'选择这个模型的用途'}
      </p>
      <RadioGroup
        value={purpose}
        aria-describedby={descriptionId}
        onValueChange={(value) => onPurposeChange(value as ModelPurpose)}
      >
        {PURPOSES.map((option) => {
          const optionId = `${uid}-${option}`
          const label = PURPOSE_LABELS[option]
          return (
            <Label
              key={option}
              htmlFor={optionId}
              className={cn(
                'flex min-h-10 cursor-pointer items-start gap-3 rounded-lg border border-border-subtle px-3 py-2.5',
                'transition-[background-color,border-color,box-shadow] duration-150 hover:bg-accent',
                'focus-within:ring-2 focus-within:ring-ring',
                purpose === option && 'border-primary bg-accent'
              )}
            >
              <RadioGroupItem id={optionId} value={option} className="mt-0.5" />
              <span>
                <span className="block text-[13px] text-foreground">{label.label}</span>
                <span className="mt-0.5 block font-normal text-foreground-muted text-xs">
                  {label.description}
                </span>
              </span>
            </Label>
          )
        })}
      </RadioGroup>

      {purpose === 'chat' && chatEndpointTypes.length > 1 && (
        <div className="mt-1 flex flex-col gap-2">
          <Label htmlFor={`${uid}-chat-protocol`} className="text-[13px] text-foreground">
            {'对话协议'}
          </Label>
          <Select
            value={chatEndpointType}
            onValueChange={(value) => onChatEndpointTypeChange(value as ModelChatEndpointType)}
          >
            <SelectTrigger id={`${uid}-chat-protocol`} className="min-h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {chatEndpointTypes.map((endpointType) => (
                <SelectItem key={endpointType} value={endpointType}>
                  {ENDPOINT_LABELS[endpointType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </FieldSet>
  )
}
