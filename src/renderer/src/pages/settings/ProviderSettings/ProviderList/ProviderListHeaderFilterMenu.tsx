import { MenuItem, MenuList, Popover, PopoverContent, PopoverTrigger } from '@nexus/ui'
import { providerListClasses } from '@renderer/pages/settings/ProviderSettings/primitives/ProviderSettingsPrimitives'
import { cn } from '@renderer/utils/style'
import { Check, Filter } from 'lucide-react'
import { useState } from 'react'

import type { ProviderFilterMode } from './providerFilterMode'

const FILTER_MENU_OPTIONS: { mode: ProviderFilterMode; label: string }[] = [
  { mode: 'all', label: '全部服务商' },
  { mode: 'enabled', label: '仅已启用' },
  { mode: 'disabled', label: '仅已禁用' }
]

interface ProviderListHeaderFilterMenuProps {
  filterMode: ProviderFilterMode
  disabled: boolean
  triggerClassName?: string
  triggerIconSize?: number
  onFilterChange: (mode: ProviderFilterMode) => void
}

export default function ProviderListHeaderFilterMenu({
  filterMode,
  disabled,
  triggerClassName = providerListClasses.headerIconButton,
  triggerIconSize = 14,
  onFilterChange
}: ProviderListHeaderFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const hasActiveFilter = filterMode !== 'all'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={'筛选服务商'}
          disabled={disabled}
          className={cn('group', triggerClassName)}
        >
          <Filter
            size={triggerIconSize}
            className={cn(
              'shrink-0',
              hasActiveFilter
                ? 'text-primary!'
                : 'text-muted-foreground/60 group-hover:text-muted-foreground/80'
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-fit min-w-32 rounded-xl p-1.5">
        <MenuList className="gap-1">
          {FILTER_MENU_OPTIONS.map(({ mode, label }) => (
            <MenuItem
              key={mode}
              label={label}
              className="h-8 rounded-lg px-2.5 text-sm"
              icon={
                <Check
                  className={cn('size-3.5', filterMode === mode ? 'opacity-100' : 'opacity-0')}
                />
              }
              onClick={() => {
                onFilterChange(mode)
                setOpen(false)
              }}
            />
          ))}
        </MenuList>
      </PopoverContent>
    </Popover>
  )
}

