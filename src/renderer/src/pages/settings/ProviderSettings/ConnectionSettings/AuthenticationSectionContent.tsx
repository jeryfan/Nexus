import { useProviderConnectionCheck } from '../hooks/providerSetting/useProviderConnectionCheck'
import ApiHost from './ApiHost'
import ApiKey from './ApiKey'
import ProviderConnectionCheckDrawer from './ProviderConnectionCheckDrawer'

export interface AuthenticationSectionContentProps {
  providerId: string
  onOpenModelHealthCheck?: () => void
  onRequestModelPullGuide?: () => void
}

export function AuthenticationSectionContent({
  providerId,
  onOpenModelHealthCheck,
  onRequestModelPullGuide
}: AuthenticationSectionContentProps) {
  const connectionCheck = useProviderConnectionCheck(providerId)

  return (
    <>
      <ApiKey
        providerId={providerId}
        apiKeyConnectivity={connectionCheck.apiKeyConnectivity}
        onOpenConnectionCheck={connectionCheck.openConnectionCheck}
        requiresApiKey={connectionCheck.requiresApiKey}
        onRequestModelPullGuide={onRequestModelPullGuide}
      />
      <ApiHost providerId={providerId} onRequestModelPullGuide={onRequestModelPullGuide} />
      <ProviderConnectionCheckDrawer
        open={connectionCheck.connectionCheckOpen}
        models={connectionCheck.checkableModels}
        apiKeys={connectionCheck.checkableApiKeys}
        connectionError={connectionCheck.apiKeyConnectivity.error}
        isSubmitting={connectionCheck.apiKeyConnectivity.checking ?? false}
        requiresApiKey={connectionCheck.requiresApiKey}
        onClose={connectionCheck.closeConnectionCheck}
        onStart={connectionCheck.startConnectionCheck}
        onOpenModelHealthCheck={onOpenModelHealthCheck}
      />
    </>
  )
}
