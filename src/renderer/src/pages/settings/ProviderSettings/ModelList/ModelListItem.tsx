import { Avatar, AvatarFallback, Button, RowFlex, Tooltip } from '@nexus/ui'
import { useIcon } from '@nexus/ui/icons'
import { toast } from '@renderer/services/toast'
import { getModelLogoRef } from '@renderer/utils/model'
import type { Model } from '@shared/data/types/model'
import { Bolt, Minus } from 'lucide-react'
import React, { memo, useCallback } from 'react'

import ModelTagsWithLabel from '../components/ModelTagsWithLabel'
import { modelListClasses } from '../primitives/ProviderSettingsPrimitives'
import { getModelOperationErrorMessage } from './errorMessage'

interface ModelListItemProps {
  ref?: React.RefObject<HTMLDivElement>
  model: Model
  disabled?: boolean
  onEdit: (model: Model) => void
  onDelete: (model: Model) => Promise<void>
}

const ModelListItem: React.FC<ModelListItemProps> = ({
  ref,
  model,
  disabled,
  onEdit,
  onDelete
}) => {
  const Icon = useIcon(getModelLogoRef(model))

  const handleEdit = useCallback(() => {
    onEdit(model)
  }, [model, onEdit])

  const handleDelete = useCallback(() => {
    void onDelete(model).catch((error) => {
      toast.error(
        getModelOperationErrorMessage(error, {
          fallback: '模型操作失败。',
          modelReferencedByHistoricalData: '该模型仍被历史数据引用，无法删除。'
        })
      )
    })
  }, [model, onDelete])

  return (
    <div ref={ref} className={modelListClasses.row}>
      <RowFlex className={modelListClasses.rowMain}>
        {(() => {
          return Icon ? (
            <span className={modelListClasses.rowAvatar}>
              <Icon.Avatar size={26} shape="circle" />
            </span>
          ) : (
            <Avatar className={modelListClasses.rowAvatar}>
              <AvatarFallback className="rounded-[inherit]">
                {model.name?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )
        })()}
        <div className={modelListClasses.rowBody}>
          <div className="flex h-7 min-w-0 items-center gap-1.5">
            <span className="inline-flex h-7 min-w-0 shrink select-text items-center overflow-hidden text-ellipsis whitespace-nowrap text-left font-normal text-foreground/90 text-sm leading-none">
              {model.name}
            </span>
          </div>
        </div>
      </RowFlex>
      <RowFlex className={modelListClasses.rowActions}>
        <div className={modelListClasses.rowActionsCluster}>
          <div className={modelListClasses.rowCapabilityStrip}>
            <div className={modelListClasses.rowCapabilityTagCluster}>
              <ModelTagsWithLabel model={model} size={12} style={{ flexWrap: 'nowrap' }} />
            </div>
          </div>
          <div className={modelListClasses.rowInlineActions}>
            <Tooltip content={'设置'} placement="top">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={modelListClasses.rowActionButton}
                aria-label={'设置'}
                onClick={handleEdit}
              >
                <Bolt className="size-4" />
              </Button>
            </Tooltip>
            <Tooltip content={'删除模型'} placement="top">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={`${modelListClasses.rowActionButton} ${modelListClasses.rowDangerActionButton}`}
                aria-label={'删除模型'}
                disabled={disabled}
                onClick={handleDelete}
              >
                <Minus className="size-4" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </RowFlex>
    </div>
  )
}

export default memo(ModelListItem)

