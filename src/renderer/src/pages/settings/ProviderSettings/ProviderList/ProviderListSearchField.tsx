import { providerListClasses } from '@renderer/pages/settings/ProviderSettings/primitives/ProviderSettingsPrimitives'
import { Search, X } from 'lucide-react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'

interface ProviderListSearchFieldProps {
  value: string
  disabled: boolean
  onValueChange: (value: string) => void
  /** Optional trailing slot rendered to the right of the input (e.g. filter trigger). */
  trailing?: ReactNode
}

export default function ProviderListSearchField({
  value,
  disabled,
  onValueChange,
  trailing
}: ProviderListSearchFieldProps) {
  return (
    <div className={providerListClasses.searchRow}>
      <div className={`${providerListClasses.searchWrap} min-w-0 flex-1`}>
        <Search className={providerListClasses.searchIcon} />
        <input
          value={value}
          placeholder={'搜索模型平台...'}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              onValueChange('')
            }
          }}
          disabled={disabled}
          className={providerListClasses.searchInput}
        />
        {value ? (
          <button
            type="button"
            aria-label={'清除'}
            disabled={disabled}
            onClick={() => onValueChange('')}
            className={providerListClasses.searchClearButton}
          >
            <X size={9} />
          </button>
        ) : null}
        {trailing}
      </div>
    </div>
  )
}

