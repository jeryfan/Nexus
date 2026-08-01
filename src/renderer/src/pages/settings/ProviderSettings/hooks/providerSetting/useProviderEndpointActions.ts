import { loggerService } from '@logger'
import { toast } from '@renderer/services/toast'
import { validateApiHost } from '@renderer/utils/api'
import {
  ErrorCode,
  isDataApiError,
  isSerializedDataApiError,
  toDataApiError
} from '@shared/data/api/errors'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { debounce, trim } from 'es-toolkit/compat'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { PatchProvider } from './types'

const logger = loggerService.withContext('ProviderSettings:EndpointActions')

function getEndpointActionErrorMessage(error: unknown, fallback: string): string {
  if (isDataApiError(error) || isSerializedDataApiError(error)) {
    const dataError = toDataApiError(error)
    switch (dataError.code) {
      case ErrorCode.VALIDATION_ERROR:
      case ErrorCode.UNAUTHORIZED:
      case ErrorCode.PERMISSION_DENIED:
      case ErrorCode.NOT_FOUND:
      case ErrorCode.CONFLICT:
      case ErrorCode.SERVICE_UNAVAILABLE:
      case ErrorCode.TIMEOUT:
        return dataError.message
      default:
        return fallback
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return `${fallback}: ${error.message}`
  }

  return fallback
}

interface UseProviderEndpointActionsParams {
  provider: Provider | undefined
  primaryEndpoint: string
  apiHost: string
  setApiHost: (value: string) => void
  providerApiHost: string
  anthropicApiHost: string
  setAnthropicApiHost: (value: string) => void
  apiVersion: string
  /** Registry factory-default host for the primary endpoint; '' when none. */
  defaultApiHost: string
  patchProvider: PatchProvider
}

/** Persists endpoint drafts through the provider data API. */
export function useProviderEndpointActions({
  provider,
  primaryEndpoint,
  apiHost,
  setApiHost,
  providerApiHost,
  anthropicApiHost,
  setAnthropicApiHost,
  apiVersion,
  defaultApiHost,
  patchProvider
}: UseProviderEndpointActionsParams) {
  const lastPersistedApiHostRef = useRef(trim(providerApiHost))

  useEffect(() => {
    lastPersistedApiHostRef.current = trim(providerApiHost)
  }, [providerApiHost])

  const buildNextApiEndpointConfigs = useCallback(
    (baseUrl: string) => {
      if (!provider) {
        return undefined
      }

      return {
        ...provider.endpointConfigs,
        [primaryEndpoint]: { ...provider.endpointConfigs?.[primaryEndpoint], baseUrl }
      }
    },
    [primaryEndpoint, provider]
  )

  const persistApiHostDraft = useCallback(
    async (nextApiHost: string) => {
      if (!provider) {
        return false
      }

      const trimmedApiHost = trim(nextApiHost)
      if (!validateApiHost(trimmedApiHost)) {
        return false
      }

      if (!trimmedApiHost) {
        return false
      }

      const nextEndpointConfigs = buildNextApiEndpointConfigs(trimmedApiHost)
      if (!nextEndpointConfigs) {
        return false
      }

      await patchProvider({ endpointConfigs: nextEndpointConfigs })
      lastPersistedApiHostRef.current = trimmedApiHost
      return true
    },
    [buildNextApiEndpointConfigs, patchProvider, provider]
  )

  const debouncedPersistApiHost = useMemo(
    () => debounce((nextApiHost: string) => void persistApiHostDraft(nextApiHost), 150),
    [persistApiHostDraft]
  )

  useEffect(() => {
    if (!provider) {
      return
    }

    const trimmedApiHost = trim(apiHost)
    if (!validateApiHost(trimmedApiHost)) {
      debouncedPersistApiHost.cancel()
      return
    }

    if (!trimmedApiHost) {
      debouncedPersistApiHost.cancel()
      return
    }

    if (trimmedApiHost === lastPersistedApiHostRef.current) {
      debouncedPersistApiHost.cancel()
      return
    }

    debouncedPersistApiHost(apiHost)

    return () => debouncedPersistApiHost.cancel()
  }, [apiHost, debouncedPersistApiHost, provider])

  useEffect(() => () => debouncedPersistApiHost.cancel(), [debouncedPersistApiHost])

  const commitApiHost = useCallback(
    async (explicitNext?: string): Promise<boolean> => {
      try {
        if (!provider) {
          return false
        }

        debouncedPersistApiHost.cancel()

        const raw = explicitNext !== undefined ? explicitNext : apiHost
        const trimmedApiHost = trim(raw)
        if (!validateApiHost(trimmedApiHost)) {
          setApiHost(providerApiHost)
          toast.error('API 地址不合法')
          return false
        }

        if (!trimmedApiHost) {
          setApiHost(providerApiHost)
          return false
        }

        const nextEndpointConfigs = buildNextApiEndpointConfigs(trimmedApiHost)
        if (!nextEndpointConfigs) {
          return false
        }

        if (trimmedApiHost !== trim(apiHost)) {
          setApiHost(trimmedApiHost)
        }

        if (trimmedApiHost !== lastPersistedApiHostRef.current) {
          await patchProvider({ endpointConfigs: nextEndpointConfigs })
          lastPersistedApiHostRef.current = trimmedApiHost
        }

        return true
      } catch (error) {
        logger.error('Failed to commit provider API host', { providerId: provider?.id, error })
        toast.error(getEndpointActionErrorMessage(error, '服务商设置保存失败'))
        return false
      }
    },
    [
      apiHost,
      buildNextApiEndpointConfigs,
      debouncedPersistApiHost,
      patchProvider,
      provider,
      providerApiHost,
      setApiHost
    ]
  )

  const commitAnthropicApiHost = useCallback(
    async (explicitNext?: string): Promise<boolean> => {
      if (!provider) {
        return false
      }

      const rawHost = explicitNext !== undefined ? explicitNext : anthropicApiHost
      const trimmedHost = trim(rawHost)
      try {
        if (trimmedHost) {
          const nextEndpointConfigs = {
            ...provider.endpointConfigs,
            [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
              ...provider.endpointConfigs?.[ENDPOINT_TYPE.ANTHROPIC_MESSAGES],
              baseUrl: trimmedHost
            }
          }
          await patchProvider({ endpointConfigs: nextEndpointConfigs })
          setAnthropicApiHost(trimmedHost)
          return true
        }

        const nextConfigs = { ...provider.endpointConfigs }
        delete nextConfigs[ENDPOINT_TYPE.ANTHROPIC_MESSAGES]
        await patchProvider({ endpointConfigs: nextConfigs })
        setAnthropicApiHost('')
        return true
      } catch (error) {
        logger.error('Failed to commit Anthropic API host', { providerId: provider?.id, error })
        toast.error(getEndpointActionErrorMessage(error, '服务商设置保存失败'))
        return false
      }
    },
    [anthropicApiHost, patchProvider, provider, setAnthropicApiHost]
  )

  const commitApiVersion = useCallback(async (): Promise<boolean> => {
    if (!provider) {
      return false
    }

    try {
      await patchProvider({
        providerSettings: {
          ...provider.settings,
          apiVersion
        }
      })
      return true
    } catch (error) {
      logger.error('Failed to commit API version', { providerId: provider.id, error })
      toast.error(getEndpointActionErrorMessage(error, '服务商设置保存失败'))
      return false
    }
  }, [apiVersion, patchProvider, provider])

  const resetApiHost = useCallback(async (): Promise<boolean> => {
    if (!provider) {
      return false
    }

    const nextBaseUrl = defaultApiHost
    const nextEndpointConfigs = {
      ...provider.endpointConfigs,
      [primaryEndpoint]: {
        ...provider.endpointConfigs?.[primaryEndpoint],
        baseUrl: nextBaseUrl
      }
    }

    setApiHost(nextBaseUrl)
    try {
      await patchProvider({ endpointConfigs: nextEndpointConfigs })
      return true
    } catch (error) {
      logger.error('Failed to reset provider API host', { providerId: provider.id, error })
      toast.error(getEndpointActionErrorMessage(error, '服务商设置保存失败'))
      return false
    }
  }, [defaultApiHost, patchProvider, primaryEndpoint, provider, setApiHost])

  return {
    commitApiHost,
    commitAnthropicApiHost,
    commitApiVersion,
    resetApiHost
  }
}

