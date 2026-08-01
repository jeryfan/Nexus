import { useProvider } from '@renderer/hooks/useProvider'
import { hasVisibleProviderApiOptions } from '@renderer/pages/settings/ProviderSettings/utils/providerApiOptions'
import { getFancyProviderName } from '@renderer/pages/settings/ProviderSettings/utils/providerDisplay'
import { isAzureOpenAIProvider } from '@shared/utils/provider'
import { useMemo } from 'react'

/** Exposes read-only provider presentation metadata used across provider settings. */
export function useProviderMeta(providerId: string) {
  const { provider } = useProvider(providerId)

  return useMemo(() => {
    return {
      fancyProviderName: provider ? getFancyProviderName(provider) : '',
      officialWebsite: provider?.websites?.official,
      apiKeyWebsite: provider?.websites?.apiKey,
      docsWebsite: provider?.websites?.docs,
      modelsWebsite: provider?.websites?.models,
      isAzureOpenAI: provider ? isAzureOpenAIProvider(provider) : false,
      // i18n 剥离后应用仅中文，恒为 true（原 i18n.language.startsWith('zh')）
      isChineseUser: true,
      showApiOptionsButton: provider ? hasVisibleProviderApiOptions(provider) : false,
      isApiKeyFieldVisible: true,
      isConnectionFieldVisible: true
    }
  }, [provider])
}

