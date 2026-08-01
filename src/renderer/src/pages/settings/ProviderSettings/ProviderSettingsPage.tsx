import { usePersistCache } from '@data/hooks/useCache'
import { useProviders } from '@renderer/hooks/useProvider'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ProviderList } from './ProviderList'
import ProviderSetting from './ProviderSetting'
import { isProviderSettingsListVisibleProvider } from './utils/providerDisplay'

interface ProviderSettingsPageProps {
  isOnboarding?: boolean
}

export default function ProviderSettingsPage({ isOnboarding = false }: ProviderSettingsPageProps) {
  const { providers: rawProviders } = useProviders()
  const [lastSelectedProviderId, setLastSelectedProviderId] = usePersistCache(
    'settings.provider.last_selected_provider_id'
  )
  const [selectedProviderId, setSelectedProviderIdState] = useState<string | undefined>(
    () => lastSelectedProviderId ?? undefined
  )
  const setLastSelectedProviderIdRef = useRef(setLastSelectedProviderId)

  const providers = useMemo(() => (Array.isArray(rawProviders) ? rawProviders : []), [rawProviders])
  const visibleProviders = useMemo(
    () => providers.filter(isProviderSettingsListVisibleProvider),
    [providers]
  )

  useEffect(() => {
    setLastSelectedProviderIdRef.current = setLastSelectedProviderId
  }, [setLastSelectedProviderId])

  useEffect(() => {
    const persistedProviderId = lastSelectedProviderId ?? undefined
    setSelectedProviderIdState((currentProviderId) =>
      currentProviderId === persistedProviderId ? currentProviderId : persistedProviderId
    )
  }, [lastSelectedProviderId])

  const setSelectedProviderId = useCallback((providerId: string | undefined) => {
    setLastSelectedProviderIdRef.current(providerId ?? null)
    startTransition(() => setSelectedProviderIdState(providerId))
  }, [])

  useEffect(() => {
    if (!selectedProviderId && visibleProviders[0]) {
      setSelectedProviderId(visibleProviders[0].id)
      return
    }

    if (
      selectedProviderId &&
      !visibleProviders.some((provider) => provider.id === selectedProviderId)
    ) {
      setSelectedProviderId(visibleProviders[0]?.id)
    }
  }, [selectedProviderId, setSelectedProviderId, visibleProviders])

  const selectedProvider = useMemo(
    () => visibleProviders.find((provider) => provider.id === selectedProviderId),
    [selectedProviderId, visibleProviders]
  )

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <ProviderList
        selectedProviderId={selectedProviderId}
        onSelectProvider={setSelectedProviderId}
      />
      {selectedProvider && (
        <ProviderSetting
          providerId={selectedProvider.id}
          key={selectedProvider.id}
          isOnboarding={isOnboarding}
        />
      )}
    </div>
  )
}
