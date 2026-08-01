import { Button, Input, Switch, Tooltip } from '@nexus/ui'
import { loggerService } from '@logger'
import Scrollbar from '@renderer/components/Scrollbar'
import { useProviderApiKeys, useProviderMutations } from '@renderer/hooks/useProvider'
import { toast } from '@renderer/services/toast'
import { maskApiKey } from '@renderer/utils/api'
import type { ApiKeyEntry } from '@shared/data/types/provider'
import { Check, Copy, Edit3, Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import ProviderSettingsDrawer from '../primitives/ProviderSettingsDrawer'
import { apiKeyListClasses } from '../primitives/ProviderSettingsPrimitives'
import { copyApiKeyToClipboard } from './copyApiKeyToClipboard'

interface ProviderApiKeyListDrawerProps {
  providerId: string
  open: boolean
  onClose: () => void
}

interface DraftState {
  id: string
  key: string
  label: string
  isEnabled: boolean
  isNew: boolean
}

const createEmptyDraft = (): DraftState => ({
  id: uuidv4(),
  key: '',
  label: '',
  isEnabled: true,
  isNew: true
})

const logger = loggerService.withContext('ProviderApiKeyListDrawer')

function normalizeApiKeyValue(value: string) {
  return value.trim()
}

function toDraft(entry: ApiKeyEntry): DraftState {
  return {
    id: entry.id,
    key: entry.key,
    label: entry.label ?? '',
    isEnabled: entry.isEnabled,
    isNew: false
  }
}

function toEntry(draft: DraftState): ApiKeyEntry {
  return {
    id: draft.id,
    key: normalizeApiKeyValue(draft.key),
    label: draft.label.trim() || undefined,
    isEnabled: draft.isEnabled
  }
}

export default function ProviderApiKeyListDrawer({
  providerId,
  open,
  onClose
}: ProviderApiKeyListDrawerProps) {
  const { data: apiKeysData } = useProviderApiKeys(providerId)
  const { updateApiKeys } = useProviderMutations(providerId)
  const apiKeys = useMemo(() => apiKeysData?.keys ?? [], [apiKeysData?.keys])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setDraft(null)
    }
  }, [open])

  const enabledCount = apiKeys.filter((item) => item.isEnabled).length

  const persist = useCallback(
    async (nextKeys: ApiKeyEntry[]) => {
      if (savingRef.current) {
        return false
      }

      savingRef.current = true
      setSaving(true)
      try {
        await updateApiKeys(nextKeys)
        return true
      } catch (error) {
        logger.error('Failed to persist provider API keys', { providerId, error })
        toast.error('API 密钥保存失败')
        return false
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [providerId, updateApiKeys]
  )

  const validateDraft = useCallback(
    (nextDraft: DraftState) => {
      const key = normalizeApiKeyValue(nextDraft.key)
      if (!key) {
        toast.warning('API 密钥不能为空')
        return null
      }

      const isDuplicate = apiKeys.some(
        (item) => item.id !== nextDraft.id && item.key.trim() === key
      )
      if (isDuplicate) {
        toast.warning('API 密钥已存在')
        return null
      }

      return toEntry(nextDraft)
    },
    [apiKeys]
  )

  const startAdd = useCallback(() => {
    const nextDraft = createEmptyDraft()
    setEditingId(nextDraft.id)
    setDraft(nextDraft)
  }, [])

  const startEdit = useCallback((entry: ApiKeyEntry) => {
    const nextDraft = toDraft(entry)
    setEditingId(nextDraft.id)
    setDraft(nextDraft)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setDraft(null)
  }, [])

  const saveDraft = useCallback(async () => {
    if (!draft) {
      return
    }

    const entry = validateDraft(draft)
    if (!entry) {
      return
    }

    const nextKeys = draft.isNew
      ? [...apiKeys, entry]
      : apiKeys.map((item) => (item.id === entry.id ? entry : item))
    if (await persist(nextKeys)) {
      cancelEdit()
    }
  }, [apiKeys, cancelEdit, draft, persist, validateDraft])

  const removeKey = useCallback(
    async (id: string) => {
      if ((await persist(apiKeys.filter((item) => item.id !== id))) && editingId === id) {
        cancelEdit()
      }
    },
    [apiKeys, cancelEdit, editingId, persist]
  )

  const toggleEnabled = useCallback(
    async (entry: ApiKeyEntry, isEnabled: boolean) => {
      await persist(apiKeys.map((item) => (item.id === entry.id ? { ...item, isEnabled } : item)))
    },
    [apiKeys, persist]
  )

  return (
    <ProviderSettingsDrawer
      open={open}
      onClose={onClose}
      title={'API 密钥管理'}
      description={'管理当前服务商的多个 API Key'}
      footer={
        <div className={apiKeyListClasses.summaryMeta}>
          {enabledCount} / {apiKeys.length} {'已启用'}
        </div>
      }
    >
      <div className="space-y-4">
        <div className={apiKeyListClasses.listWrap}>
          <Scrollbar className={apiKeyListClasses.listScroller}>
            {apiKeys.length === 0 && !draft ? (
              <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                {'API 密钥未配置'}
              </div>
            ) : null}
            {apiKeys.map((entry) => (
              <div key={entry.id} className={apiKeyListClasses.keyRow}>
                {editingId === entry.id && draft ? (
                  <ApiKeyDraftRow
                    draft={draft}
                    saving={saving}
                    onChange={setDraft}
                    onSave={saveDraft}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <ApiKeyDisplayRow
                    entry={entry}
                    saving={saving}
                    onEdit={() => startEdit(entry)}
                    onRemove={() => void removeKey(entry.id)}
                    onToggleEnabled={(next) => void toggleEnabled(entry, next)}
                  />
                )}
              </div>
            ))}
            {draft?.isNew ? (
              <div className={apiKeyListClasses.keyRow}>
                <ApiKeyDraftRow
                  draft={draft}
                  saving={saving}
                  onChange={setDraft}
                  onSave={saveDraft}
                  onCancel={cancelEdit}
                />
              </div>
            ) : null}
          </Scrollbar>
        </div>

        <div className={apiKeyListClasses.actionRow}>
          <div className={apiKeyListClasses.helperText}>{'每次添加一个 API 密钥'}</div>
          <Button variant="secondary" size="sm" disabled={!!draft || saving} onClick={startAdd}>
            <Plus size={14} />
            {'添加'}
          </Button>
        </div>
      </div>
    </ProviderSettingsDrawer>
  )
}

interface ApiKeyDraftRowProps {
  draft: DraftState
  saving: boolean
  onChange: (draft: DraftState) => void
  onSave: () => void | Promise<void>
  onCancel: () => void
}

function ApiKeyDraftRow({ draft, saving, onChange, onSave, onCancel }: ApiKeyDraftRowProps) {
  return (
    <div className={apiKeyListClasses.keyDraftRow}>
      <div className={apiKeyListClasses.keyDraftInputs}>
        <Input
          value={draft.label}
          placeholder={'标签'}
          className={apiKeyListClasses.keyDraftInput}
          disabled={saving}
          onChange={(event) => onChange({ ...draft, label: event.target.value })}
        />
        <Input
          value={draft.key}
          placeholder={'输入 API 密钥'}
          className={apiKeyListClasses.keyDraftInput}
          disabled={saving}
          spellCheck={false}
          autoFocus
          onChange={(event) => onChange({ ...draft, key: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void onSave()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          }}
        />
      </div>
      <div className={apiKeyListClasses.keyRowActions}>
        <Tooltip content={'保存'}>
          <button
            type="button"
            className={apiKeyListClasses.keySaveIconButton}
            aria-label={'保存'}
            disabled={saving}
            onClick={onSave}
          >
            <Check />
          </button>
        </Tooltip>
        <Tooltip content={'取消'}>
          <button
            type="button"
            className={apiKeyListClasses.keyDestructiveIconButton}
            aria-label={'取消'}
            disabled={saving}
            onClick={onCancel}
          >
            <X />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

interface ApiKeyDisplayRowProps {
  entry: ApiKeyEntry
  saving: boolean
  onEdit: () => void
  onRemove: () => void
  onToggleEnabled: (enabled: boolean) => void
}

function ApiKeyDisplayRow({
  entry,
  saving,
  onEdit,
  onRemove,
  onToggleEnabled
}: ApiKeyDisplayRowProps) {
  const handleCopy = useCallback(() => {
    void copyApiKeyToClipboard(entry.key)
  }, [entry.key])

  return (
    <div className={apiKeyListClasses.keyDisplayRow}>
      <div className={apiKeyListClasses.keyTextBlock}>
        <div className={apiKeyListClasses.keyLabel}>{entry.label || 'API Key'}</div>
        <button
          type="button"
          title={'复制'}
          className={`${apiKeyListClasses.keyValue} block cursor-pointer text-left transition-colors hover:text-foreground`}
          onClick={handleCopy}
        >
          {maskApiKey(entry.key)}
        </button>
      </div>
      <div className={apiKeyListClasses.keyRowActions}>
        <Tooltip content={'复制'}>
          <button
            type="button"
            className={apiKeyListClasses.keyIconButton}
            aria-label={'复制'}
            disabled={saving}
            onClick={handleCopy}
          >
            <Copy />
          </button>
        </Tooltip>
        <Tooltip content={'编辑'}>
          <button
            type="button"
            className={apiKeyListClasses.keyIconButton}
            aria-label={'编辑'}
            disabled={saving}
            onClick={onEdit}
          >
            <Edit3 />
          </button>
        </Tooltip>
        <Tooltip content={'删除'}>
          <button
            type="button"
            className={apiKeyListClasses.keyDestructiveIconButton}
            aria-label={'删除'}
            disabled={saving}
            onClick={onRemove}
          >
            <Minus />
          </button>
        </Tooltip>
        <Switch
          size="xs"
          checked={entry.isEnabled}
          disabled={saving}
          onCheckedChange={onToggleEnabled}
        />
      </div>
    </div>
  )
}

