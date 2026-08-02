import { useMutation } from '@data/hooks/useDataApi'
import { loggerService } from '@logger'
import { useModelMutations, useModels } from '@renderer/hooks/useModel'
import { useProvider } from '@renderer/hooks/useProvider'
import {
  fetchProviderCatalogModels,
  fetchResolvedProviderModels,
  resolveCreateModelEndpointTypes,
  toCreateModelDto
} from '@renderer/pages/settings/ProviderSettings/utils/modelSync'
import { enableProviderWhenModelsAvailable } from '@renderer/pages/settings/ProviderSettings/utils/providerEnablement'
import { toast } from '@renderer/services/toast'
import { MODELS_BATCH_MAX_ITEMS } from '@shared/data/api/schemas/models'
import type { Model, UniqueModelId } from '@shared/data/types/model'
import { useCallback, useMemo, useRef, useState } from 'react'

import { chunkArray } from '../utils/chunkArray'

const logger = loggerService.withContext('ProviderModelManageDrawer')

function uniqueById(models: Model[]): Model[] {
  const result = new Map<string, Model>()
  for (const model of models) {
    if (!result.has(model.id)) {
      result.set(model.id, model)
    }
  }
  return Array.from(result.values())
}

/**
 * Owns the manual provider model management drawer.
 *
 * v1 opened a model-management popup and immediately loaded the provider list;
 * this hook keeps the same semantics while using v2 DataApi-backed model CRUD.
 */
export function useProviderModelPullReconcile(providerId: string) {
  const [pullReconcileDrawerOpen, setPullReconcileDrawerOpen] = useState(false)
  const [catalogModels, setCatalogModels] = useState<Model[]>([])
  const [fetchedModels, setFetchedModels] = useState<Model[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [hasLoadedCompleteRemoteModels, setHasLoadedCompleteRemoteModels] = useState(false)
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)
  const loadModelsSequenceRef = useRef(0)
  const { provider, enableProvider } = useProvider(providerId)
  const { models } = useModels({ providerId })
  const { createModels, deleteModels, isCreating, isDeleting, isBulkDeleting } = useModelMutations()
  const { trigger: reconcileModels, isLoading: isReconciling } = useMutation(
    'POST',
    '/providers/:providerId/models:reconcile',
    { refresh: ['/models'] }
  )

  const allModels = useMemo(
    () => uniqueById([...fetchedModels, ...catalogModels, ...models]),
    [catalogModels, fetchedModels, models]
  )
  const remoteModelIds = useMemo(
    () => new Set([...catalogModels, ...fetchedModels].map((model) => model.id)),
    [catalogModels, fetchedModels]
  )
  const removableModelIds = useMemo(
    () =>
      models
        .filter(
          (model) =>
            remoteModelIds.has(model.id) ||
            (model.presetModelId != null && model.presetModelId !== '')
        )
        .map((model) => model.id),
    [models, remoteModelIds]
  )
  const staleModels = useMemo(() => {
    if (!hasLoadedCompleteRemoteModels) {
      return []
    }

    return models.filter(
      (model) =>
        !remoteModelIds.has(model.id) && model.presetModelId != null && model.presetModelId !== ''
    )
  }, [hasLoadedCompleteRemoteModels, models, remoteModelIds])

  const loadModels = useCallback(async () => {
    const sequence = ++loadModelsSequenceRef.current
    const isLatestLoad = () => sequence === loadModelsSequenceRef.current

    setIsLoadingModels(true)
    setHasLoadedCompleteRemoteModels(false)
    setLoadErrorMessage(null)
    try {
      const [catalogResult, fetchedResult] = await Promise.allSettled([
        fetchProviderCatalogModels(providerId),
        fetchResolvedProviderModels(providerId)
      ])
      if (!isLatestLoad()) {
        return
      }

      const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : []
      const fetched = fetchedResult.status === 'fulfilled' ? fetchedResult.value : []
      const hasLoadedAllModels =
        catalogResult.status === 'fulfilled' && fetchedResult.status === 'fulfilled'

      setCatalogModels(catalog.filter((model) => model.name?.trim()))
      setFetchedModels(fetched.filter((model) => model.name?.trim()))
      setHasLoadedCompleteRemoteModels(hasLoadedAllModels)

      if (!hasLoadedAllModels) {
        logger.error('Failed to load provider models for manage drawer', {
          providerId,
          catalogError: catalogResult.status === 'rejected' ? catalogResult.reason : undefined,
          upstreamError: fetchedResult.status === 'rejected' ? fetchedResult.reason : undefined
        })
        setLoadErrorMessage('拉取模型失败。')
      }
    } finally {
      if (isLatestLoad()) {
        setIsLoadingModels(false)
      }
    }
  }, [providerId])

  const openPullReconcile = useCallback(() => {
    setPullReconcileDrawerOpen(true)
    void loadModels()
  }, [loadModels])

  const closePullReconcile = useCallback(() => {
    setPullReconcileDrawerOpen(false)
  }, [])

  const addModels = useCallback(
    async (nextModels: Model[]) => {
      const currentIds = new Set(models.map((model) => model.id))
      const toAdd = uniqueById(nextModels).filter((model) => !currentIds.has(model.id))
      if (toAdd.length === 0) {
        return
      }

      try {
        const chunks = chunkArray(
          toAdd.map((model) =>
            toCreateModelDto(providerId, model, resolveCreateModelEndpointTypes(provider, model))
          ),
          MODELS_BATCH_MAX_ITEMS
        )
        for (const chunk of chunks) {
          await createModels(chunk)
        }
      } catch (error) {
        logger.error('Failed to add provider models from manage drawer', {
          providerId,
          count: toAdd.length,
          error
        })
        toast.error('模型操作失败。')
        return
      }

      try {
        await enableProviderWhenModelsAvailable(
          provider,
          enableProvider,
          models.length + toAdd.length,
          'model_manage_add'
        )
      } catch (error) {
        logger.error('Models were added but provider enablement failed', {
          providerId,
          count: toAdd.length,
          error
        })
        toast.warning('模型已添加，但服务商启用失败。')
      }
    },
    [createModels, enableProvider, models, provider, providerId]
  )

  const removeModels = useCallback(
    async (uniqueModelIds: UniqueModelId[]) => {
      const uniqueIds = Array.from(new Set(uniqueModelIds))
      if (uniqueIds.length === 0) {
        return
      }

      try {
        await deleteModels(uniqueIds)
      } catch (error) {
        logger.error('Failed to remove provider models from manage drawer', {
          providerId,
          count: uniqueIds.length,
          error
        })
        toast.error('模型操作失败。')
      }
    },
    [deleteModels, providerId]
  )

  const cleanStaleModels = useCallback(async () => {
    const staleIds = staleModels.map((model) => model.id)
    if (staleIds.length === 0) {
      return
    }

    try {
      await reconcileModels({
        params: { providerId },
        body: {
          toAdd: [],
          toRemove: staleIds
        }
      })
      toast.success(`已清理 ${staleIds.length} 个失效模型`)
    } catch (error) {
      logger.error('Failed to clean stale provider models from manage drawer', {
        providerId,
        count: staleIds.length,
        error
      })
      toast.error('模型操作失败。')
    }
  }, [providerId, reconcileModels, staleModels])

  return {
    allModels,
    provider,
    localModels: models,
    removableModelIds,
    staleModelCount: staleModels.length,
    staleModelIds: staleModels.map((model) => model.id),
    openPullReconcile,
    closePullReconcile,
    reloadModels: loadModels,
    pullReconcileDrawerOpen,
    addModels,
    removeModels,
    cleanStaleModels,
    isLoadingModels,
    loadErrorMessage,
    isApplyingPullReconcile: isCreating || isDeleting || isBulkDeleting || isReconciling,
    isBusy: isLoadingModels || isCreating || isDeleting || isBulkDeleting || isReconciling
  }
}
