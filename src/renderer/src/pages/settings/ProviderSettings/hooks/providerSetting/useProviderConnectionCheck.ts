import { loggerService } from '@logger'
import { useModels } from '@renderer/hooks/useModel'
import { useProvider } from '@renderer/hooks/useProvider'
import { useTimer } from '@renderer/hooks/useTimer'
import {
  type ApiKeyConnectivity,
  HealthStatus
} from '@renderer/pages/settings/ProviderSettings/types/healthCheck'
import { checkApi as runCheckApi } from '@renderer/pages/settings/ProviderSettings/utils/healthCheck'
import { enableProviderWhenModelsAvailable } from '@renderer/pages/settings/ProviderSettings/utils/providerEnablement'
import { toast } from '@renderer/services/toast'
import { formatApiKeys, splitApiKeyString } from '@renderer/utils/api'
import { serializeHealthCheckError } from '@renderer/utils/error'
import type { Model } from '@shared/data/types/model'
import { isEmpty } from 'es-toolkit/compat'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PROVIDER_SETTINGS_MODEL_SWR_OPTIONS } from './constants'
import { useAuthenticationApiKey } from './useAuthenticationApiKey'
import { useProviderEndpoints } from './useProviderEndpoints'

/** Runs provider connection checks against the current editable credentials and endpoint. */
const logger = loggerService.withContext('ProviderSettings:ConnectionCheck')

export function useProviderConnectionCheck(providerId: string) {
  const { provider, enableProvider } = useProvider(providerId)
  const [connectionCheckOpen, setConnectionCheckOpen] = useState(false)
  const { models } = useModels(
    { providerId },
    { fetchEnabled: connectionCheckOpen, swrOptions: PROVIDER_SETTINGS_MODEL_SWR_OPTIONS }
  )
  const { setTimeoutTimer } = useTimer()
  const { commitInputApiKeyNow, inputApiKey } = useAuthenticationApiKey()
  const { apiHost, anthropicApiHost } = useProviderEndpoints(provider)
  const [apiKeyConnectivity, setApiKeyConnectivity] = useState<ApiKeyConnectivity>({
    kind: 'idle',
    status: HealthStatus.NOT_CHECKED,
    checking: false
  })

  const checkableModels = models
  const checkableApiKeys = useMemo(
    () => splitApiKeyString(formatApiKeys(inputApiKey)).filter(Boolean),
    [inputApiKey]
  )
  // Keyless local servers (registry `authOptional`) can be connection-checked
  // without a key; the flag rides the merged Provider, so duplicates inherit it.
  const requiresApiKey = !provider?.authOptional

  // AbortController + runId pair guards against stale callbacks landing on the
  // new mount/credentials. When provider/apiHost/inputApiKey changes mid-flight
  // we abort the in-flight request and bump runId so any late then/catch from
  // the aborted run is dropped before touching state.
  const abortControllerRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)
  const abortInFlightCheck = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    runIdRef.current += 1
  }, [])

  const resetApiKeyConnectivity = useCallback(() => {
    setApiKeyConnectivity({ kind: 'idle', status: HealthStatus.NOT_CHECKED, checking: false })
  }, [])

  const closeConnectionCheck = useCallback(() => {
    setConnectionCheckOpen(false)
  }, [])

  const openConnectionCheck = useCallback(() => {
    if (!provider) {
      return
    }

    if (requiresApiKey && isEmpty(checkableApiKeys)) {
      toast.error('请输入您的 API 密钥')
      return
    }

    setApiKeyConnectivity({ kind: 'idle', status: HealthStatus.NOT_CHECKED, checking: false })
    setConnectionCheckOpen(true)
  }, [checkableApiKeys, provider, requiresApiKey])

  const startConnectionCheck = useCallback(
    async ({ model, apiKey }: { model?: Model; apiKey: string }) => {
      if (!provider || !model) {
        toast.error('请选择一个模型')
        return
      }

      if (requiresApiKey && !apiKey) {
        toast.error('请输入您的 API 密钥')
        return
      }

      abortInFlightCheck()
      const controller = new AbortController()
      abortControllerRef.current = controller
      const runId = ++runIdRef.current
      // Distinguishes a local save failure from a real probe failure in the
      // catch, so the user isn't sent debugging network/key when persistence broke.
      let didCommitApiKey = false

      try {
        setApiKeyConnectivity({
          kind: 'checking',
          checking: true,
          status: HealthStatus.NOT_CHECKED,
          model
        })

        // Persist the pending key BEFORE running the check so a key typed within
        // the input debounce window is not lost. The probe itself uses the
        // selected key override below instead of the provider's rotated key.
        await commitInputApiKeyNow()
        didCommitApiKey = true

        if (runId !== runIdRef.current || controller.signal.aborted) return

        await runCheckApi(model.id, { apiKey: apiKey || undefined, signal: controller.signal })

        if (runId !== runIdRef.current) return

        // Connectivity has already succeeded. Provider enablement is a follow-up
        // action, so report its failure separately without marking the probe failed.
        try {
          await enableProviderWhenModelsAvailable(
            provider,
            enableProvider,
            checkableModels.length,
            'connection_check'
          )
        } catch (error) {
          if (runId !== runIdRef.current || controller.signal.aborted) return

          logger.error('Provider connection succeeded but enablement failed', {
            providerId: provider.id,
            modelId: model.id,
            error
          })
          toast.warning('连接成功，但服务商启用失败。')
        }

        // The enable await can interleave with a newer check; drop this run if it
        // was superseded or aborted before touching success state.
        if (runId !== runIdRef.current || controller.signal.aborted) return

        toast.success({
          timeout: 2000,
          title: '连接成功'
        })

        setApiKeyConnectivity({ kind: 'ok', checking: false, status: HealthStatus.SUCCESS, model })
        setConnectionCheckOpen(false)
        setTimeoutTimer(
          'provider-setting-check-api',
          () =>
            setApiKeyConnectivity({
              kind: 'idle',
              status: HealthStatus.NOT_CHECKED,
              checking: false
            }),
          3000
        )
      } catch (error) {
        if (runId !== runIdRef.current || controller.signal.aborted) return

        if (didCommitApiKey) {
          logger.error('Provider connection check failed', {
            providerId: provider.id,
            modelId: model.id,
            error
          })
        } else {
          logger.error('Failed to persist pending API key before connection check', {
            providerId: provider.id,
            modelId: model.id,
            error
          })
        }
        if (!didCommitApiKey) {
          toast.error({
            timeout: 8000,
            title: 'API 密钥保存失败'
          })
        }

        setApiKeyConnectivity({
          kind: 'failed',
          checking: false,
          status: HealthStatus.FAILED,
          model,
          error: serializeHealthCheckError(error)
        })
      }
    },
    [
      abortInFlightCheck,
      checkableModels.length,
      commitInputApiKeyNow,
      provider,
      requiresApiKey,
      setTimeoutTimer,
      enableProvider
    ]
  )

  const checkApi = useCallback(async () => {
    if (isEmpty(checkableModels)) {
      toast.error({
        timeout: 5000,
        title: '没有可以被检测的模型（例如对话模型）'
      })
      return
    }

    const firstModel = checkableModels[0]
    if (!firstModel) {
      toast.error('请选择一个模型')
      return
    }

    await startConnectionCheck({
      model: firstModel,
      apiKey: checkableApiKeys[0] ?? ''
    })
  }, [checkableApiKeys, checkableModels, startConnectionCheck])

  useEffect(() => {
    // Provider / host / apiKey changed mid-flight: abort the in-flight check so
    // its late then/catch doesn't land on the new credentials.
    abortInFlightCheck()
    setApiKeyConnectivity({ kind: 'idle', status: HealthStatus.NOT_CHECKED, checking: false })
    setConnectionCheckOpen(false)
  }, [abortInFlightCheck, anthropicApiHost, apiHost, inputApiKey, provider?.id])

  useEffect(() => () => abortInFlightCheck(), [abortInFlightCheck])

  return {
    apiKeyConnectivity,
    checkableApiKeys,
    checkableModels,
    checkApi,
    connectionCheckOpen,
    openConnectionCheck,
    closeConnectionCheck,
    startConnectionCheck,
    requiresApiKey,
    resetApiKeyConnectivity
  }
}
