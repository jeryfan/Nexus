import {
  Check,
  Ellipsis,
  ExternalLink,
  Import,
  Monitor,
  Plus,
  Settings,
  SquareCode
} from 'lucide-react'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { useBrowserStore } from '@renderer/stores/browser'
import { BROWSER_FAMILY_LABELS } from '@shared/browser/constants'
import type { BrowserSessionProfile, BrowserViewportPresetId } from '@shared/browser/types'

type DetectedBrowserEntry = {
  family: string
  label: string
  profiles: { name: string; directory: string }[]
  selectedProfile: string
}
import { BROWSER_VIEWPORT_PRESETS } from '@shared/browser/browser-viewport-presets'
import { translate } from '../i18n'

type BrowserToolbarMenuDropdownProps = {
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  allProfiles: BrowserSessionProfile[]
  effectiveProfileId: string
  onSwitchProfile: (profileId: string | null) => void
  onNewProfile: () => void
  detectedBrowsers: DetectedBrowserEntry[]
  onFetchDetectedBrowsers: () => void
  browserSessionImportState: { profileId: string; status: string } | null | undefined
  onImportFromBrowser: (browserFamily: string, browserProfile?: string) => void
  onImportFromFile: () => void
  viewportPresetId: BrowserViewportPresetId | null
  onApplyViewportPreset: (nextId: BrowserViewportPresetId | null) => void
  onOpenDevTools: () => void
  canOpenInDefaultBrowser: boolean
  onOpenInDefaultBrowser: () => void
}

export function BrowserToolbarMenuDropdown({
  menuOpen,
  onMenuOpenChange,
  allProfiles,
  effectiveProfileId,
  onSwitchProfile,
  onNewProfile,
  detectedBrowsers,
  onFetchDetectedBrowsers,
  browserSessionImportState,
  onImportFromBrowser,
  onImportFromFile,
  viewportPresetId,
  onApplyViewportPreset,
  onOpenDevTools,
  canOpenInDefaultBrowser,
  onOpenInDefaultBrowser
}: BrowserToolbarMenuDropdownProps): React.JSX.Element {
  return (
    <DropdownMenu modal={false} open={menuOpen} onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title={translate(
            'auto.components.browser.pane.BrowserToolbarMenu.7b838540c7',
            'Browser menu'
          )}
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {allProfiles.map((profile) => {
          const isSelectedProfile = profile.id === effectiveProfileId
          return (
            <DropdownMenuItem
              key={profile.id}
              onSelect={() => onSwitchProfile(profile.id === 'default' ? null : profile.id)}
            >
              <Check
                className={`mr-2 size-3.5 shrink-0 ${isSelectedProfile ? 'opacity-100' : 'opacity-0'}`}
              />
              <span className="truncate">{profile.label}</span>
              {profile.source?.browserFamily && (
                <span className="ml-auto pl-2 text-[11px] text-muted-foreground">
                  {BROWSER_FAMILY_LABELS[profile.source.browserFamily] ??
                    profile.source.browserFamily}
                </span>
              )}
            </DropdownMenuItem>
          )
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onNewProfile}>
          <Plus className="mr-2 size-3.5" />
          {translate('auto.components.browser.pane.BrowserToolbarMenu.cf7cdc67ef', 'New Profile…')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub
          onOpenChange={(open) => {
            if (open) {
              // Why: macOS treats other browsers' profile folders as app
              // data. Only probe them when the user opens the import menu.
              onFetchDetectedBrowsers()
            }
          }}
        >
          <DropdownMenuSubTrigger
            disabled={
              browserSessionImportState?.profileId === effectiveProfileId &&
              browserSessionImportState.status === 'importing'
            }
            data-contextual-tour-target="browser-import-cookies-control"
          >
            <Import className="mr-2 size-3.5" />
            {translate(
              'auto.components.browser.pane.BrowserToolbarMenu.2293adf620',
              'Import Cookies'
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              {detectedBrowsers.map((browser) =>
                browser.profiles.length > 1 ? (
                  <DropdownMenuSub key={browser.family}>
                    <DropdownMenuSubTrigger>
                      {translate(
                        'auto.components.browser.pane.BrowserToolbarMenu.eb280bfb11',
                        'From {{value0}}',
                        { value0: browser.label }
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        {browser.profiles.map((profile) => (
                          <DropdownMenuItem
                            key={profile.directory}
                            onSelect={() => onImportFromBrowser(browser.family, profile.directory)}
                          >
                            {profile.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuItem
                    key={browser.family}
                    onSelect={() => onImportFromBrowser(browser.family)}
                  >
                    {translate(
                      'auto.components.browser.pane.BrowserToolbarMenu.eb280bfb11',
                      'From {{value0}}',
                      { value0: browser.label }
                    )}
                  </DropdownMenuItem>
                )
              )}
              {detectedBrowsers.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={onImportFromFile}>
                {translate(
                  'auto.components.browser.pane.BrowserToolbarMenu.56f94f4ffa',
                  'From File…'
                )}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Monitor className="mr-2 size-3.5" />
            {translate(
              'auto.components.browser.pane.BrowserToolbarMenu.e5d31de1a9',
              'Viewport Size'
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              {/* Why: Viewport is a "pick one of N" control, so use a radio group
                  for proper a11y semantics (role="menuitemradio", aria-checked).
                  The "Default" option represents a null preset (no override),
                  encoded as the sentinel string 'default' because
                  DropdownMenuRadioGroup values must be strings. */}
              <DropdownMenuRadioGroup
                value={viewportPresetId ?? 'default'}
                onValueChange={(v) =>
                  onApplyViewportPreset(v === 'default' ? null : (v as BrowserViewportPresetId))
                }
              >
                <DropdownMenuRadioItem value="default">
                  {translate(
                    'auto.components.browser.pane.BrowserToolbarMenu.ed8f54509d',
                    'Default'
                  )}
                </DropdownMenuRadioItem>
                <DropdownMenuSeparator />
                {BROWSER_VIEWPORT_PRESETS.map((preset) => (
                  <DropdownMenuRadioItem key={preset.id} value={preset.id}>
                    <span className="truncate">{preset.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Glue for Nexus: 原工具栏独立的「开发者工具」「在默认浏览器中打开」按钮，
            窄 panel 下工具栏展示不全，入口收敛到本菜单。 */}
        <DropdownMenuItem onSelect={onOpenDevTools}>
          <SquareCode className="mr-2 size-3.5" />
          {translate(
            'auto.components.browser.pane.BrowserPane.ec75d0c412',
            'Open browser devtools'
          )}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canOpenInDefaultBrowser} onSelect={onOpenInDefaultBrowser}>
          <ExternalLink className="mr-2 size-3.5" />
          {translate(
            'auto.components.browser.pane.BrowserPane.0f41bf80c7',
            'Open in default browser'
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => {
            useBrowserStore.getState().openSettingsTarget({ pane: 'browser', repoId: null })
            useBrowserStore.getState().openSettingsPage()
          }}
        >
          <Settings className="mr-2 size-3.5" />
          {translate(
            'auto.components.browser.pane.BrowserToolbarMenu.a771c2b6c8',
            'Browser Settings…'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
