import type { BootConfigPreferenceKeys } from '@shared/data/bootConfig/bootConfigTypes'
import type { ShortcutBinding } from '@shared/utils/shortcut'

import type { PreferenceSchemas } from './preferenceSchemas'

export type PreferenceDefaultScopeType = PreferenceSchemas['default']
export type PreferenceKeyType = keyof PreferenceDefaultScopeType

export type UnifiedPreferenceType = PreferenceDefaultScopeType & BootConfigPreferenceKeys
export type UnifiedPreferenceKeyType = keyof UnifiedPreferenceType

export type UnifiedPreferenceMultipleResultType<K extends UnifiedPreferenceKeyType> = {
  [P in K]: UnifiedPreferenceType[P]
}

export type PreferenceUpdateOptions = {
  optimistic: boolean
}

export type PreferenceShortcutType = {
  binding: ShortcutBinding
  enabled: boolean
}

export type MenuPresentationMode = 'native' | 'nexus'

export enum ThemeMode {
  light = 'light',
  dark = 'dark',
  system = 'system'
}

export type ProxyMode = 'system' | 'custom' | 'none'

