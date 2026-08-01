import { useProvider, useProviderMutations, useProviderPreset } from '@renderer/hooks/useProvider'
import { ENDPOINT_TYPE } from '@shared/data/types/model'
import { getProviderHostTopology } from '@shared/utils/providerTopology'
import { useState } from 'react'

import { useProviderEndpointActions } from '../hooks/providerSetting/useProviderEndpointActions'
import { useProviderEndpoints } from '../hooks/providerSetting/useProviderEndpoints'
import { useProviderHostPreview } from '../hooks/providerSetting/useProviderHostPreview'
import { AnthropicApiHostField, ApiHostField, ApiHostSection } from './ApiHostFields'
import ProviderCustomHeaderDrawer from './ProviderCustomHeaderDrawer'

const ENDPOINT_CONFIG_PRESET_FIELDS = ['endpointConfigs'] as const

interface ApiHostProps {
  providerId: string
  onRequestModelPullGuide?: () => void
}

export default function ApiHost({ providerId, onRequestModelPullGuide }: ApiHostProps) {
  const { provider } = useProvider(providerId)
  const { updateProvider } = useProviderMutations(providerId)
  const [customHeaderOpen, setCustomHeaderOpen] = useState(false)
  const [apiHostEdited, setApiHostEdited] = useState(false)
  const [anthropicApiHostEdited, setAnthropicApiHostEdited] = useState(false)
  const { primaryEndpoint, apiHost, setApiHost, anthropicApiHost, setAnthropicApiHost } =
    useProviderEndpoints(provider)
  const topology = getProviderHostTopology(provider)
  const { data: preset } = useProviderPreset(providerId, ENDPOINT_CONFIG_PRESET_FIELDS)
  // Factory-default host for the primary endpoint (registry-sourced); '' for custom providers.
  const defaultApiHost = preset?.endpointConfigs?.[topology.primaryEndpoint]?.baseUrl ?? ''
  const isAnthropicPrimaryEndpoint = primaryEndpoint === ENDPOINT_TYPE.ANTHROPIC_MESSAGES
  const hostPreview = useProviderHostPreview({
    provider,
    apiHost,
    anthropicApiHost,
    defaultApiHost
  })
  const endpointActions = useProviderEndpointActions({
    provider,
    primaryEndpoint: topology.primaryEndpoint,
    apiHost,
    setApiHost,
    providerApiHost: topology.primaryBaseUrl,
    anthropicApiHost,
    setAnthropicApiHost,
    defaultApiHost,
    patchProvider: updateProvider
  })
  const handleApiHostChange = (value: string) => {
    setApiHostEdited(true)
    setApiHost(value)
  }
  const handleApiHostCommit = async () => {
    const committed = await endpointActions.commitApiHost()
    if (committed && apiHostEdited) {
      setApiHostEdited(false)
      onRequestModelPullGuide?.()
    }
  }
  const handleAnthropicApiHostChange = (value: string) => {
    setAnthropicApiHostEdited(true)
    setAnthropicApiHost(value)
  }
  const handleAnthropicApiHostCommit = async () => {
    const committed = await endpointActions.commitAnthropicApiHost()
    if (committed && anthropicApiHostEdited) {
      setAnthropicApiHostEdited(false)
      onRequestModelPullGuide?.()
    }
  }

  if (!provider) {
    return null
  }

  return (
    <>
      <ApiHostSection>
        {!isAnthropicPrimaryEndpoint ? (
          <ApiHostField
            apiHost={apiHost}
            isApiHostResettable={hostPreview.isApiHostResettable}
            onApiHostChange={handleApiHostChange}
            onApiHostCommit={() => void handleApiHostCommit()}
            onResetApiHost={endpointActions.resetApiHost}
            onOpenRequestConfig={() => setCustomHeaderOpen(true)}
          />
        ) : (
          <AnthropicApiHostField
            anthropicApiHost={anthropicApiHost}
            anthropicHostPreview={hostPreview.anthropicHostPreview}
            onAnthropicApiHostChange={handleAnthropicApiHostChange}
            onAnthropicApiHostCommit={() => void handleAnthropicApiHostCommit()}
            onOpenRequestConfig={() => setCustomHeaderOpen(true)}
          />
        )}
      </ApiHostSection>
      <ProviderCustomHeaderDrawer
        providerId={providerId}
        open={customHeaderOpen}
        onClose={() => setCustomHeaderOpen(false)}
      />
    </>
  )
}
