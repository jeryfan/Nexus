// TRIMMED: `./SearchableSetting` 包装（设置页搜索索引 settings-search）——Nexus 设置页无此机制，改为普通 div。
// TRIMMED: Host 选择块及 hostOptions/selectedHostId/onSelectHost 入参（多 host 体系
//          shared/execution-host、host-setting-overrides、sidebar-host-options）——Nexus 单 host 本地路径。
// 数据全部直接从 useBrowserStore 读取（BrowserSettingsPane 为薄包装），
// 新建 profile 对话框状态也在此处持有。
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useBrowserStore } from '@renderer/stores/browser'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { BrowserNewProfileDialog } from './BrowserNewProfileDialog'
import { BrowserProfileRow } from './BrowserProfileRow'
import { translate } from '../i18n'

export function BrowserSessionCookiesSection(): React.JSX.Element {
  const browserSessionProfiles = useBrowserStore((s) => s.browserSessionProfiles)
  const detectedBrowsers = useBrowserStore((s) => s.detectedBrowsers)
  const importState = useBrowserStore((s) => s.browserSessionImportState)
  const defaultBrowserSessionProfileId = useBrowserStore((s) => s.defaultBrowserSessionProfileId)
  const setDefaultBrowserSessionProfileId = useBrowserStore(
    (s) => s.setDefaultBrowserSessionProfileId
  )
  const [newProfileDialogOpen, setNewProfileDialogOpen] = useState(false)

  const defaultProfile = browserSessionProfiles.find((p) => p.id === 'default')
  const nonDefaultProfiles = browserSessionProfiles.filter((p) => p.scope !== 'default')

  return (
    // TRIMMED(SearchableSetting): 原 className 含搜索锚点的 scroll-mt-6，一并去除。
    <div className="w-full space-y-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label>
            {translate('auto.components.settings.BrowserPane.2d66a6efb5', 'Session & Cookies')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.BrowserPane.cd47bc9622',
              'Select a default profile for new browser tabs. Import cookies and switch profiles per-tab via the'
            )}{' '}
            <strong>···</strong>{' '}
            {translate('auto.components.settings.BrowserPane.e4aaf8051b', 'toolbar menu.')}
          </p>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() => setNewProfileDialogOpen(true)}
          className="shrink-0 gap-1.5"
        >
          <Plus className="size-3" />
          {translate('auto.components.settings.BrowserPane.6f2584b39e', 'Add Profile')}
        </Button>
      </div>

      <div className="space-y-2">
        <BrowserProfileRow
          profile={
            defaultProfile ?? {
              id: 'default',
              scope: 'default',
              partition: '',
              label: translate('auto.components.settings.BrowserPane.4399c77caa', 'Default'),
              source: null
            }
          }
          detectedBrowsers={detectedBrowsers}
          importState={importState}
          isActive={(defaultBrowserSessionProfileId ?? 'default') === 'default'}
          onSelect={() => setDefaultBrowserSessionProfileId(null)}
          isDefault
        />
        {nonDefaultProfiles.map((profile) => (
          <BrowserProfileRow
            key={profile.id}
            profile={profile}
            detectedBrowsers={detectedBrowsers}
            importState={importState}
            isActive={(defaultBrowserSessionProfileId ?? 'default') === profile.id}
            onSelect={() => setDefaultBrowserSessionProfileId(profile.id)}
          />
        ))}
      </div>

      <BrowserNewProfileDialog open={newProfileDialogOpen} onOpenChange={setNewProfileDialogOpen} />
    </div>
  )
}
