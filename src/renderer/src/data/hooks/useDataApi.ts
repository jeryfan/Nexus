/**
 * @fileoverview React hooks for data fetching with SWR integration.
 *
 * This module provides type-safe hooks for interacting with the DataApi:
 *
 * - {@link useQuery} - Fetch data with automatic caching and revalidation
 * - {@link useMutation} - Perform POST/PUT/PATCH/DELETE operations
 * - {@link useDataChange} - Subscribe to DataApi data change notifications
 * - {@link useInvalidateCache} - Manual cache invalidation
 * - {@link useReadCache} - Non-reactive cache peek (single sanctioned home for `unstable_serialize`)
 * - {@link useWriteCache} - Write to a cache key without revalidating (optimistic overlay)
 * - {@link prefetch} - Warm up cache before user interactions
 *
 * All hooks use SWR under the hood for caching, deduplication, and revalidation.
 *
 * @example
 * // Basic data fetching
 * const { data, isLoading } = useQuery('/providers')
 *
 * @example
 * // Create with auto-refresh
 * const { trigger } = useMutation('POST', '/providers', { refresh: ['/providers'] })
 * await trigger({ body: { providerId: 'acme', name: 'Acme' } })
 *
 * @example
 * // Template path + `/*` prefix refresh
 * const { trigger } = useMutation('PATCH', '/providers/:providerId', {
 *   refresh: ({ args }) => ['/providers', `/providers/${args.params.providerId}/*`]
 * })
 * await trigger({ params: { providerId }, body: { isEnabled: true } })
 *
 * @see {@link https://swr.vercel.app SWR Documentation}
 */

import { dataApiService } from '@data/DataApiService'
import { loggerService } from '@logger'
import { isDev } from '@renderer/utils/platform'
import type {
  ApiPath,
  BodyForPath,
  ParamsForPath,
  QueryParamsForPath,
  ResponseForPath,
  TemplateApiPaths
} from '@shared/data/api/paths'
import type {
  ConcreteApiPaths,
  DataApiDataChangeEffect,
  GetMethodApiPaths
} from '@shared/data/api/types'
import { useCallback, useEffect, useRef } from 'react'
import type { KeyedMutator, ScopedMutator, SWRConfiguration } from 'swr'
import useSWR, { preload, unstable_serialize, useSWRConfig } from 'swr'
import type { SWRMutationConfiguration } from 'swr/mutation'
import useSWRMutation from 'swr/mutation'

const logger = loggerService.withContext('useDataApi')

/**
 * Default SWR options. DataApi runs over IPC (not HTTP) and DataApiService
 * already retries via `DataApiError.isRetryable` with exponential backoff, so
 * SWR's HTTP-flavored focus/reconnect revalidation and naive retry are
 * disabled — retry stays single-layered through DataApiService.
 *
 * @remarks
 * - `revalidateOnFocus: false` — focus events don't imply data staleness here
 * - `revalidateOnReconnect: false` — IPC has no "reconnect" semantics
 * - `dedupingInterval: 5000` — dedupe duplicate fetches within 5s
 * - `shouldRetryOnError: false` — DataApiService is the single retry decision point
 * - `keepPreviousData: true` — show last data while a new key fetches; consumers
 *   distinguish "stale" from "loading" via `isRefreshing`
 */
const DEFAULT_SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 5000,
  shouldRetryOnError: false,
  keepPreviousData: true
} as const

// ============================================================================
// Hook Result Types
// ============================================================================

/**
 * Map a path to the shape of its `params` option.
 *
 * - Template paths (literal `keyof ApiSchemas`) whose schema method declares
 *   `params: {...}` → `params` is required with the declared shape.
 * - Template paths whose method declares no `params` → `params` is forbidden.
 * - Pre-resolved concrete paths (like `/providers/abc`) → `params` is always
 *   forbidden, because the caller already inlined the values.
 *
 * Uses `[T] extends [never]` tuple-wrap to disable distributive conditional
 * evaluation over unions.
 */
export type ParamsOption<
  TPath extends string,
  TMethod extends string
> = TPath extends TemplateApiPaths
  ? [ParamsForPath<TPath, TMethod>] extends [never]
    ? { params?: never }
    : { params: ParamsForPath<TPath, TMethod> }
  : { params?: never }

/**
 * useQuery result type
 * @property data - The fetched data, undefined while loading or on error
 * @property isLoading - True during initial load (no cached data)
 * @property isRefreshing - True during background revalidation (has cached data)
 * @property error - Error object if the request failed
 * @property refetch - Trigger a revalidation from the server
 * @property mutate - SWR mutator for advanced cache control (optimistic updates, manual cache manipulation)
 */
export interface UseQueryResult<TPath extends ApiPath> {
  data?: ResponseForPath<TPath, 'GET'>
  isLoading: boolean
  isRefreshing: boolean
  error?: Error
  refetch: () => Promise<unknown>
  mutate: KeyedMutator<ResponseForPath<TPath, 'GET'>>
}

/**
 * Arguments accepted by the mutation `trigger` function.
 *
 * `params` is required for template paths (like `/providers/:providerId`) and
 * forbidden for pre-resolved concrete paths — the distinction is enforced at
 * the type level via {@link ParamsOption}.
 */
export type TriggerArgs<
  TPath extends ApiPath,
  TMethod extends 'POST' | 'PUT' | 'DELETE' | 'PATCH'
> = ParamsOption<TPath, TMethod> & {
  body?: BodyForPath<TPath, TMethod>
  query?: QueryParamsForPath<TPath, TMethod>
}

/**
 * Context passed to a function-form `refresh` callback.
 */
export interface RefreshContext<
  TPath extends ApiPath,
  TMethod extends 'POST' | 'PUT' | 'DELETE' | 'PATCH'
> {
  /** The args passed to the current `trigger(...)` call */
  args: TriggerArgs<TPath, TMethod> | undefined
  /** The server response from this mutation */
  result: ResponseForPath<TPath, TMethod>
}

/**
 * `refresh` option shape: either a static array of paths (supporting `/*`
 * prefix matching) or a function computing paths from the trigger args and
 * server response.
 */
export type RefreshOption<
  TPath extends ApiPath,
  TMethod extends 'POST' | 'PUT' | 'DELETE' | 'PATCH'
> = ConcreteApiPaths[] | ((ctx: RefreshContext<TPath, TMethod>) => ConcreteApiPaths[])

/**
 * useMutation result type
 * @property trigger - Execute the mutation with optional params, body, query.
 *   Identity is stable across renders (like SWR's own trigger), so it is safe
 *   to list in useCallback/useEffect dependency arrays.
 * @property isLoading - True while the mutation is in progress
 * @property error - Error object if the last mutation failed
 */
export interface UseMutationResult<
  TPath extends ApiPath,
  TMethod extends 'POST' | 'PUT' | 'DELETE' | 'PATCH'
> {
  trigger: (data?: TriggerArgs<TPath, TMethod>) => Promise<ResponseForPath<TPath, TMethod>>
  isLoading: boolean
  error: Error | undefined
}

/**
 * Data fetching hook with SWR caching and revalidation.
 *
 * Features:
 * - Automatic caching and deduplication
 * - Background revalidation on focus/reconnect
 * - Error retry with exponential backoff
 *
 * @param path - API endpoint path (e.g., '/providers', '/models')
 * @param options - Query options
 * @param options.query - Query parameters for filtering
 * @param options.enabled - Set to false to disable the request (default: true)
 * @param options.swrOptions - Override default SWR configuration
 * @returns Query result with data, loading states, and cache controls
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = useQuery('/providers')
 *
 * @example
 * // With query parameters
 * const { data } = useQuery('/models', { query: { providerId: 'openai' } })
 *
 * @example
 * // Conditional fetching
 * const { data } = useQuery('/providers', { enabled: settingsVisible })
 *
 * @example
 * // Manual cache update
 * const { data, mutate } = useQuery('/providers/:providerId', { params: { providerId } })
 * mutate(data ? { ...data, name: 'Updated' } : data, { revalidate: false })
 *
 * @example
 * // Template path + params (prefer a helper like `providerPath(id)` when the id is stable)
 * const { data } = useQuery('/providers/:providerId', { params: { providerId } })
 */
export function useQuery<TPath extends ApiPath>(
  path: TPath,
  options?: ParamsOption<TPath, 'GET'> & {
    /** Query parameters for filtering. */
    query?: QueryParamsForPath<TPath, 'GET'>
    /** Disable the request (default: true) */
    enabled?: boolean
    /** Override default SWR configuration */
    swrOptions?: SWRConfiguration
  }
): UseQueryResult<TPath> {
  const isEnabled = options?.enabled !== false
  const resolvedPath = isEnabled
    ? resolveTemplate(path, options?.params as Record<string, string | number> | undefined)
    : null
  const key =
    isEnabled && resolvedPath
      ? buildSWRKey(resolvedPath, options?.query as Record<string, any> | undefined)
      : null

  const { data, error, isLoading, isValidating, mutate } = useSWR(key, getFetcher, {
    ...DEFAULT_SWR_OPTIONS,
    ...options?.swrOptions
  })

  const refetch = useCallback(() => mutate(), [mutate])

  return {
    data,
    isLoading,
    isRefreshing: isValidating,
    error: error as Error | undefined,
    refetch,
    mutate
  }
}

/**
 * Mutation hook for POST, PUT, DELETE, PATCH operations.
 *
 * Features:
 * - Automatic cache invalidation via refresh option
 * - Optimistic updates with automatic rollback on error
 * - Success/error callbacks
 *
 * @param method - HTTP method ('POST' | 'PUT' | 'DELETE' | 'PATCH')
 * @param path - API endpoint path
 * @param options - Mutation options
 * @param options.onSuccess - Callback when mutation succeeds
 * @param options.onError - Callback when mutation fails
 * @param options.refresh - API paths to revalidate on success
 * @param options.optimisticData - If provided, updates cache immediately before request completes
 * @param options.swrOptions - Override SWR mutation configuration
 * @returns Mutation result with trigger function and loading state
 *
 * @example
 * // Basic POST
 * const { trigger, isLoading } = useMutation('POST', '/providers')
 * await trigger({ body: { providerId: 'acme', name: 'Acme' } })
 *
 * @example
 * // With auto-refresh and callbacks
 * const { trigger } = useMutation('POST', '/providers', {
 *   refresh: ['/providers'],
 *   onSuccess: (data) => toast.success('Created!'),
 *   onError: (error) => toast.error(error.message)
 * })
 *
 * @example
 * // Optimistic update (UI updates immediately, rolls back on error)
 * const { trigger } = useMutation('PATCH', '/providers/:providerId', {
 *   optimisticData: { ...provider, isEnabled: true }
 * })
 *
 * @example
 * // `/*` prefix in refresh invalidates all sub-paths of a resource (including unknown ids)
 * useMutation('DELETE', '/providers/:providerId', {
 *   refresh: ({ args }) => ['/providers', `/providers/${args.params.providerId}/*`]
 * })
 *
 * @example
 * // Function-form refresh when invalidated keys depend on trigger arguments
 * useMutation('PATCH', '/providers/:providerId', {
 *   refresh: ({ args }) => ['/providers', `/providers/${args.params.providerId}`]
 * })
 *
 * @remarks
 * Template paths (e.g., `/providers/:providerId`) share SWR mutation state across all
 * `params` triggered on the same hook instance. Don't trigger different ids
 * concurrently from one hook — use per-row instances bound to concrete paths
 * (e.g., `useMutation('PATCH', providerPath(id))`) when you need parallel writes.
 *
 * @remarks
 * Callback / side-effect ordering after a successful mutation:
 * 1. Server response resolves.
 * 2. `refresh` keys are invalidated for matching `useQuery` cache entries.
 * 3. `onSuccess` callback runs. Any `useQuery` the callback touches will be
 *    in "stale, pending revalidation" state — avoid manual optimistic
 *    `mutate(...)` here as it races with the pending revalidation.
 * 4. If `optimisticData` was set, the mutated cache key is re-validated.
 * A thrown `refresh` callback is caught and logged; it does not cause the
 * `trigger` promise to reject or skip `onSuccess`.
 *
 * @remarks
 * The returned `trigger` is memoized and reads options through a ref: passing
 * a fresh inline options object does not change trigger identity, and trigger
 * always sees the latest `onSuccess` / `onError` / `refresh` / `optimisticData`
 * at call time.
 */
export function useMutation<
  TPath extends ApiPath,
  TMethod extends 'POST' | 'PUT' | 'DELETE' | 'PATCH'
>(
  method: TMethod,
  path: TPath,
  options?: {
    /** Callback when mutation succeeds */
    onSuccess?: (data: ResponseForPath<TPath, TMethod>) => void
    /** Callback when mutation fails */
    onError?: (error: Error) => void
    /** API paths to revalidate on success; supports trailing `/*` for prefix match or a function of trigger args/result */
    refresh?: RefreshOption<TPath, TMethod>
    /** If provided, updates cache immediately (with auto-rollback on error) */
    optimisticData?: ResponseForPath<TPath, TMethod>
    /** Override SWR mutation configuration (fetcher, onSuccess, onError are handled internally) */
    swrOptions?: Omit<
      SWRMutationConfiguration<ResponseForPath<TPath, TMethod>, Error>,
      'fetcher' | 'onSuccess' | 'onError'
    >
  }
): UseMutationResult<TPath, TMethod> {
  const { mutate: globalMutate } = useSWRConfig()

  // Use ref to avoid stale closure issues with callbacks
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  // Track the params from the most recent in-flight trigger, for dev-mode
  // concurrency detection on template paths.
  const inFlightParamsRef = useRef<Record<string, unknown> | null>(null)

  const apiFetcher = createApiFetcher<ConcreteApiPaths, TMethod>(method)

  // Fetcher resolves the template using the arg's `params` so the outgoing
  // request hits the concrete URL. The SWR mutation key (the template itself)
  // stays stable across triggers, which is what SWR needs for hook identity.
  const fetcher = async (
    templatePath: string,
    {
      arg
    }: {
      arg?: {
        params?: Record<string, string | number>
        body?: BodyForPath<TPath, TMethod>
        query?: QueryParamsForPath<TPath, TMethod>
      }
    }
  ): Promise<ResponseForPath<TPath, TMethod>> => {
    const resolvedPath = resolveTemplate(templatePath, arg?.params)
    return apiFetcher(resolvedPath as ConcreteApiPaths, {
      body: arg?.body as BodyForPath<ConcreteApiPaths, TMethod>,
      query: arg?.query as QueryParamsForPath<ConcreteApiPaths, TMethod>
    }) as Promise<ResponseForPath<TPath, TMethod>>
  }

  // SWR mutation state is cached by path; for template paths this means a
  // single hook instance shares `isMutating`/`error` across all params. See the
  // "Template paths and concurrent trigger" caveat in the renderer docs.
  const {
    trigger: swrTrigger,
    isMutating,
    error
    // SWR's MutationFetcher generic over TPath + ExtraArg doesn't infer cleanly
    // here (our ExtraArg shape mixes schema-derived body/query types), so we
    // widen the key to `string` for SWR while keeping TPath precision elsewhere.
  } = useSWRMutation(path as string, fetcher, {
    populateCache: false,
    revalidate: false,
    onError: (err) => optionsRef.current?.onError?.(err),
    ...options?.swrOptions
  })

  // Memoized so the returned `trigger` keeps a stable identity across renders
  // (an official contract of this layer — see the hook's @remarks). Latest
  // options are read via `optionsRef` at call time, so a stable identity does
  // not stale the option callbacks.
  const trigger = useCallback(
    async (data?: TriggerArgs<TPath, TMethod>): Promise<ResponseForPath<TPath, TMethod>> => {
      const opts = optionsRef.current
      // Capture args in this call's closure so concurrent triggers don't clobber
      // each other's refresh context (refs would race on overlapping awaits).
      const capturedArgs = data
      const paramsRecord = capturedArgs?.params as Record<string, string | number> | undefined
      const resolvedPath = resolveTemplate(path, paramsRecord)
      const hasOptimisticData = opts?.optimisticData !== undefined

      // Dev-mode: warn when a single template-hook instance is trigger'd with
      // different params while a previous call is still in-flight. We check the
      // ref rather than SWR's `isMutating` because React state updates lag a
      // render — synchronous bursts (e.g. `Promise.all([trigger(a), trigger(b)])`)
      // would see stale `isMutating === false` in both closures and the warning
      // would never fire. The ref is updated synchronously on trigger entry.
      if (isDev && paramsRecord) {
        const prev = inFlightParamsRef.current
        if (prev && JSON.stringify(prev) !== JSON.stringify(paramsRecord)) {
          logger.warn(
            `Concurrent trigger on template useMutation: ${method} ${String(path)}. ` +
              `In-flight params=${JSON.stringify(prev)}, new params=${JSON.stringify(paramsRecord)}. ` +
              `isMutating/error state will be shared between the two calls. ` +
              `Use per-row hook instances with concrete paths (e.g. useMutation('${method}', providerPath(id))) for parallel writes.`
          )
        }
      }
      inFlightParamsRef.current = paramsRecord ?? null

      // Apply optimistic update if optimisticData is provided
      if (hasOptimisticData) {
        await globalMutate([resolvedPath], opts.optimisticData, false)
      }

      try {
        const result = await swrTrigger({
          params: paramsRecord,
          body: capturedArgs?.body,
          query: capturedArgs?.query
        } as {
          params?: Record<string, string | number>
          body?: BodyForPath<TPath, TMethod>
          query?: QueryParamsForPath<TPath, TMethod>
        })

        // Run refresh after the mutation resolves. We do this in `trigger`
        // itself (not SWR's onSuccess) so args/result are closure-captured
        // and tied to this specific call.
        //
        // Refresh is an after-success side effect, not part of the mutation's
        // success contract. If a user-provided function-form refresh throws
        // (e.g. dereferences a missing arg), or if SWR revalidation surfaces
        // an error, we must NOT propagate it — the server-side mutation has
        // already succeeded and the caller's `await trigger()` must resolve
        // accordingly. Log and continue instead.
        const refreshOpt = opts?.refresh
        if (refreshOpt) {
          try {
            const keys =
              typeof refreshOpt === 'function'
                ? refreshOpt({ args: capturedArgs, result })
                : refreshOpt
            if (keys.length > 0) {
              await invalidatePathPatterns(globalMutate, keys)
            }
          } catch (refreshErr) {
            logger.warn(
              `Refresh failed after successful ${method} ${String(path)}; cache may be stale`,
              {
                error: refreshErr
              }
            )
          }
        }

        opts?.onSuccess?.(result)

        // Revalidate after optimistic update completes
        if (hasOptimisticData) {
          await globalMutate([resolvedPath])
        }

        return result
      } catch (err) {
        // Rollback optimistic update on error
        if (hasOptimisticData) {
          await globalMutate([resolvedPath])
        }
        throw err
      } finally {
        if (inFlightParamsRef.current === paramsRecord) {
          inFlightParamsRef.current = null
        }
      }
    },
    [globalMutate, method, path, swrTrigger]
  )

  return {
    trigger,
    isLoading: isMutating,
    error
  }
}

/**
 * Hook to invalidate SWR cache entries and trigger revalidation.
 *
 * Use this to manually clear cached data and force a fresh fetch.
 *
 * @returns Invalidate function that accepts keys to invalidate
 *
 * @example
 * const invalidate = useInvalidateCache()
 *
 * // Invalidate specific path
 * await invalidate('/providers')
 *
 * // Invalidate multiple paths
 * await invalidate(['/providers', '/models'])
 *
 * // Invalidate all cached data
 * await invalidate(true)
 *
 * @example
 * // `/*` prefix invalidates all sub-paths of a resource
 * await invalidate('/providers/*')
 * await invalidate(['/providers', '/providers/*'])
 *
 * @remarks
 * Path-based invalidation accepts exact paths and trailing `/*` prefixes.
 */
export function useInvalidateCache() {
  const { mutate } = useSWRConfig()

  const invalidate = useCallback(
    async (keys?: string | string[] | boolean): Promise<void> => {
      if (keys === true || keys === undefined) {
        await mutate(() => true)
        return
      }
      if (keys === false) return
      const patterns = typeof keys === 'string' ? [keys] : keys
      await invalidatePathPatterns(mutate, patterns)
    },
    [mutate]
  )

  return invalidate
}

/**
 * Prefetch data to warm up the cache before user interactions.
 *
 * Uses SWR preload to fetch and cache data. Subsequent useQuery calls
 * with the same path and query will use the cached data immediately.
 *
 * @param path - API endpoint path to prefetch
 * @param options - Prefetch options
 * @param options.query - Query parameters (must match useQuery call)
 * @returns Promise resolving to the fetched data
 *
 * @example
 * // Prefetch on hover
 * onMouseEnter={() => prefetch('/providers/openai')}
 *
 * @example
 * // Prefetch with query params
 * await prefetch('/models', { query: { providerId: 'openai' } })
 * // Later, this will be instant:
 * const { data } = useQuery('/models', { query: { providerId: 'openai' } })
 *
 * @example
 * // Template path + params — produces the same cache key as useQuery('/providers/:id', {...})
 * await prefetch('/providers/:providerId', { params: { providerId } })
 */
export function prefetch<TPath extends ApiPath>(
  path: TPath,
  options?: ParamsOption<TPath, 'GET'> & {
    query?: QueryParamsForPath<TPath, 'GET'>
  }
): Promise<ResponseForPath<TPath, 'GET'>> {
  const resolvedPath = resolveTemplate(
    path,
    options?.params as Record<string, string | number> | undefined
  )
  const key = buildSWRKey(resolvedPath, options?.query as Record<string, any> | undefined)
  return preload(key, getFetcher)
}

/**
 * Hook: snapshot-read a cached GET response WITHOUT subscribing.
 *
 * Returns a reader function that peeks the current value of a cache key and
 * returns `undefined` when the key has not been fetched yet. The reader does
 * NOT subscribe — calling it does not re-render the component when the cache
 * entry changes.
 *
 * Use this for one-shot reads inside callbacks or optimistic-update reducers
 * where re-rendering on cache change is explicitly undesirable (e.g.
 * {@link useMutation} callbacks, drag-and-drop optimistic writes). For
 * reactive access, use {@link useQuery} instead.
 *
 * This hook is the ONLY sanctioned place in the codebase to reach for SWR's
 * internal key serialization (`unstable_serialize`) and raw cache API — any
 * other hook that needs non-reactive cache reads must go through here so the
 * unstable-surface stays confined to a single file.
 *
 * @example
 * // Inside a callback, peek the current collection before computing an
 * // optimistic overlay.
 * const readSnapshot = useReadCache()
 * const handleDrop = (next: Item[]) => {
 *   const current = readSnapshot<{ items: Item[] }>('/providers')
 *   // ...derive optimistic value from current + next
 * }
 */
export function useReadCache() {
  const { cache } = useSWRConfig()

  return useCallback(
    <TResponse = unknown>(
      path: ConcreteApiPaths | TemplateApiPaths,
      query?: Record<string, unknown>
    ): TResponse | undefined => {
      const hasQuery = query !== undefined && Object.keys(query).length > 0
      const serialized = hasQuery ? unstable_serialize([path, query]) : unstable_serialize([path])
      const entry = cache.get(serialized)
      return entry?.data as TResponse | undefined
    },
    [cache]
  )
}

/**
 * Hook: write a value into the cache under a GET key WITHOUT triggering a
 * revalidation.
 *
 * Returns a writer function that mirrors {@link useQuery}'s cache-key shape
 * — pass the same `path` (+ optional `query`) you would to `useQuery` and it
 * overwrites that entry in-place. This is the sanctioned form of
 * `mutate(key, value, false)` for the DataApi layer; `useReorder` and any
 * future hook needing to seed an optimistic overlay go through here instead
 * of touching `useSWRConfig` directly.
 *
 * The write does NOT mark the entry stale and does NOT schedule a fetch —
 * callers who need a follow-up revalidate use {@link useInvalidateCache} or
 * rely on {@link useMutation}'s `refresh` option to handle it.
 *
 * @example
 * const writeCache = useWriteCache()
 * const invalidate = useInvalidateCache()
 *
 * // Seed an optimistic value derived from the current cache + user input.
 * await writeCache('/providers', nextCollection)
 * try {
 *   await patchServer({ body })
 * } catch (err) {
 *   // Rollback: force server truth back into cache.
 *   await invalidate('/providers')
 *   throw err
 * }
 */
export function useWriteCache() {
  const { mutate } = useSWRConfig()

  return useCallback(
    async <TResponse = unknown>(
      path: ConcreteApiPaths | TemplateApiPaths,
      value: TResponse,
      query?: Record<string, unknown>
    ): Promise<void> => {
      const hasQuery = query !== undefined && Object.keys(query).length > 0
      const key = hasQuery ? [path, query] : [path]
      // `false` (third arg) tells SWR: overwrite the cached value and skip
      // revalidation. Critical for optimistic overlays — we want the UI to
      // see the value immediately without racing with a GET.
      await mutate(key, value, false)
    },
    [mutate]
  )
}

// ============================================================================
// Data Change Subscription Hook
// ============================================================================

/**
 * Subscribe to DataApi data change notifications for the component's lifetime.
 *
 * Thin React binding over {@link DataApiService.onDataChanged}: subscribes on
 * mount, unsubscribes on unmount, and always invokes the LATEST `listener`
 * (safe to pass an inline closure — re-renders do not resubscribe).
 *
 * The listener receives, for each notification, the entries matching any of
 * the subscribed endpoints merged into one call. Everything below the
 * endpoint is consumer policy: dimension/entityIds filtering, choosing
 * revalidate / rebuild / ignore, and idempotency towards echoes of this
 * window's own writes.
 *
 * @example
 * // Conservative list convergence: any signal → refetch
 * useDataChange('/providers', () => refetch())
 *
 * @example
 * // By-ID surface: filter with entityIds (absent = no claim → act)
 * useDataChange('/providers/:providerId', (effects) => {
 *   if (effects.some((e) => !e.entityIds || e.entityIds.includes(providerId))) mutate()
 * })
 */
export function useDataChange(
  endpoints: GetMethodApiPaths | GetMethodApiPaths[],
  listener: (effects: DataApiDataChangeEffect[]) => void
): void {
  const listenerRef = useRef(listener)
  useEffect(() => {
    listenerRef.current = listener
  })

  // Value-stable key: a fresh inline array with the same endpoints must not
  // resubscribe. NUL-joined — schema template paths are literals that cannot
  // contain '\0', so the key is collision-free.
  const endpointsKey = Array.isArray(endpoints) ? endpoints.join('\0') : endpoints
  useEffect(() => {
    // An empty endpoints array yields an empty key — nothing to subscribe to.
    if (endpointsKey === '') return
    const endpointList = endpointsKey.split('\0') as GetMethodApiPaths[]
    return dataApiService.onDataChanged(endpointList, (effects) => listenerRef.current(effects))
  }, [endpointsKey])
}

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Create a type-safe API fetcher for the specified HTTP method.
 *
 * @internal
 * @param method - HTTP method to use
 * @returns Async function that makes the API request
 *
 * @remarks
 * Type assertion at dataApiService boundary is intentional since dataApiService
 * accepts 'any' for maximum flexibility.
 */
function createApiFetcher<
  TPath extends ConcreteApiPaths,
  TMethod extends 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
>(method: TMethod) {
  return async (
    path: TPath,
    options?: {
      body?: BodyForPath<TPath, TMethod>
      query?: QueryParamsForPath<TPath, TMethod>
    }
  ): Promise<ResponseForPath<TPath, TMethod>> => {
    // TS can't narrow generic TMethod in switch branches, so per-branch type assertions are needed
    const query = options?.query
    switch (method) {
      case 'GET':
        return dataApiService.get(path, {
          query: query as QueryParamsForPath<TPath, 'GET'>
        }) as Promise<ResponseForPath<TPath, TMethod>>
      case 'POST':
        return dataApiService.post(path, {
          body: options?.body as BodyForPath<TPath, 'POST'>,
          query: query as QueryParamsForPath<TPath, 'POST'>
        }) as Promise<ResponseForPath<TPath, TMethod>>
      case 'PUT':
        return dataApiService.put(path, {
          body: (options?.body || {}) as BodyForPath<TPath, 'PUT'>,
          query: query as QueryParamsForPath<TPath, 'PUT'>
        }) as Promise<ResponseForPath<TPath, TMethod>>
      case 'DELETE':
        return dataApiService.delete(path, {
          query: query as QueryParamsForPath<TPath, 'DELETE'>
        }) as Promise<ResponseForPath<TPath, TMethod>>
      case 'PATCH':
        return dataApiService.patch(path, {
          body: options?.body as BodyForPath<TPath, 'PATCH'>,
          query: query as QueryParamsForPath<TPath, 'PATCH'>
        }) as Promise<ResponseForPath<TPath, TMethod>>
      default:
        throw new Error(`Unsupported method: ${method}`)
    }
  }
}

/**
 * Build SWR cache key from resolved path and optional query parameters.
 *
 * Path must already be template-resolved (via {@link resolveTemplate}) so that
 * a `useQuery('/providers/:id', { params: { id: 'abc' } })` call and a caller
 * passing `'/providers/abc'` directly produce byte-for-byte identical keys.
 *
 * @internal
 * @param path - Resolved (concrete) API endpoint path
 * @param query - Optional query parameters
 * @returns Tuple of [path] or [path, query] for SWR cache key
 */
function buildSWRKey<TQuery extends Record<string, any>>(
  path: string,
  query?: TQuery
): [string] | [string, TQuery] {
  if (query && Object.keys(query).length > 0) {
    return [path, query]
  }

  return [path]
}

/**
 * SWR fetcher function for GET requests.
 *
 * @internal
 * @param key - SWR cache key tuple [path, query?]
 * @returns Promise resolving to the API response
 */
function getFetcher<TPath extends ConcreteApiPaths>([path, query]: [
  TPath,
  QueryParamsForPath<TPath, 'GET'>?
]): Promise<ResponseForPath<TPath, 'GET'>> {
  const apiFetcher = createApiFetcher<TPath, 'GET'>('GET')
  return apiFetcher(path, { query })
}

/**
 * Validate a refresh pattern in dev mode.
 *
 * Enforces:
 * - Patterns ending with `*` must end with `/*` (complete path segment prefix)
 * - Prefix must be at least 2 characters after the leading slash (no bare `/*` or `/x*`)
 *
 * @internal
 * @throws Error in development mode if pattern is invalid; silent in production
 */
function assertValidPattern(pattern: string): void {
  if (!isDev) return
  if (pattern.endsWith('*') && !pattern.endsWith('/*')) {
    const msg = `Invalid refresh pattern "${pattern}": wildcard must be a full path segment (use "/foo/*" not "/foo*")`
    logger.error(msg)
    throw new Error(msg)
  }
  if (pattern === '/*' || pattern === '*') {
    const msg = `Invalid refresh pattern "${pattern}": bare wildcard would invalidate unrelated caches`
    logger.error(msg)
    throw new Error(msg)
  }
}

/**
 * Create a filter function that matches SWR cache keys by path.
 *
 * Matches cache keys in the form [path] or [path, query].
 *
 * Pattern semantics:
 * - `"/providers"` → exact match only `["/providers"]`
 * - `"/providers/*"` → prefix match all `["/providers/...", ...]`; preserves trailing `/`
 *   to avoid false positives on sibling resources like `/providers-archived`
 *
 * @internal
 * @param pattern - Path pattern; trailing `/*` enables prefix matching
 * @returns Filter function for use with SWR's mutate
 */
function createKeyMatcher(pattern: string): (key: unknown) => boolean {
  assertValidPattern(pattern)
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1) // keep trailing '/'
    return (key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith(prefix)
  }
  return (key) => Array.isArray(key) && key[0] === pattern
}

/**
 * Create a filter function that matches multiple paths.
 *
 * Supports a mix of exact and prefix (`/*`) patterns. See {@link createKeyMatcher}
 * for pattern semantics.
 *
 * @internal
 * @param patterns - Array of API paths; each may end with `/*` for prefix matching
 * @returns Filter function for use with SWR's mutate
 */
function createMultiKeyMatcher(patterns: string[]): (key: unknown) => boolean {
  patterns.forEach(assertValidPattern)
  const exact = patterns.filter((p) => !p.endsWith('/*'))
  const prefixes = patterns.filter((p) => p.endsWith('/*')).map((p) => p.slice(0, -1))
  return (key) => {
    if (!Array.isArray(key) || typeof key[0] !== 'string') return false
    const k = key[0]
    return exact.includes(k) || prefixes.some((prefix) => k.startsWith(prefix))
  }
}

/**
 * Invalidate cache entries whose path matches any exact or prefix pattern.
 *
 * @internal
 */
async function invalidatePathPatterns(
  globalMutate: ScopedMutator,
  patterns: string[]
): Promise<void> {
  await globalMutate(createMultiKeyMatcher(patterns))
}

/**
 * Replace Express-style `:name` and greedy `:name*` placeholders in a path
 * template with values from `params`.
 *
 * This is the single canonical path-replacement point for all data hooks — both
 * `useQuery`/`useMutation` (via `params` option) and internal key building go
 * through here. This guarantees a template path + params and a pre-resolved
 * path (e.g., `providerPath(id)`) produce byte-for-byte identical cache keys.
 *
 * Greedy params (`:name*`) consume the rest of the path segment, allowing IDs
 * that themselves contain `/` (e.g., `/models/:uniqueModelId*` where the id is
 * `openai:gpt-4/variant`).
 *
 * The leading `/` anchor in the placeholder regex distinguishes path params
 * (`/:providerId`) from verb-style RPC suffixes (`models:resolve`,
 * `models:reconcile`) — the latter are static literal segments and must not be
 * substituted, even when other params are supplied.
 *
 * @internal
 * @throws Error if a placeholder has no corresponding value in `params`
 */
function resolveTemplate(path: string, params?: Record<string, string | number>): string {
  if (!params || !path.includes(':')) return path
  return path.replace(/(?<=\/):([a-zA-Z][a-zA-Z0-9]*)\*?/g, (_match, key) => {
    const value = params[key]
    if (value === undefined || value === null) {
      throw new Error(`Missing param "${key}" for path "${path}"`)
    }
    return String(value)
  })
}

/**
 * Internal utilities exposed for unit testing only.
 *
 * @internal
 */
export const __testing = {
  get createKeyMatcher() {
    return createKeyMatcher
  },
  get createMultiKeyMatcher() {
    return createMultiKeyMatcher
  },
  get resolveTemplate() {
    return resolveTemplate
  },
  get buildSWRKey() {
    return buildSWRKey
  },
  get invalidatePathPatterns() {
    return invalidatePathPatterns
  }
}
