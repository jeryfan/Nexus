import { Button } from '@nexus/ui'
import { Plus } from 'lucide-react'
import type React from 'react'
import { useCallback, useState } from 'react'

import { modelListClasses } from '../primitives/ProviderSettingsPrimitives'
import { AddModelDrawer } from './ModelDrawer'

interface ProviderModelAddProps {
  providerId: string
  disabled: boolean
}

const ProviderModelAdd: React.FC<ProviderModelAddProps> = ({ providerId, disabled }) => {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openDrawer = useCallback(() => {
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className={modelListClasses.addModelIconButton}
        disabled={disabled}
        aria-label={'添加模型'}
        onClick={openDrawer}
      >
        <Plus className={modelListClasses.toolbarDesignIcon} />
      </Button>
      <AddModelDrawer
        providerId={providerId}
        open={drawerOpen}
        prefill={null}
        onClose={closeDrawer}
      />
    </>
  )
}

export default ProviderModelAdd

