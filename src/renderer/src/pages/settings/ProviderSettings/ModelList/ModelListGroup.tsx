import { Button, Tooltip } from '@nexus/ui'
import { loggerService } from '@logger'
import { toast } from '@renderer/services/toast'
import { cn } from '@renderer/utils/style'
import type { Model } from '@shared/data/types/model'
import { ChevronRight, Minus } from 'lucide-react'
import React, { memo, useCallback, useMemo } from 'react'

import { modelListClasses } from '../primitives/ProviderSettingsPrimitives'
import { getModelOperationErrorMessage } from './errorMessage'
import { getModelGroupLabel } from './grouping'
import type { ModelListGroupItem } from './useProviderModelList'

const logger = loggerService.withContext('ModelListGroup')

interface ModelListGroupProps {
  groupName: string
  items: ModelListGroupItem[]
  defaultOpen: boolean
  open?: boolean
  disabled?: boolean
  bulkActionDisabled?: boolean
  pendingModelIds: Set<string>
  onDeleteModels: (models: Model[]) => Promise<void>
  onToggleOpen?: () => void
}

const ModelListGroup: React.FC<ModelListGroupProps> = ({
  groupName,
  items,
  defaultOpen,
  open = defaultOpen,
  disabled,
  bulkActionDisabled,
  pendingModelIds,
  onDeleteModels,
  onToggleOpen
}) => {
  const groupLabel = getModelGroupLabel(groupName)
  const groupModels = useMemo(() => items.map(({ model }) => model), [items])
  const hasPendingModel = groupModels.some((model) => pendingModelIds.has(model.id))

  const toggleOpen = useCallback(() => {
    onToggleOpen?.()
  }, [onToggleOpen])

  const handleGroupHeaderKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      toggleOpen()
    },
    [toggleOpen]
  )

  const handleDeleteGroupModels = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      event?.stopPropagation()
      void onDeleteModels(groupModels).catch((error) => {
        logger.error('Failed to delete provider model group', { groupName, error })
        toast.error(
          getModelOperationErrorMessage(error, {
            fallback: '模型操作失败。',
            modelReferencedByHistoricalData: '该模型仍被历史数据引用，无法删除。'
          })
        )
      })
    },
    [groupModels, groupName, onDeleteModels]
  )

  const handleDeleteGroupKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation()
    }
  }, [])

  return (
    <div className={cn(modelListClasses.groupCard, open && modelListClasses.groupCardOpen)}>
      <div
        className={cn(
          modelListClasses.groupHeader,
          open && modelListClasses.groupHeaderOpen,
          'cursor-pointer'
        )}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggleOpen}
        onKeyDown={handleGroupHeaderKeyDown}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <div className={modelListClasses.groupToggleButton}>
            <ChevronRight
              className={cn(
                modelListClasses.groupChevron,
                open && modelListClasses.groupChevronOpen
              )}
              aria-hidden
            />
            <span className={modelListClasses.groupTitle}>{groupLabel}</span>
          </div>
        </div>
        <div className={modelListClasses.groupHeaderActions}>
          <Tooltip
            content={'删除分组'}
            placement="top"
            classNames={{ placeholder: modelListClasses.groupHeaderIconTooltipTrigger }}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={'删除分组'}
              disabled={
                disabled ||
                bulkActionDisabled ||
                hasPendingModel
              }
              className={`${modelListClasses.rowActionButton} ${modelListClasses.rowDangerActionButton} opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within/modelGroup:opacity-100 group-hover/modelGroup:opacity-100`}
              onKeyDown={handleDeleteGroupKeyDown}
              onClick={handleDeleteGroupModels}
            >
              <Minus className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

export default memo(ModelListGroup)

