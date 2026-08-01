import type { CompoundIcon } from '@nexus/ui'
import { InputGroup, InputGroupAddon, InputGroupInput, Tooltip } from '@nexus/ui'
import {
  loadProviderIconCatalog,
  resolveProviderIconRef,
  type ProviderIconKey
} from '@nexus/ui/icons'
import { loggerService } from '@logger'
import { ProviderAvatarPrimitive } from '@renderer/components/ProviderAvatar'
import { getProviderLabelKey } from '@renderer/utils/label'
import { SystemProviderIds } from '@shared/utils/systemProviderId'
import { Search } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'

const logger = loggerService.withContext('ProviderLogoPicker')

interface Props {
  onProviderClick: (providerId: string) => void
}

const PROVIDER_LOGO_OPTIONS = Object.values(SystemProviderIds)

const ProviderLogoPicker: FC<Props> = ({ onProviderClick }) => {
  const [searchText, setSearchText] = useState('')
  // The grid skeleton comes synchronously from the meta catalog; icon
  // components fill in once the async catalog chunk arrives.
  const [iconCatalog, setIconCatalog] = useState<Record<ProviderIconKey, CompoundIcon>>()

  useEffect(() => {
    let cancelled = false
    loadProviderIconCatalog()
      .then((catalog) => {
        if (!cancelled) setIconCatalog(catalog)
      })
      .catch((error) => {
        // The grid keeps its initials skeleton; just record the failed chunk.
        logger.warn('Failed to load provider icon catalog:', error as Error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredProviders = useMemo(() => {
    const providers = PROVIDER_LOGO_OPTIONS.map((id) => {
      const ref = resolveProviderIconRef(id)
      return {
        id,
        icon: ref?.kind === 'provider' ? iconCatalog?.[ref.key] : undefined,
        name: getProviderLabelKey(id)
      }
    })

    if (!searchText) return providers

    const searchLower = searchText.toLowerCase()
    return providers.filter((p) => p.name.toLowerCase().includes(searchLower))
  }, [searchText, iconCatalog])

  const handleProviderClick = (event: React.MouseEvent, providerId: string) => {
    event.stopPropagation()
    onProviderClick(providerId)
  }

  return (
    <div className="flex max-h-[300px] w-[350px] flex-col">
      <InputGroup className="mb-3">
        <InputGroupAddon align="inline-start">
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={'搜索'}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </InputGroup>
      <div className="grid flex-1 grid-cols-5 gap-2 overflow-y-auto p-1">
        {filteredProviders.map(({ id, name, icon }) => (
          <Tooltip key={id} content={name}>
            <button
              type="button"
              aria-label={name}
              className="flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/50 transition-all hover:scale-105 hover:border-primary hover:bg-muted"
              onClick={(event) => handleProviderClick(event, id)}
            >
              <ProviderAvatarPrimitive
                providerId={id}
                style={{ width: '52px', height: '52px' }}
                providerName={name}
                logo={icon}
              />
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

export default ProviderLogoPicker
