import type { StringKeys } from '@nexus/ai-core/provider'

import type { AppProviderSettingsMap } from './merged'

/** Fully resolved AI SDK provider settings for a model connection check. */
export interface ProviderConfig<
  T extends StringKeys<AppProviderSettingsMap> = StringKeys<AppProviderSettingsMap>
> {
  providerId: T
  providerSettings: AppProviderSettingsMap[T]
}
