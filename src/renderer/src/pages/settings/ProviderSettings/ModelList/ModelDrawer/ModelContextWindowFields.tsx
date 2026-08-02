import { Input } from '@nexus/ui'
import ProviderField from '@renderer/pages/settings/ProviderSettings/primitives/ProviderField'
import { drawerClasses } from '@renderer/pages/settings/ProviderSettings/primitives/ProviderSettingsPrimitives'

interface ModelContextWindowFieldsProps {
  contextWindow: string
  maxInputTokens: string
  maxOutputTokens: string
  onContextWindowChange: (value: string) => void
  onContextWindowBlur?: () => void
  onMaxInputTokensChange: (value: string) => void
  onMaxInputTokensBlur?: () => void
  onMaxOutputTokensChange: (value: string) => void
  onMaxOutputTokensBlur?: () => void
}

export function ModelContextWindowFields({
  contextWindow,
  maxInputTokens,
  maxOutputTokens,
  onContextWindowChange,
  onContextWindowBlur,
  onMaxInputTokensChange,
  onMaxInputTokensBlur,
  onMaxOutputTokensChange,
  onMaxOutputTokensBlur
}: ModelContextWindowFieldsProps) {
  return (
    <>
      <ProviderField
        title={'上下文窗口'}
        titleClassName={drawerClasses.fieldTitle}
        className={drawerClasses.field}
      >
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label={'上下文窗口'}
          value={contextWindow}
          placeholder={'例如 128000'}
          className={drawerClasses.input}
          onChange={(event) => onContextWindowChange(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={onContextWindowBlur}
        />
      </ProviderField>

      <ProviderField
        title={'最大输入 Token'}
        titleClassName={drawerClasses.fieldTitle}
        className={drawerClasses.field}
      >
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label={'最大输入 Token'}
          value={maxInputTokens}
          placeholder={'例如 128000'}
          className={drawerClasses.input}
          onChange={(event) => onMaxInputTokensChange(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={onMaxInputTokensBlur}
        />
      </ProviderField>

      <ProviderField
        title={'最大输出 Token'}
        titleClassName={drawerClasses.fieldTitle}
        className={drawerClasses.field}
      >
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label={'最大输出 Token'}
          value={maxOutputTokens}
          placeholder={'例如 4096'}
          className={drawerClasses.input}
          onChange={(event) => onMaxOutputTokensChange(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={onMaxOutputTokensBlur}
        />
      </ProviderField>
    </>
  )
}
