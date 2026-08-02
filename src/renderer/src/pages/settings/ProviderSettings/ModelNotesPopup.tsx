import { Button } from '@nexus/ui'
import MarkdownEditor from '@renderer/components/MarkdownEditor'
import { useProvider } from '@renderer/hooks/useProvider'
import { createPopup, type PopupInjectedProps } from '@renderer/services/popup'
import { toast } from '@renderer/services/toast'
import type { FC } from 'react'
import { useEffect, useState } from 'react'

import ProviderSettingsDrawer from './primitives/ProviderSettingsDrawer'
import { drawerClasses } from './primitives/ProviderSettingsPrimitives'

interface ShowParams {
  providerId: string
}

type Props = ShowParams & PopupInjectedProps<any>

const PopupContainer: FC<Props> = ({ providerId, open, resolve }) => {
  const { provider, updateProvider } = useProvider(providerId)
  const [notes, setNotes] = useState<string>(provider?.settings?.notes || '')
  const [edited, setEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (edited) {
      return
    }

    setNotes(provider?.settings?.notes || '')
  }, [edited, provider?.settings?.notes])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProvider({ providerSettings: { ...provider?.settings, notes } })
      resolve({})
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onCancel = () => {
    resolve({})
  }

  const footer = (
    <div className={drawerClasses.footer}>
      <Button variant="outline" onClick={onCancel}>
        {'取消'}
      </Button>
      <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
        {'保存'}
      </Button>
    </div>
  )

  return (
    <ProviderSettingsDrawer
      title={'模型备注'}
      open={open}
      onClose={onCancel}
      footer={footer}
      bodyClassName="flex min-h-0 flex-1 flex-col px-5 py-4"
    >
      <div className="min-h-0 flex-1">
        <MarkdownEditor
          value={notes}
          onChange={(value) => {
            setEdited(true)
            setNotes(value)
          }}
          placeholder={'请输入 Markdown 格式内容...'}
          height="400px"
        />
      </div>
    </ProviderSettingsDrawer>
  )
}

const ModelNotesPopup = createPopup<ShowParams, any>(PopupContainer, { dismissResult: {} })

export default ModelNotesPopup
