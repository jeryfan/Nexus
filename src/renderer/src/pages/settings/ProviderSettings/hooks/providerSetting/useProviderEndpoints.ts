import type { Provider } from '@shared/data/types/provider'
import { getProviderHostTopology } from '@shared/utils/providerTopology'
import { useEffect, useRef, useState } from 'react'

type ProviderEndpointSnapshot = {
  providerId: string | undefined
  apiHost: string
  anthropicApiHost: string
}

/** Owns endpoint display state for the provider settings connection UI. */
export function useProviderEndpoints(provider: Provider | undefined) {
  const topology = getProviderHostTopology(provider)
  const providerId = provider?.id
  const primaryEndpoint = topology.primaryEndpoint
  const providerApiHost = topology.primaryBaseUrl
  const providerAnthropicHost = topology.anthropicBaseUrl

  const [apiHost, setApiHostValue] = useState(providerApiHost)
  const [anthropicApiHost, setAnthropicApiHost] = useState(providerAnthropicHost)
  const previousServerEndpoint = useRef<ProviderEndpointSnapshot>({
    providerId,
    apiHost: providerApiHost,
    anthropicApiHost: providerAnthropicHost
  })

  useEffect(() => {
    const previous = previousServerEndpoint.current
    const providerChanged = previous.providerId !== providerId

    setApiHostValue((current) =>
      providerChanged || current === previous.apiHost ? providerApiHost : current
    )
    setAnthropicApiHost((current) =>
      providerChanged || current === previous.anthropicApiHost ? providerAnthropicHost : current
    )
    previousServerEndpoint.current = {
      providerId,
      apiHost: providerApiHost,
      anthropicApiHost: providerAnthropicHost
    }
  }, [providerId, providerApiHost, providerAnthropicHost])

  return {
    apiHost,
    setApiHost: setApiHostValue,
    anthropicApiHost,
    setAnthropicApiHost,
    primaryEndpoint,
    providerApiHost,
    providerAnthropicHost
  }
}
