import type { WindowBoundsState } from './cacheValueTypes'

export type IsTemplateKey<K extends string> = K extends `${string}\${${string}}${string}`
  ? true
  : false

export type ExpandTemplateKey<T extends string> =
  T extends `${infer Prefix}\${${string}}${infer Suffix}`
    ? `${Prefix}${string}${ExpandTemplateKey<Suffix>}`
    : T

export type ProcessKey<K extends string> = IsTemplateKey<K> extends true ? ExpandTemplateKey<K> : K

/** Renderer memory cache. No feature-specific keys remain. */
export type UseCacheSchema = {
  'internal.renderer_cache_probe': null
  'internal.renderer_cache_counter': number
}
export const DefaultUseCache: UseCacheSchema = {
  'internal.renderer_cache_probe': null,
  'internal.renderer_cache_counter': 0
}

/** Cross-window memory cache. No feature-specific keys remain. */
export type SharedCacheSchema = {
  'internal.shared_cache_probe': null
  'internal.shared_cache_flag': boolean
  'internal.shared_cache_text.${id}': string
  'internal.shared_cache_progress.${id}': { progress: number }
  'internal.shared_cache_state.${id}': { id: string; status: string }
}
export const DefaultSharedCache: SharedCacheSchema = {
  'internal.shared_cache_probe': null,
  'internal.shared_cache_flag': false,
  'internal.shared_cache_text.${id}': '',
  'internal.shared_cache_progress.${id}': { progress: 0 },
  'internal.shared_cache_state.${id}': { id: '', status: '' }
}

/** Renderer-persisted state used by the provider settings page. */
export type RendererPersistCacheSchema = {
  'settings.provider.last_selected_provider_id': string | null
}

export const DefaultRendererPersistCache: RendererPersistCacheSchema = {
  'settings.provider.last_selected_provider_id': null
}

/** Main-process persisted infrastructure state. */
export type MainPersistCacheSchema = {
  'internal.persist_probe': number
  'window.bounds': Record<string, WindowBoundsState>
}

export const DefaultMainPersistCache: MainPersistCacheSchema = {
  'internal.persist_probe': 0,
  'window.bounds': {}
}

export type RendererPersistCacheKey = keyof RendererPersistCacheSchema
export type MainPersistCacheKey = keyof MainPersistCacheSchema

export type SharedCacheKey = {
  [K in keyof SharedCacheSchema]: ProcessKey<K & string>
}[keyof SharedCacheSchema]

export type InferSharedCacheValue<K extends string> = {
  [S in keyof SharedCacheSchema]: K extends ProcessKey<S & string> ? SharedCacheSchema[S] : never
}[keyof SharedCacheSchema]

export type UseCacheKey = {
  [K in keyof UseCacheSchema]: ProcessKey<K & string>
}[keyof UseCacheSchema]

export type InferUseCacheValue<K extends string> = {
  [S in keyof UseCacheSchema]: K extends ProcessKey<S & string> ? UseCacheSchema[S] : never
}[keyof UseCacheSchema]

export type UseCacheCasualKey<K extends string> = K extends UseCacheKey ? never : K
