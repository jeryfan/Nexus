import { Button, Tooltip } from '@nexus/ui'
import { Activity } from 'lucide-react'
import type React from 'react'

import { modelListClasses } from '../primitives/ProviderSettingsPrimitives'
import HealthCheckDrawer from './HealthCheckDrawer'
import { useModelListHealth } from './modelListHealthContext'

interface ProviderModelHealthCheckProps {
  disabled: boolean
  hasVisibleModels: boolean
  renderTrigger?: boolean
  renderDrawer?: boolean
}

const ProviderModelHealthCheck: React.FC<ProviderModelHealthCheckProps> = ({
  disabled,
  hasVisibleModels,
  renderTrigger = true,
  renderDrawer = true
}) => {
  const health = useModelListHealth()

  return (
    <>
      {renderTrigger ? (
        <Tooltip content={'健康检测'}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={'健康检测'}
            className={modelListClasses.subsectionIconButton}
            disabled={!hasVisibleModels || disabled}
            onClick={health.openHealthCheck}
          >
            <Activity className={modelListClasses.subsectionIcon} />
          </Button>
        </Tooltip>
      ) : null}
      {renderDrawer ? (
        <HealthCheckDrawer
          open={health.healthCheckOpen}
          title={'模型健康检测'}
          apiKeys={health.availableApiKeys}
          isChecking={health.isHealthChecking}
          modelStatuses={health.modelStatuses}
          onClose={health.closeHealthCheck}
          onResetRun={health.resetHealthCheckRun}
          onStart={health.startHealthCheck}
        />
      ) : null}
    </>
  )
}

export default ProviderModelHealthCheck
