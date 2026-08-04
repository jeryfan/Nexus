/* eslint-disable max-lines */
/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: BrowserPane synchronizes Electron webviews, remote browser drivers, streams, downloads, and annotation overlays; those external lifecycles cannot be derived during render. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@renderer/lib/utils'
import { createBrowserUuid } from '../lib/browser-uuid'
import {
  getZoomLevel,
  openFilePath,
  openInFileManager,
  openUrl,
  writeClipboardImage,
  writeClipboardText
} from '../lib/browser-host'
// 裁剪: connection-context / terminal-links / file-preview / workspace-file-drag
// （worktree 文件体系与远程连接增强入口：终端链接路径定位、文件预览开标签、文件拖入浏览器）。
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Copy,
  CornerDownLeft,
  Crosshair,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Image,
  Loader2,
  MessageCircleQuestionMark,
  MessageSquarePlus,
  OctagonX,
  PencilLine,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { Button } from '../ui/button'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
// 裁剪: BrowserAnnotationSendMenuContent（依赖 ReviewNotesSendMenuContent →
// agent/dashboard/telemetry 依赖链；标注「发送到 agent/review」入口随依赖链一并裁剪）。
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { Label } from '../ui/label'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { useBrowserStore } from '@renderer/stores/browser'
// 裁剪: getRuntimeEnvironmentIdForWorktree（@/lib/worktree-runtime-owner，远程 runtime 归属）。
import { NEXUS_BROWSER_BLANK_URL, NEXUS_BROWSER_PARTITION } from '@shared/browser/constants'
// 裁剪: BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY（远程 runtime 证书信任能力位）。
import { getBrowserDefaultPartition } from '@shared/browser/browser-profiles'
import type {
  BrowserLoadError,
  BrowserPage as BrowserPageState,
  BrowserWorkspace as BrowserWorkspaceState
} from '@shared/browser/types'
import {
  normalizeBrowserNavigationUrl,
  normalizeExternalBrowserUrl,
  redactKagiSessionToken,
  toHttpsRecoveryUrl
} from '@shared/browser/browser-url'
import { keybindingMatchesAction } from '@shared/browser/keybindings'
import { getScreenSubmitModifierLabel, isScreenSubmitShortcut } from '../lib/screen-submit-shortcut'
import {
  browserViewportPresetToOverride,
  getBrowserViewportPreset
} from '@shared/browser/browser-viewport-presets'
import { rememberLiveBrowserUrl } from './browser-runtime'
import { ensureBrowserPageWebview } from './browser-page-webview'
import {
  destroyPersistentWebview,
  moveFocusToRendererBeforeWebviewDetach,
  registeredWebContentsIds
} from './webview-registry'
import {
  applyBrowserPageViewportLayout,
  ensureBrowserPageViewport,
  getBrowserOverlaySlotViewport,
  parkBrowserPageViewport,
  subscribeBrowserOverlaySlotViewport,
  syncBrowserPageChromeInset
} from './browser-page-viewport'
import { useBrowserAutomationVisiblePageIds } from './browser-automation-visibility'
import type {
  BrowserDownloadRequestedEvent,
  BrowserDownloadProgressEvent,
  BrowserDownloadFinishedEvent
} from '@shared/browser/browser-guest-events'
import {
  GRAB_BUDGET,
  type BrowserAnnotationIntent,
  type BrowserAnnotationPayload,
  type BrowserAnnotationPriority,
  type BrowserGrabPayload,
  type BrowserGrabRect,
  type BrowserGrabScreenshot,
  type BrowserPageAnnotation
} from '@shared/browser/browser-grab-types'
import { BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX } from '@shared/browser/browser-annotation-viewport-bridge'
import { useGrabMode } from './useGrabMode'
import { formatGrabPayloadAsText } from './GrabConfirmationSheet'
import { formatBrowserAnnotationsAsMarkdown } from './browser-annotation-output'
import { isEditableKeyboardTarget } from './browser-keyboard'
import { getBrowserPagesForWorkspace } from './browser-pane-page-selection'
import BrowserAddressBar from './BrowserAddressBar'
// 裁剪: BrowserImportHintButton（工具栏「导入」提示按钮）——窄 panel 下工具栏空间不足，
// 导入入口收敛到三点菜单既有的「Import Cookies」子菜单。
import { BrowserToolbarMenu } from './BrowserToolbarMenu'
import BrowserFind from './BrowserFind'
// 裁剪: BrowserMobileDriverOverlay / remote-browser-frame-style /
// remote-browser-keyboard（远程 runtime 移动 driver 与 screencast 帧渲染，随远程分支裁剪）。
import { getShortcutPlatform, useShortcutLabel } from '../hooks/useShortcutLabel'
import {
  consumeBrowserFocusRequest,
  NEXUS_BROWSER_FOCUS_REQUEST_EVENT,
  type BrowserFocusRequestDetail
} from './browser-focus'
import {
  addBrowserPageZoomEventListener,
  applyBrowserPageZoom,
  browserPageZoomLevelToPercent,
  DEFAULT_BROWSER_PAGE_ZOOM_LEVEL,
  getBrowserPageZoomIndicatorState,
  getExplicitBrowserPageZoomLevel,
  normalizeBrowserPageZoomLevel,
  rememberExplicitBrowserPageZoomLevel,
  setBrowserPageZoomLevel,
  type BrowserPageZoomDirection
} from './browser-page-zoom'
// 裁剪: @/runtime/runtime-file-client / runtime-rpc-client / runtime-worktree-selector、
// shared/runtime-types、browser-screencast-protocol 解码、runtime-rpc-feature-interaction-source、
// @/lib/pane-manager/browser-mobile-driver-state（远程 runtime RPC / screencast / 移动 driver 分支）。
// 裁剪: useContextualTour（@/components/contextual-tours，Nexus 无引导教程体系）。
import { formatByteCount, formatPermissionNotice, formatPopupNotice } from './browser-notices'
import { shouldPollChromiumErrorPage } from './chromium-error-page-polling'
import { translate } from '../i18n'
import { isBrowserPagePanePaintable } from './browser-page-paintability'
import { useMarkupMode, type MarkupCaptureContext } from './markup/useMarkupMode'
import { MarkupOverlay } from './markup/MarkupOverlay'
import { MarkupDrawButton } from './markup/MarkupDrawButton'
import { deliverMarkupToClipboard } from './markup/markup-clipboard-delivery'
import { BrowserLoadFailureOverlay } from './browser-load-failure-overlay'

type BrowserTabPageState = Partial<
  Pick<
    BrowserPageState,
    'title' | 'loading' | 'faviconUrl' | 'canGoBack' | 'canGoForward' | 'loadError'
  >
>

type BrowserDownloadState = Omit<BrowserDownloadRequestedEvent, 'status' | 'savePath'> & {
  receivedBytes: number
  status: 'downloading' | 'completed' | 'failed' | 'canceled'
  savePath: string | null
  error: string | null
  progressState: BrowserDownloadProgressEvent['state']
  completedAt: number | null
}

function formatBrowserDownloadProgress(download: BrowserDownloadState): string | null {
  const received = formatByteCount(download.receivedBytes)
  const total = formatByteCount(download.totalBytes)
  if (received && total) {
    return `${received} / ${total}`
  }
  return received ?? total
}

type GrabIntent = 'copy' | 'annotate'

type BrowserOverlayAnchor = {
  x: number
  y: number
  below: boolean
}

const BROWSER_ANNOTATION_INTENT_OPTIONS = [
  {
    value: 'change',
    get label() {
      return translate('auto.components.browser.pane.BrowserPane.143204e423', 'Change')
    },
    icon: PencilLine
  },
  {
    value: 'question',
    get label() {
      return translate('auto.components.browser.pane.BrowserPane.b5ba6085de', 'Question')
    },
    icon: MessageCircleQuestionMark
  }
] as const

// Why: priority stays in the persisted annotation shape for backwards compat, though the UI no longer exposes urgency choices.
const DEFAULT_BROWSER_ANNOTATION_PRIORITY: BrowserAnnotationPriority = 'important'
const BROWSER_PAGE_ZOOM_FEEDBACK_MS = 1400

// Glue for Nexus: 剪贴板写入为 fire-and-forget，失败仅告警，避免 unhandled rejection。
function warnClipboardWriteError(error: unknown): void {
  console.warn('[browser] clipboard write failed', error)
}

type BrowserOverlayViewport = {
  scrollX: number
  scrollY: number
  version: number
}

// 裁剪: decodeRemoteBrowserFrameUrl / RemoteBrowserStream* / RemoteBrowserOperationToken /
// RemoteBrowserContextMenu / RemoteBrowserViewportSize / getBrowserPageRuntimeEnvironmentId /
// RemoteBrowserImagePoint / PendingRemoteBrowserWheel / WHEEL_DELTA_*（远程 runtime screencast 分支）。

const EMPTY_BROWSER_ANNOTATIONS: BrowserPageAnnotation[] = []
const PENDING_ANNOTATION_CARD_HEIGHT = 330

function createBrowserAnnotationId(): string {
  return `browser-annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createBrowserAnnotationPayload(payload: BrowserGrabPayload): BrowserAnnotationPayload {
  return {
    ...payload,
    // Why: annotations are persisted; screenshot data is a transient copy payload that can be megabytes per selection.
    screenshot: null
  }
}

function getBrowserOverlayAnchor(
  payload: BrowserGrabPayload,
  container: HTMLElement | null,
  webview: Electron.WebviewTag | null,
  viewport: BrowserOverlayViewport
): BrowserOverlayAnchor {
  const containerRect = container?.getBoundingClientRect()
  const webviewRect = webview?.getBoundingClientRect()
  const rect = getLiveBrowserAnnotationRect(payload, viewport)
  const offsetX = (webviewRect?.left ?? 0) - (containerRect?.left ?? 0)
  const offsetY = (webviewRect?.top ?? 0) - (containerRect?.top ?? 0)
  const elementBottom = offsetY + rect.y + rect.height
  const elementTop = offsetY + rect.y
  const containerWidth = containerRect?.width ?? 0
  const containerHeight = containerRect?.height ?? 0
  const below = elementBottom + PENDING_ANNOTATION_CARD_HEIGHT < containerHeight
  return {
    x: clampNumber(offsetX + rect.x + rect.width / 2, 12, Math.max(12, containerWidth - 12)),
    y: clampNumber(below ? elementBottom : elementTop, 12, Math.max(12, containerHeight - 12)),
    below
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getLiveBrowserAnnotationRect(
  payload: BrowserGrabPayload,
  viewport: BrowserOverlayViewport
): BrowserGrabRect {
  if (payload.target.isFixed) {
    return payload.target.rectViewport
  }
  const scrollX = viewport.version === 0 ? payload.page.scrollX : viewport.scrollX
  const scrollY = viewport.version === 0 ? payload.page.scrollY : viewport.scrollY
  return {
    ...payload.target.rectViewport,
    x: payload.target.rectPage.x - scrollX,
    y: payload.target.rectPage.y - scrollY
  }
}

function PendingBrowserAnnotationCard({
  payload,
  anchor,
  portalContainer,
  onAdd,
  onCancel
}: {
  payload: BrowserGrabPayload
  anchor: BrowserOverlayAnchor
  portalContainer: HTMLElement | null
  onAdd: (comment: string, intent: BrowserAnnotationIntent) => void
  onCancel: () => void
}): React.JSX.Element {
  const [comment, setComment] = useState('')
  const [intent, setIntent] = useState<BrowserAnnotationIntent>('change')
  const trimmed = comment.trim()
  const submitModifierLabel = getScreenSubmitModifierLabel()

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <PopoverAnchor asChild>
        <span
          className="pointer-events-none absolute size-px"
          style={{ left: anchor.x, top: anchor.y }}
        />
      </PopoverAnchor>
      <PopoverContent
        side={anchor.below ? 'bottom' : 'top'}
        align="center"
        sideOffset={10}
        collisionBoundary={portalContainer ?? undefined}
        collisionPadding={12}
        portalContainer={portalContainer}
        className="z-40 w-[22rem] max-w-[calc(var(--radix-popover-content-available-width)-1rem)] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
        aria-label={translate(
          'auto.components.browser.pane.BrowserPane.b472c5fe03',
          'Add browser annotation'
        )}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          onCancel()
        }}
      >
        <div className="mb-2 min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            {payload.target.accessibility.accessibleName ||
              payload.target.textSnippet ||
              payload.target.tagName}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {payload.target.selector}
          </div>
        </div>
        <Label htmlFor="browser-annotation-comment" className="sr-only">
          {translate('auto.components.browser.pane.BrowserPane.d2a7092e6e', 'Annotation comment')}
        </Label>
        <textarea
          id="browser-annotation-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={translate(
            'auto.components.browser.pane.BrowserPane.532bac48c5',
            'Describe what the agent should change here...'
          )}
          maxLength={GRAB_BUDGET.annotationCommentMaxLength}
          className="h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onCancel()
              return
            }
            if (isScreenSubmitShortcut(event)) {
              event.preventDefault()
              event.stopPropagation()
              if (trimmed) {
                onAdd(trimmed, intent)
              }
            }
          }}
        />
        <div className="mt-2 min-w-0">
          <Label className="mb-1 block text-xs text-muted-foreground">
            {translate('auto.components.browser.pane.BrowserPane.8f87e6c2e5', 'Intent')}
          </Label>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={intent}
            onValueChange={(value) => {
              if (value) {
                setIntent(value as BrowserAnnotationIntent)
              }
            }}
            className="h-8 w-full [&_[data-slot=toggle-group-item]]:h-8 [&_[data-slot=toggle-group-item]]:flex-1 [&_[data-slot=toggle-group-item]]:px-2"
            aria-label={translate(
              'auto.components.browser.pane.BrowserPane.0cb3bd6221',
              'Annotation intent'
            )}
          >
            {BROWSER_ANNOTATION_INTENT_OPTIONS.map((option) => {
              const Icon = option.icon
              return (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  aria-label={option.label}
                  className="gap-1.5 text-xs data-[state=on]:border-foreground/20 data-[state=on]:bg-foreground/10 data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:hover:bg-foreground/15 data-[state=on]:hover:text-foreground"
                >
                  <Icon className="size-3.5" />
                  <span>{option.label}</span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
            {translate('auto.components.browser.pane.BrowserPane.fa6ea61de3', 'Cancel')}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={!trimmed}
            onClick={() => onAdd(trimmed, intent)}
          >
            <MessageSquarePlus className="size-3.5" />
            {translate('auto.components.browser.pane.BrowserPane.90d021f2ad', 'Add')}
            <span className="ml-1 inline-flex items-center gap-0.5 rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-medium leading-none text-current/80">
              <span>{submitModifierLabel}</span>
              <CornerDownLeft className="size-3" />
            </span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// 裁剪: browserPageExists / isRemoteBrowserPageMissingError /
// isRemoteBrowserPageMissingCode（远程 runtime 页面丢失检测）。

function buildLoadError(event: {
  errorCode?: number
  errorDescription?: string
  validatedURL?: string
}): BrowserLoadError {
  return {
    code: event.errorCode ?? -1,
    description: event.errorDescription ?? 'Unknown load failure',
    validatedUrl: redactKagiSessionToken(event.validatedURL ?? 'about:blank')
  }
}

function toDisplayUrl(url: string): string {
  return url === NEXUS_BROWSER_BLANK_URL ? 'about:blank' : redactKagiSessionToken(url)
}

function getBrowserDisplayTitle(title: string | null | undefined, url: string): string {
  if (
    url === 'about:blank' ||
    url === NEXUS_BROWSER_BLANK_URL ||
    title === 'about:blank' ||
    title === NEXUS_BROWSER_BLANK_URL ||
    !title
  ) {
    return 'New Tab'
  }
  return title
}

function isChromiumErrorPage(url: string): boolean {
  return url.startsWith('chrome-error://')
}

// 裁剪: fileUrlToAbsolutePath / getNotebookPathFromBrowserUrl（file:// notebook
// 分支专用，随该分支裁剪）。

// 裁剪: getRemoteBrowserMouseButton / buildRemoteContextMenuExpression /
// readRemoteContextMenuResult / readRemoteCssViewportSize / getPositiveFiniteNumber /
// areRemoteViewportSizesNear / getRemoteBrowserDeviceScaleFactor（远程 runtime 交互辅助）。

function getOpenableExternalUrl(
  webview: Electron.WebviewTag | null,
  fallbackUrl: string
): string | null {
  let currentUrl = fallbackUrl
  if (webview) {
    try {
      currentUrl = webview.getURL() || fallbackUrl
    } catch {
      // Why: querying nav state before dom-ready throws and blanks the whole IDE on launch; fall back to the persisted URL.
      currentUrl = fallbackUrl
    }
  }
  return normalizeExternalBrowserUrl(redactKagiSessionToken(currentUrl))
}

function getCurrentBrowserUrl(webview: Electron.WebviewTag | null, fallbackUrl: string): string {
  let currentUrl = fallbackUrl
  if (webview) {
    try {
      currentUrl = webview.getURL() || fallbackUrl
    } catch {
      // Why: toolbar actions need a stable URL during early guest attach/restore; fall back to the persisted URL instead of throwing.
      currentUrl = fallbackUrl
    }
  }
  return toDisplayUrl(currentUrl)
}

function retryBrowserTabLoad(
  webview: Electron.WebviewTag | null,
  browserTab: BrowserPageState,
  onUpdatePageState: (tabId: string, updates: BrowserTabPageState) => void
): void {
  if (!webview) {
    return
  }

  const retryUrl = normalizeBrowserNavigationUrl(
    browserTab.loadError?.validatedUrl ?? browserTab.url
  )
  if (!retryUrl) {
    return
  }

  // Why: after chrome-error://, reload() only refreshes the error page — force navigation back to the attempted URL; keep the failure visible until success.
  onUpdatePageState(browserTab.id, {
    loading: true,
    title: retryUrl
  })
  webview.src = retryUrl
}

export type BrowserFindShortcutScope = 'focused' | 'inactive' | 'owned-target'

function browserOverlayOwnsShortcutTarget(
  target: EventTarget | null,
  browserTabId: string
): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  return (
    target.closest('[data-browser-overlay-tab-id]')?.getAttribute('data-browser-overlay-tab-id') ===
    browserTabId
  )
}

export default function BrowserPane({
  browserTab,
  isActive,
  findShortcutScope
}: {
  browserTab: BrowserWorkspaceState
  isActive: boolean
  findShortcutScope?: BrowserFindShortcutScope
}): React.JSX.Element {
  const resolvedFindShortcutScope = findShortcutScope ?? (isActive ? 'focused' : 'inactive')
  // 裁剪: activeRuntimeEnvironmentId / runtimeEnvironmentActive / 远程 dispatch
  // （getRuntimeEnvironmentIdForWorktree → RemoteBrowserPagePane 分支）、mobile driver
  // （useBrowserMobileDrivenPageIds / getDriverForBrowserPage / BrowserMobileDriverOverlay /
  // reclaimActiveBrowserForDesktop）与 useContextualTour——Nexus 仅本地 webview 路径。
  const browserPages = useBrowserStore((s) =>
    getBrowserPagesForWorkspace(s.browserPagesByWorkspace, browserTab.id)
  )
  const activeBrowserPage =
    browserPages.find((page) => page.id === browserTab.activePageId) ?? browserPages[0] ?? null
  const updateBrowserPageState = useBrowserStore((s) => s.updateBrowserPageState)
  const setBrowserPageUrl = useBrowserStore((s) => s.setBrowserPageUrl)
  const browserPageIds = useMemo(() => browserPages.map((page) => page.id), [browserPages])
  const automationVisiblePageIds = useBrowserAutomationVisiblePageIds(browserPageIds)
  // Why: inactive webviews must stay mounted in their original DOM parent; unmounting/reparenting loses form text and SPA state.
  const renderedBrowserPages = browserPages

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {renderedBrowserPages.length > 0 ? (
        <div className="relative flex min-h-0 flex-1">
          {renderedBrowserPages.map((page) => (
            <BrowserPagePane
              key={page.id}
              browserTab={page}
              workspaceId={browserTab.id}
              worktreeId={browserTab.worktreeId}
              sessionProfileId={browserTab.sessionProfileId ?? null}
              sessionPartition={browserTab.sessionPartition ?? null}
              isActive={isActive && page.id === activeBrowserPage?.id}
              findShortcutScope={
                page.id === activeBrowserPage?.id ? resolvedFindShortcutScope : 'inactive'
              }
              isAutomationVisible={automationVisiblePageIds.has(page.id)}
              isMobileDriven={false}
              inputLocked={false}
              onUpdatePageState={updateBrowserPageState}
              onSetUrl={setBrowserPageUrl}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// 裁剪: RemoteBrowserPagePane（远程 runtime screencast 浏览器面板；Nexus 仅本地
// webview 路径，runtimeEnvironmentActive 分支取本地路径）。

// 裁剪: preventAgentSendTargetOutsideDismiss（随标注「发送到 agent」popover 裁剪）。

function BrowserPagePane({
  browserTab,
  workspaceId,
  worktreeId,
  sessionProfileId,
  sessionPartition,
  isActive,
  findShortcutScope,
  isAutomationVisible,
  isMobileDriven,
  inputLocked,
  onUpdatePageState,
  onSetUrl
}: {
  browserTab: BrowserPageState
  workspaceId: string
  worktreeId: string
  sessionProfileId: string | null
  sessionPartition: string | null
  isActive: boolean
  findShortcutScope: BrowserFindShortcutScope
  isAutomationVisible: boolean
  isMobileDriven: boolean
  inputLocked: boolean
  onUpdatePageState: (tabId: string, updates: BrowserTabPageState) => void
  onSetUrl: (tabId: string, url: string) => void
}): React.JSX.Element {
  const isPaintable = isBrowserPagePanePaintable({
    isActive,
    isAutomationVisible,
    isMobileDriven
  })
  const pageViewport = ensureBrowserPageViewport(browserTab.id, workspaceId)
  const containerRef = useRef<HTMLDivElement | null>(null)
  containerRef.current = pageViewport?.container ?? null
  const chromeHeaderRef = useRef<HTMLDivElement | null>(null)
  const grabToastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const annotationCopyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const browserZoomFeedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    return () => {
      clearTimeout(grabToastTimerRef.current)
      clearTimeout(annotationCopyTimerRef.current)
      clearTimeout(browserZoomFeedbackTimerRef.current)
    }
  }, [])
  const [slotViewportReady, setSlotViewportReady] = useState(
    () => getBrowserOverlaySlotViewport(workspaceId) !== null
  )
  useLayoutEffect(() => {
    if (getBrowserOverlaySlotViewport(workspaceId)) {
      setSlotViewportReady(true)
      return
    }
    return subscribeBrowserOverlaySlotViewport(workspaceId, () => {
      setSlotViewportReady(true)
    })
  }, [workspaceId])
  const addressBarInputRef = useRef<HTMLInputElement | null>(null)
  const dismissAddressBarSuggestionsRef = useRef<(() => void) | null>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const browserTabIdRef = useRef(browserTab.id)
  browserTabIdRef.current = browserTab.id
  const inputLockedRef = useRef(inputLocked)
  inputLockedRef.current = inputLocked
  const navigateBrowserHistoryRef = useRef<(direction: 'back' | 'forward') => void>(() => {})
  navigateBrowserHistoryRef.current = (direction: 'back' | 'forward'): void => {
    // Why: Logitech Options+ side-button remaps arrive as these chords on macOS; route through the same nav path as the toolbar.
    if (direction === 'back') {
      webviewRef.current?.goBack()
    } else {
      webviewRef.current?.goForward()
    }
  }
  const keybindings = useBrowserStore((state) => state.keybindings)
  const browserDefaultZoomLevel = useBrowserStore(
    (state) => state.browserDefaultZoomLevel ?? DEFAULT_BROWSER_PAGE_ZOOM_LEVEL
  )
  const setBrowserDefaultZoomLevel = useBrowserStore((state) => state.setBrowserDefaultZoomLevel)
  const normalizedBrowserDefaultZoomLevel = normalizeBrowserPageZoomLevel(browserDefaultZoomLevel)
  const browserDefaultZoomPercent = browserPageZoomLevelToPercent(normalizedBrowserDefaultZoomLevel)
  // Why: the level THIS pane should hold. Seeded from the configured default ("applied to newly
  // opened browser tabs") and moved only by zooming this pane, so a reload can't broadcast another
  // tab's zoom through the shared setting. Why the module-level lookup: the guest webview outlives
  // this component (worktree switch, Settings visit), so re-seeding on remount would let a later
  // Settings change retroactively hijack a tab the user already zoomed.
  const paneZoomLevelRef = useRef(
    getExplicitBrowserPageZoomLevel(browserTab.id) ?? normalizedBrowserDefaultZoomLevel
  )
  const grabElementShortcut = useShortcutLabel('browser.grabElement')
  const faviconUrlRef = useRef<string | null>(browserTab.faviconUrl)
  const initialBrowserUrlRef = useRef(browserTab.url)
  const browserTabUrlRef = useRef(browserTab.url)
  const activeLoadFailureRef = useRef<BrowserLoadError | null>(browserTab.loadError)
  // Why: CDP viewport emulation doesn't survive renderer process swaps, so reapply the preset from this ref on every dom-ready.
  const viewportPresetIdRef = useRef(browserTab.viewportPresetId ?? null)
  viewportPresetIdRef.current = browserTab.viewportPresetId ?? null
  const trackNextLoadingEventRef = useRef(false)
  // Most-recent observed webview URL; URL sync checks it to avoid force-navigating to an intermediate redirect (which would loop the redirect chain).
  const lastKnownWebviewUrlRef = useRef<string | null>(null)
  const onUpdatePageStateRef = useRef(onUpdatePageState)
  const onSetUrlRef = useRef(onSetUrl)
  const addBrowserHistoryEntry = useBrowserStore((s) => s.addBrowserHistoryEntry)
  const addBrowserHistoryEntryRef = useRef(addBrowserHistoryEntry)
  const [addressBarValue, setAddressBarValue] = useState(browserTab.url)
  const addressBarValueRef = useRef(browserTab.url)
  const [resourceNotice, setResourceNotice] = useState<string | null>(null)
  const [downloadStates, setDownloadStates] = useState<BrowserDownloadState[]>([])
  const downloadStatesRef = useRef<BrowserDownloadState[]>([])
  const [browserZoomPercent, setBrowserZoomPercent] = useState(browserDefaultZoomPercent)
  const [browserZoomFeedbackVisible, setBrowserZoomFeedbackVisible] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    linkUrl: string | null
    pageUrl: string
    selectionText: string
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [findOpen, setFindOpen] = useState(false)
  const grab = useGrabMode(browserTab.id)

  const markup = useMarkupMode({
    getCaptureContext: useCallback((): MarkupCaptureContext | null => {
      const webview = webviewRef.current
      const container = containerRef.current
      if (!webview || !container) {
        return null
      }
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return null
      }
      return {
        source: { kind: 'webview', webview },
        cssWidth: rect.width,
        cssHeight: rect.height,
        outputScale: window.devicePixelRatio || 1
      }
    }, []),
    onDeliver: deliverMarkupToClipboard
  })
  const [grabIntent, setGrabIntent] = useState<GrabIntent>('copy')
  const grabIntentRef = useRef(grabIntent)
  grabIntentRef.current = grabIntent
  const [pendingAnnotationPayload, setPendingAnnotationPayload] =
    useState<BrowserGrabPayload | null>(null)
  const pendingAnnotationPayloadRef = useRef<BrowserGrabPayload | null>(null)
  pendingAnnotationPayloadRef.current = pendingAnnotationPayload
  const [browserOverlayViewport, setBrowserOverlayViewport] = useState<BrowserOverlayViewport>({
    scrollX: 0,
    scrollY: 0,
    version: 0
  })
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const annotationViewportBridgeTokenRef = useRef(createBrowserUuid().replaceAll('-', ''))
  const browserAnnotations = useBrowserStore(
    (s) => s.browserAnnotationsByPageId[browserTab.id] ?? EMPTY_BROWSER_ANNOTATIONS
  )
  const certificateFailure = useBrowserStore(
    (s) => s.browserCertificateFailuresByPageId[browserTab.id] ?? null
  )
  // 裁剪: activeGroupId 选择器与 agent-send popover 目标态
  // （openAgentSendPopoverTargetMode / closeAgentSendPopoverTargetMode /
  // agentSendPopoverTargetMode / annotationBannerSendOpen / annotationTraySendOpen）——
  // 标注「发送到 agent/review」依赖链裁剪（见 BrowserAnnotationSendMenuContent 处）。
  const browserAnnotationsRef = useRef(browserAnnotations)
  browserAnnotationsRef.current = browserAnnotations
  const [browserAnnotationTrayOpen, setBrowserAnnotationTrayOpen] = useState(true)
  const [browserAnnotationsCopied, setBrowserAnnotationsCopied] = useState(false)
  const browserAnnotationsPrompt = useMemo(
    () => formatBrowserAnnotationsAsMarkdown(browserAnnotations),
    [browserAnnotations]
  )
  const addBrowserPageAnnotation = useBrowserStore((s) => s.addBrowserPageAnnotation)
  const deleteBrowserPageAnnotation = useBrowserStore((s) => s.deleteBrowserPageAnnotation)
  const clearBrowserPageAnnotations = useBrowserStore((s) => s.clearBrowserPageAnnotations)
  const recordFeatureInteraction = useBrowserStore((s) => s.recordFeatureInteraction)
  const clearBrowserPageAnnotationsRef = useRef(clearBrowserPageAnnotations)
  clearBrowserPageAnnotationsRef.current = clearBrowserPageAnnotations
  const createBrowserTab = useBrowserStore((s) => s.createBrowserTab)
  const consumeAddressBarFocusRequest = useBrowserStore((s) => s.consumeAddressBarFocusRequest)
  const browserSessionProfiles = useBrowserStore((s) => s.browserSessionProfiles)
  const activeAppProfileId = useBrowserStore((s) => s.activeAppProfileId)
  const fallbackBrowserPartition = activeAppProfileId
    ? getBrowserDefaultPartition(activeAppProfileId)
    : null
  const defaultSessionProfile = browserSessionProfiles.find((p) => p.id === 'default') ?? null
  const sessionProfile = sessionProfileId
    ? (browserSessionProfiles.find((p) => p.id === sessionProfileId) ?? null)
    : defaultSessionProfile
  const webviewPartition =
    sessionPartition ??
    sessionProfile?.partition ??
    defaultSessionProfile?.partition ??
    fallbackBrowserPartition ??
    NEXUS_BROWSER_PARTITION
  const browserSessionImportState = useBrowserStore((s) => s.browserSessionImportState)
  const clearBrowserSessionImportState = useBrowserStore((s) => s.clearBrowserSessionImportState)
  const showBrowserZoomFeedback = useCallback((level: number): void => {
    setBrowserZoomPercent(browserPageZoomLevelToPercent(level))
    setBrowserZoomFeedbackVisible(true)
    clearTimeout(browserZoomFeedbackTimerRef.current)
    browserZoomFeedbackTimerRef.current = setTimeout(() => {
      setBrowserZoomFeedbackVisible(false)
    }, BROWSER_PAGE_ZOOM_FEEDBACK_MS)
  }, [])

  useEffect(() => {
    if (!browserSessionImportState) {
      return
    }
    if (browserSessionImportState.status === 'success' && browserSessionImportState.summary) {
      const { importedCookies, domains } = browserSessionImportState.summary
      const domainPreview = domains.slice(0, 3).join(', ')
      const more = domains.length > 3 ? ` +${domains.length - 3} more` : ''
      setResourceNotice(
        `Imported ${importedCookies} cookies for ${domainPreview}${more}. Reload the page to use them.`
      )
      clearBrowserSessionImportState()
    } else if (browserSessionImportState.status === 'error' && browserSessionImportState.error) {
      setResourceNotice(`Cookie import failed: ${browserSessionImportState.error}`)
      clearBrowserSessionImportState()
    }
  }, [browserSessionImportState, clearBrowserSessionImportState])

  useEffect(() => {
    if (!resourceNotice) {
      return
    }
    const timer = setTimeout(() => setResourceNotice(null), 10_000)
    return () => clearTimeout(timer)
  }, [resourceNotice])

  const keepAddressBarFocusRef = useRef(false)

  // Inline toast near the grabbed element (below, or above near the viewport bottom) so it doesn't occlude the selection.
  const [grabToast, setGrabToast] = useState<{
    message: string
    type: 'success' | 'error'
    x: number
    y: number
    below: boolean
    payload: BrowserGrabPayload | null
  } | null>(null)

  const grabRef = useRef(grab)
  grabRef.current = grab

  useEffect(() => {
    setPendingAnnotationPayload(null)
    setBrowserOverlayViewport({ scrollX: 0, scrollY: 0, version: 0 })
    setBrowserAnnotationTrayOpen(true)
    setBrowserAnnotationsCopied(false)
    clearTimeout(annotationCopyTimerRef.current)
    if (grabRef.current.state !== 'idle' && grabRef.current.state !== 'error') {
      grabRef.current.cancel()
    }
  }, [browserTab.id])

  const dismissGrabToast = useCallback(() => {
    clearTimeout(grabToastTimerRef.current)
    setGrabToast(null)
    // Why: only rearm while 'confirming'; if a C/S shortcut already rearmed (state 'armed'), skip to avoid a double-rearm race.
    if (
      grabRef.current.state === 'confirming' &&
      !(grabIntentRef.current === 'annotate' && pendingAnnotationPayloadRef.current)
    ) {
      grabRef.current.rearm()
    }
  }, [])

  const showGrabToast = useCallback(
    (message: string, type: 'success' | 'error', payload?: BrowserGrabPayload | null) => {
      let x = 0
      let y = 0
      let below = true
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (payload) {
        const rect = payload.target.rectViewport
        const webview = webviewRef.current
        const webviewRect = webview?.getBoundingClientRect()
        const offsetX = (webviewRect?.left ?? 0) - (containerRect?.left ?? 0)
        const offsetY = (webviewRect?.top ?? 0) - (containerRect?.top ?? 0)
        x = offsetX + rect.x + rect.width / 2
        const elementBottom = offsetY + rect.y + rect.height
        const elementTop = offsetY + rect.y
        const containerHeight = containerRect?.height ?? 0
        // Show below the element unless it's too close to the bottom edge
        below = elementBottom + 52 < containerHeight
        y = below ? elementBottom : elementTop
      } else if (containerRect) {
        x = containerRect.width / 2
        y = containerRect.height / 2
      }
      clearTimeout(grabToastTimerRef.current)
      setGrabToast({ message, type, x, y, below, payload: payload ?? null })
      grabToastTimerRef.current = setTimeout(() => dismissGrabToast(), 2000)
    },
    [dismissGrabToast]
  )

  // Why: the same in-guest picker powers two flows — Cmd/Ctrl+C copies, the toolbar action creates a pending annotation.
  useEffect(() => {
    if (grab.state !== 'confirming' || !grab.payload) {
      return
    }
    if (grabIntent === 'annotate') {
      setPendingAnnotationPayload(grab.payload)
      return
    }
    if (!grab.contextMenu) {
      const text = formatGrabPayloadAsText(grab.payload)
      void writeClipboardText(text).catch(warnClipboardWriteError)
      recordFeatureInteraction('browser-grab')
      showGrabToast('Copied', 'success', grab.payload)
    }
  }, [
    grab.state,
    grab.payload,
    grab.contextMenu,
    grabIntent,
    recordFeatureInteraction,
    showGrabToast
  ])

  useEffect(() => {
    if (grab.state === 'idle' || grab.state === 'error') {
      setPendingAnnotationPayload(null)
    }
  }, [grab.state])

  useEffect(() => {
    if (browserAnnotations.length === 0) {
      setBrowserAnnotationTrayOpen(true)
      setBrowserAnnotationsCopied(false)
      clearTimeout(annotationCopyTimerRef.current)
    }
  }, [browserAnnotations.length])

  useEffect(() => {
    if (!isActive || (!pendingAnnotationPayload && browserAnnotations.length === 0)) {
      return
    }

    const observedContainer = containerRef.current
    const resizeObserver =
      typeof ResizeObserver === 'undefined' || !observedContainer
        ? null
        : new ResizeObserver(() => {
            setBrowserOverlayViewport((current) => ({ ...current, version: current.version + 1 }))
          })
    if (resizeObserver && observedContainer) {
      resizeObserver.observe(observedContainer)
    }

    return () => {
      resizeObserver?.disconnect()
    }
  }, [browserAnnotations.length, isActive, pendingAnnotationPayload])

  useEffect(() => {
    initialBrowserUrlRef.current = browserTab.url
  }, [browserTab.id, browserTab.url])

  useEffect(() => {
    // Why: don't clobber an in-progress address-bar query when an async URL update lands; syncing resumes once the input blurs.
    if (document.activeElement === addressBarInputRef.current) {
      return
    }
    setAddressBarValue(toDisplayUrl(browserTab.url))
  }, [browserTab.url])

  useEffect(() => {
    browserTabUrlRef.current = browserTab.url
  }, [browserTab.url])

  useEffect(() => {
    activeLoadFailureRef.current = browserTab.loadError
  }, [browserTab.loadError])

  useEffect(() => {
    addressBarValueRef.current = addressBarValue
  }, [addressBarValue])

  useEffect(() => {
    downloadStatesRef.current = downloadStates
  }, [downloadStates])

  useEffect(() => {
    setResourceNotice(null)
    setDownloadStates([])
  }, [browserTab.id])

  useEffect(() => {
    return window.api.browser.onPermissionDenied((event) => {
      if (event.browserPageId !== browserTab.id) {
        return
      }
      setResourceNotice(formatPermissionNotice(event))
    })
  }, [browserTab.id])

  useEffect(() => {
    return window.api.browser.onPopup((event) => {
      if (event.browserPageId !== browserTab.id) {
        return
      }
      setResourceNotice(formatPopupNotice(event))
    })
  }, [browserTab.id])

  useEffect(() => {
    return window.api.browser.onContextMenuRequested((event) => {
      if (event.browserPageId !== browserTab.id) {
        return
      }
      // Why: convert OS screen cursor coords to renderer CSS pixels — immune to guest/renderer coordinate-space mismatches from zoom/DPI.
      const zoomFactor = Math.pow(1.2, getZoomLevel())
      const x = Math.round((event.screenX - window.screenX) / zoomFactor)
      const y = Math.round((event.screenY - window.screenY) / zoomFactor)
      console.debug(
        '[context-menu] screen=(%d,%d) window=(%d,%d) zoom=%.2f → viewport=(%d,%d)',
        event.screenX,
        event.screenY,
        window.screenX,
        window.screenY,
        zoomFactor,
        x,
        y
      )
      setContextMenu({
        x,
        y,
        linkUrl: event.linkUrl,
        pageUrl: event.pageUrl,
        selectionText: event.selectionText ?? ''
      })
    })
  }, [browserTab.id])

  useEffect(() => {
    return window.api.browser.onContextMenuDismissed((event) => {
      if (event.browserPageId !== browserTab.id) {
        return
      }
      setContextMenu(null)
    })
  }, [browserTab.id])

  useEffect(() => {
    if (!contextMenu) {
      return
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [contextMenu])

  // Why: ancestor CSS (transform/backdrop-filter) can shift position:fixed even via a body Portal, so measure/correct before paint; also flip on viewport overflow.
  useLayoutEffect(() => {
    const el = contextMenuRef.current
    if (!el || !contextMenu) {
      return
    }
    el.style.left = `${contextMenu.x}px`
    el.style.top = `${contextMenu.y}px`
    const rect = el.getBoundingClientRect()

    // Why: CSS containing blocks can shift "fixed" elements; capture the offset between requested and actual position.
    const offsetX = contextMenu.x - rect.left
    const offsetY = contextMenu.y - rect.top

    let renderX = contextMenu.x
    let renderY = contextMenu.y

    // Flip so the opposite corner aligns with the cursor when the menu overflows.
    if (rect.right > window.innerWidth) {
      renderX = contextMenu.x - rect.width
    }
    if (rect.bottom > window.innerHeight) {
      renderY = contextMenu.y - rect.height
    }

    renderX = Math.max(0, renderX)
    renderY = Math.max(0, renderY)

    el.style.left = `${renderX + offsetX}px`
    el.style.top = `${renderY + offsetY}px`
  }, [contextMenu])

  useEffect(() => {
    return window.api.browser.onDownloadRequested((event) => {
      if (event.browserPageId !== browserTab.id) {
        return
      }
      setDownloadStates((current) => {
        const nextEntry: BrowserDownloadState = {
          browserPageId: event.browserPageId,
          downloadId: event.downloadId,
          origin: event.origin,
          filename: event.filename,
          totalBytes: event.totalBytes,
          mimeType: event.mimeType,
          receivedBytes: 0,
          status: 'downloading',
          savePath: event.savePath,
          error: null,
          progressState: null,
          completedAt: null
        }
        const existingIndex = current.findIndex(
          (download) => download.downloadId === event.downloadId
        )
        if (existingIndex === -1) {
          return [nextEntry, ...current]
        }
        const next = [...current]
        next[existingIndex] = { ...next[existingIndex], ...nextEntry }
        return next
      })
      setResourceNotice(null)
    })
  }, [browserTab.id])

  useEffect(() => {
    return window.api.browser.onDownloadProgress((event: BrowserDownloadProgressEvent) => {
      setDownloadStates((current) =>
        current.map((download) =>
          download.downloadId === event.downloadId
            ? {
                ...download,
                receivedBytes: event.receivedBytes,
                totalBytes: event.totalBytes,
                progressState: event.state
              }
            : download
        )
      )
    })
  }, [])

  useEffect(() => {
    return window.api.browser.onDownloadFinished((event: BrowserDownloadFinishedEvent) => {
      if (event.browserPageId && event.browserPageId !== browserTab.id) {
        return
      }
      const current = downloadStatesRef.current
      if (!current.some((download) => download.downloadId === event.downloadId)) {
        return
      }
      setDownloadStates((current) =>
        current.map((download) =>
          download.downloadId === event.downloadId
            ? {
                ...download,
                status: event.status,
                savePath: event.savePath,
                error: event.error,
                completedAt: Date.now()
              }
            : download
        )
      )
    })
  }, [browserTab.id])

  const focusAddressBarNow = useCallback(() => {
    const input = addressBarInputRef.current
    if (!input) {
      return false
    }
    webviewRef.current?.blur()
    input.focus()
    input.select()
    return document.activeElement === input
  }, [])

  const focusWebviewNow = useCallback(() => {
    const webview = webviewRef.current
    if (!webview) {
      return false
    }
    addressBarInputRef.current?.blur()
    webview.focus()
    return document.activeElement === webview
  }, [])

  useEffect(() => {
    if (!isActive) {
      return
    }
    if (!consumeAddressBarFocusRequest(browserTab.id)) {
      return
    }
    keepAddressBarFocusRef.current = true
    // Why: terminal activation re-grabs focus a frame later; retry a few frames to win the race, but stay one-shot so revisiting the tab doesn't steal focus.
    let cancelled = false
    let frameId = 0
    let attempts = 0
    const focusAddressBar = (): void => {
      if (cancelled) {
        return
      }
      focusAddressBarNow()
      attempts += 1
      if (attempts < 6) {
        frameId = window.requestAnimationFrame(focusAddressBar)
      } else {
        keepAddressBarFocusRef.current = false
      }
    }
    frameId = window.requestAnimationFrame(focusAddressBar)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [browserTab.id, consumeAddressBarFocusRequest, focusAddressBarNow, isActive])

  useEffect(() => {
    if (!isActive) {
      return
    }
    return window.api.ui.onFocusBrowserAddressBar(() => {
      focusAddressBarNow()
    })
  }, [focusAddressBarNow, isActive])

  useEffect(() => {
    if (!isActive) {
      return
    }
    const focusTarget = consumeBrowserFocusRequest(browserTab.id)
    if (!focusTarget) {
      return
    }
    keepAddressBarFocusRef.current = focusTarget === 'address-bar'
    let cancelled = false
    let frameId = 0
    let attempts = 0
    const runFocus = (): void => {
      if (cancelled) {
        return
      }
      const didFocus = focusTarget === 'address-bar' ? focusAddressBarNow() : focusWebviewNow()
      attempts += 1
      if (!didFocus && attempts < 6) {
        frameId = window.requestAnimationFrame(runFocus)
      }
    }
    // Why: focus can be queued before the pane mounts; persisting outside React lets it be claimed on mount instead of racing an event.
    frameId = window.requestAnimationFrame(runFocus)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [browserTab.id, focusAddressBarNow, focusWebviewNow, isActive])

  useEffect(() => {
    if (!isActive) {
      return
    }
    const handleBrowserFocusRequest = (event: Event): void => {
      const detail = (event as CustomEvent<BrowserFocusRequestDetail>).detail
      if (!detail || detail.pageId !== browserTab.id) {
        return
      }
      const focusTarget = consumeBrowserFocusRequest(browserTab.id)
      if (!focusTarget) {
        return
      }
      if (focusTarget === 'address-bar') {
        // Why: palette-triggered address-bar focus must survive the same follow-up load events as the blank-tab path.
        keepAddressBarFocusRef.current = true
        focusAddressBarNow()
        return
      }
      keepAddressBarFocusRef.current = false
      focusWebviewNow()
    }
    // Why: an already-active page never remounts, so listen for the event to consume the durable focus request immediately.
    window.addEventListener(NEXUS_BROWSER_FOCUS_REQUEST_EVENT, handleBrowserFocusRequest)
    return () =>
      window.removeEventListener(NEXUS_BROWSER_FOCUS_REQUEST_EVENT, handleBrowserFocusRequest)
  }, [browserTab.id, focusAddressBarNow, focusWebviewNow, isActive])

  // Cmd/Ctrl+F — find in page (renderer path: focus on browser chrome)
  // Why: unlike bare C/S grab shortcuts, Cmd+F should always open find even from the address bar (matches Chrome/Safari).
  useEffect(() => {
    if (findShortcutScope === 'inactive') {
      return
    }
    const shortcutPlatform = getShortcutPlatform()
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!keybindingMatchesAction('browser.find', e, shortcutPlatform, keybindings)) {
        return
      }
      if (
        findShortcutScope === 'owned-target' &&
        !browserOverlayOwnsShortcutTarget(e.target, workspaceId)
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      setFindOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [findShortcutScope, keybindings, workspaceId])

  // Cmd/Ctrl+F — find in page (IPC path: focus inside webview guest)
  // Why: a focused guest is a separate Chromium process, so main forwards the chord back here.
  useEffect(() => {
    if (!isActive) {
      return
    }
    return window.api.ui.onFindInBrowserPage(
      { browserPageId: browserTab.id, browserWorkspaceId: workspaceId },
      () => {
        setFindOpen(true)
      }
    )
  }, [browserTab.id, isActive, workspaceId])

  // Browser history shortcuts (renderer path: focus on browser chrome)
  // Why: macOS can't deliver Logitech side-buttons to Electron; Logi Options+ remaps them to history chords, handled here when chrome is focused.
  useEffect(() => {
    if (!isActive) {
      return
    }
    const shortcutPlatform = getShortcutPlatform()
    const handleKeyDown = (e: KeyboardEvent): void => {
      const direction = keybindingMatchesAction('browser.back', e, shortcutPlatform, keybindings)
        ? 'back'
        : keybindingMatchesAction('browser.forward', e, shortcutPlatform, keybindings)
          ? 'forward'
          : null
      if (direction === null) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      navigateBrowserHistoryRef.current(direction)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isActive, keybindings])

  // Browser history shortcuts (IPC path: focus inside webview guest)
  // Why: a focused webview is a separate WebContents, so main forwards the chords back here.
  useEffect(() => {
    if (!isActive) {
      return
    }
    return window.api.ui.onBrowserHistoryNavigate((direction) => {
      navigateBrowserHistoryRef.current(direction)
    })
  }, [isActive])

  // Close find bar when tab is deactivated
  useEffect(() => {
    if (!isActive) {
      setFindOpen(false)
    }
  }, [isActive])

  // Cmd/Ctrl+R — reload (renderer path: focus on browser chrome, not in guest)
  // Why: guest shortcut forwarding never fires when focus is on browser chrome, so handle the chord directly here.
  useEffect(() => {
    if (!isActive) {
      return
    }
    const shortcutPlatform = getShortcutPlatform()
    const handleKeyDown = (e: KeyboardEvent): void => {
      const isHardReload = keybindingMatchesAction(
        'browser.hardReload',
        e,
        shortcutPlatform,
        keybindings
      )
      const isReload = keybindingMatchesAction('browser.reload', e, shortcutPlatform, keybindings)
      if (!isHardReload && !isReload) {
        return
      }
      if (isEditableKeyboardTarget(e.target)) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (isHardReload) {
        webviewRef.current?.reloadIgnoringCache()
      } else {
        webviewRef.current?.reload()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isActive, keybindings])

  // Cmd/Ctrl+R — reload (IPC path: focus inside webview guest)
  // Why: a focused guest is a separate Chromium process, so main forwards the chord back here.
  useEffect(() => {
    if (!isActive) {
      return
    }
    return window.api.ui.onReloadBrowserPage(() => {
      webviewRef.current?.reload()
    })
  }, [isActive])

  useEffect(() => {
    if (!isActive) {
      return
    }
    const applyActivePageZoom = (direction: BrowserPageZoomDirection): void => {
      if (!isActiveRef.current) {
        return
      }
      // Why: reset targets 100% like Chromium; the configured default is a new-tab seed, not a reset target.
      const nextLevel = applyBrowserPageZoom(webviewRef.current, direction)
      if (nextLevel !== null) {
        paneZoomLevelRef.current = nextLevel
        rememberExplicitBrowserPageZoomLevel(browserTabIdRef.current, nextLevel)
        setBrowserDefaultZoomLevel(nextLevel)
        showBrowserZoomFeedback(nextLevel)
      }
    }
    const removeGuestListener = window.api.ui.onZoomBrowserPage(applyActivePageZoom)
    const removeLocalListener = addBrowserPageZoomEventListener((detail) => {
      if (detail.browserPageId !== browserTabIdRef.current) {
        return
      }
      applyActivePageZoom(detail.direction)
    })
    return () => {
      removeGuestListener()
      removeLocalListener()
    }
  }, [isActive, setBrowserDefaultZoomLevel, showBrowserZoomFeedback])

  useEffect(() => {
    if (!isActive) {
      return
    }
    return window.api.ui.onHardReloadBrowserPage(() => {
      webviewRef.current?.reloadIgnoringCache()
    })
  }, [isActive])

  useEffect(() => {
    onUpdatePageStateRef.current = onUpdatePageState
    onSetUrlRef.current = onSetUrl
    addBrowserHistoryEntryRef.current = addBrowserHistoryEntry
  }, [onSetUrl, onUpdatePageState, addBrowserHistoryEntry])

  const syncNavigationState = useCallback(
    (webview: Electron.WebviewTag): void => {
      try {
        onUpdatePageStateRef.current(browserTab.id, {
          title: getBrowserDisplayTitle(
            webview.getTitle(),
            webview.getURL() || browserTabUrlRef.current
          ),
          // Why: attach can transiently report isLoading() with no real navigation; syncing it would flash the loading dot on tab switches.
          canGoBack: webview.canGoBack(),
          canGoForward: webview.canGoForward()
        })
      } catch {
        // Why: these getters only exist after the guest fully attaches; ignore the transient failure during attach.
      }
    },
    [browserTab.id]
  )

  const syncBrowserAnnotationViewportBridge = useCallback((): void => {
    const pendingAnnotationPayload = pendingAnnotationPayloadRef.current
    // Why: existing badges render in-guest for smooth scroll; only the pending dialog needs viewport messages.
    const markers = browserAnnotationsRef.current.map((annotation, index) => ({
      id: annotation.id,
      index,
      isFixed: annotation.payload.target.isFixed === true,
      rectPage: annotation.payload.target.rectPage,
      rectViewport: annotation.payload.target.rectViewport
    }))
    const enabled = isActiveRef.current && (pendingAnnotationPayload !== null || markers.length > 0)
    void window.api.browser
      .setAnnotationViewportBridge({
        browserPageId: browserTab.id,
        emitViewport: pendingAnnotationPayload !== null,
        enabled,
        markers,
        token: annotationViewportBridgeTokenRef.current
      })
      .catch(() => {
        // The viewport bridge is visual-only; stale markers beat breaking the pane on a destroyed guest.
      })
  }, [browserTab.id])

  // Why: browserTab.url excluded from deps (changes every navigation → would destroy/recreate the webview); URL logic reads browserTabUrlRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  useEffect(() => {
    let container = ensureBrowserPageViewport(browserTab.id, workspaceId)?.container ?? null
    if (!container) {
      return
    }

    const ensuredWebview = ensureBrowserPageWebview({
      browserTabId: browserTab.id,
      container,
      inputLocked: inputLockedRef.current,
      webviewPartition,
      resolveContainer: () =>
        ensureBrowserPageViewport(browserTab.id, workspaceId)?.container ?? null
    })
    if (!ensuredWebview) {
      return
    }
    container = ensuredWebview.container
    const webview = ensuredWebview.webview
    const needsInitialNavigation = ensuredWebview.created

    if (!ensuredWebview.created) {
      // pointerEvents already applied inside ensureBrowserPageWebview for the reused-webview path.
      syncNavigationState(webview)
      // Why: seed from the store URL (getURL() can throw during attach) so URL sync won't force-navigate an already-correct webview.
      lastKnownWebviewUrlRef.current =
        normalizeBrowserNavigationUrl(browserTabUrlRef.current) ?? null
    }

    webviewRef.current = webview

    // Why: un-park the shell before webview.src is assigned or the guest navigates while hidden and stays blank (the visibility layout effect doesn't re-run on first appear).
    applyBrowserPageViewportLayout(browserTab.id, { paintable: isPaintable, active: isActive })

    // 裁剪: container dragover/drop 文件拖入监听（随 workspace-file-drag 裁剪）。

    const dismissAddressBarSuggestions = (): void => {
      dismissAddressBarSuggestionsRef.current?.()
    }

    let registrationInFlight: { webContentsId: number; promise: Promise<boolean> } | null = null
    const registerGuest = (): Promise<boolean> => {
      const webContentsId = webview.getWebContentsId()
      if (registeredWebContentsIds.get(browserTab.id) === webContentsId) {
        return Promise.resolve(true)
      }
      if (registrationInFlight?.webContentsId === webContentsId) {
        return registrationInFlight.promise
      }
      const promise = window.api.browser
        .registerGuest({
          browserPageId: browserTab.id,
          workspaceId,
          worktreeId,
          sessionProfileId,
          webContentsId
        })
        .then((registered) => {
          if (registered) {
            registeredWebContentsIds.set(browserTab.id, webContentsId)
          }
          return registered
        })
        // Why: normalize IPC rejection to false so the dom-ready fallback can retry attach-policy races.
        .catch(() => false)
        .finally(() => {
          if (registrationInFlight?.promise === promise) {
            registrationInFlight = null
          }
        })
      registrationInFlight = { webContentsId, promise }
      return promise
    }

    const handleDidAttach = (): void => {
      // Why: register at attach since cert failures can precede dom-ready; the dom-ready path stays an idempotent fallback.
      // Electron 39 fix: getWebContentsId() throws until dom-ready on Electron 39 (older Electron
      // let did-attach read the guest id safely). Guard the early registration and let
      // handleDomReady complete it.
      try {
        void registerGuest().finally(() => syncBrowserAnnotationViewportBridge())
      } catch {
        // guest not ready yet — handleDomReady registers as fallback
      }
    }

    const handleDomReady = (): void => {
      const queuedAnnotationViewportBridgeSync =
        registeredWebContentsIds.get(browserTab.id) !== webview.getWebContentsId()
      if (queuedAnnotationViewportBridgeSync) {
        void registerGuest().finally(() => syncBrowserAnnotationViewportBridge())
      }
      syncNavigationState(webview)
      if (keepAddressBarFocusRef.current) {
        focusAddressBarNow()
      }
      if (!queuedAnnotationViewportBridgeSync) {
        syncBrowserAnnotationViewportBridge()
      }
      // Why: Chromium restores per-origin zoom on reload/navigation, so reassert THIS pane's level after
      // every guest load. Uses the pane-local level, not the shared setting, so reloading one tab never
      // adopts a zoom the user applied to a different tab.
      const appliedLevel = setBrowserPageZoomLevel(webview, paneZoomLevelRef.current)
      if (appliedLevel !== null) {
        setBrowserZoomPercent(browserPageZoomLevelToPercent(appliedLevel))
      }
      // Why: CDP viewport overrides are scoped to the debugger session and don't survive cross-origin nav, so reapply (idempotently) on dom-ready.
      const presetId = viewportPresetIdRef.current
      const preset = getBrowserViewportPreset(presetId)
      // Why: reapply even null so CDP matches store state; setDeviceMetricsOverride persists across same-origin nav and would leave a stale viewport.
      void window.api.browser.setViewportOverride({
        browserPageId: browserTab.id,
        override: preset ? browserViewportPresetToOverride(preset) : null
      })
    }

    const handleDidStartLoading = (): void => {
      // Why: a reload replaces the document without changing the URL, invalidating captured element rects like a navigation does.
      clearBrowserPageAnnotationsRef.current(browserTab.id)
      setPendingAnnotationPayload(null)
      setBrowserOverlayViewport({ scrollX: 0, scrollY: 0, version: 0 })
      if (!trackNextLoadingEventRef.current) {
        return
      }
      faviconUrlRef.current = null
      onUpdatePageStateRef.current(browserTab.id, {
        loading: true,
        faviconUrl: null
      })
    }

    const handleDidStopLoading = (): void => {
      const currentUrl = webview.getURL() || webview.src || 'about:blank'
      const browserModelUrl = redactKagiSessionToken(currentUrl)
      const activeLoadFailure = activeLoadFailureRef.current
      if (isChromiumErrorPage(currentUrl)) {
        trackNextLoadingEventRef.current = false
        const synthesizedFailure = {
          code: -1,
          description: translate(
            'auto.components.browser.pane.BrowserPane.e48569ac6d',
            'This site could not be reached.'
          ),
          validatedUrl: redactKagiSessionToken(
            browserTabUrlRef.current || addressBarValueRef.current || 'about:blank'
          )
        }
        activeLoadFailureRef.current = synthesizedFailure
        onUpdatePageStateRef.current(browserTab.id, {
          loading: false,
          loadError: synthesizedFailure
        })
        return
      }
      if (activeLoadFailure) {
        const normalizedAttemptedUrl =
          normalizeBrowserNavigationUrl(activeLoadFailure.validatedUrl) ??
          activeLoadFailure.validatedUrl
        const normalizedCurrentUrl =
          normalizeBrowserNavigationUrl(browserModelUrl) ?? browserModelUrl
        if (normalizedAttemptedUrl === normalizedCurrentUrl) {
          trackNextLoadingEventRef.current = false
          // Why: some failures still emit did-stop-loading on the original URL; keep loadError so the known-failed load isn't cleared to a blank surface.
          onUpdatePageStateRef.current(browserTab.id, {
            loading: false,
            title: getBrowserDisplayTitle(webview.getTitle(), browserModelUrl),
            faviconUrl: faviconUrlRef.current,
            canGoBack: webview.canGoBack(),
            canGoForward: webview.canGoForward(),
            loadError: activeLoadFailure
          })
          return
        }
      }
      trackNextLoadingEventRef.current = false
      activeLoadFailureRef.current = null
      lastKnownWebviewUrlRef.current =
        normalizeBrowserNavigationUrl(browserModelUrl) ?? browserModelUrl
      rememberLiveBrowserUrl(browserTab.id, browserModelUrl)
      // Why: don't overwrite in-progress typing (see the browserTab.url sync effect above).
      if (document.activeElement !== addressBarInputRef.current) {
        setAddressBarValue(toDisplayUrl(browserModelUrl))
      }
      onSetUrlRef.current(browserTab.id, browserModelUrl)
      if (keepAddressBarFocusRef.current && currentUrl === NEXUS_BROWSER_BLANK_URL) {
        focusAddressBarNow()
      } else {
        keepAddressBarFocusRef.current = false
      }
      onUpdatePageStateRef.current(browserTab.id, {
        loading: false,
        title: getBrowserDisplayTitle(webview.getTitle(), browserModelUrl),
        faviconUrl: faviconUrlRef.current,
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward(),
        loadError: null
      })
    }

    const handleDidNavigate = (event: { url?: string; isMainFrame?: boolean }): void => {
      if (event.isMainFrame === false) {
        return
      }
      const currentUrl = event.url ?? webview.getURL() ?? webview.src ?? 'about:blank'
      if (isChromiumErrorPage(currentUrl)) {
        return
      }
      const browserModelUrl = redactKagiSessionToken(currentUrl)
      lastKnownWebviewUrlRef.current =
        normalizeBrowserNavigationUrl(browserModelUrl) ?? browserModelUrl
      rememberLiveBrowserUrl(browserTab.id, browserModelUrl)
      // Why: don't overwrite in-progress typing (see above).
      if (document.activeElement !== addressBarInputRef.current) {
        setAddressBarValue(toDisplayUrl(browserModelUrl))
      }
      onSetUrlRef.current(browserTab.id, browserModelUrl)
      onUpdatePageStateRef.current(browserTab.id, {
        title: webview.getTitle() || browserModelUrl,
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward()
      })
    }

    const handleTitleUpdate = (event: { title?: string }): void => {
      try {
        const currentUrl = webview.getURL() || browserTab.url
        const browserModelUrl = redactKagiSessionToken(currentUrl)
        const title = getBrowserDisplayTitle(event.title, browserModelUrl)
        onUpdatePageStateRef.current(browserTab.id, { title })
        addBrowserHistoryEntryRef.current(browserModelUrl, title)
      } catch {
        // Why: title-updated can fire before dom-ready, making getURL() throw.
      }
    }

    const handleFaviconUpdate = (event: { favicons?: string[] }): void => {
      const faviconUrl = event.favicons?.[0] ?? null
      faviconUrlRef.current =
        faviconUrl &&
        (faviconUrl.startsWith('https://') ||
          faviconUrl.startsWith('http://') ||
          faviconUrl.startsWith('data:image/'))
          ? faviconUrl
          : null
      onUpdatePageStateRef.current(browserTab.id, { faviconUrl: faviconUrlRef.current })
    }

    const handleFailLoad = (event: {
      errorCode?: number
      errorDescription?: string
      validatedURL?: string
      isMainFrame?: boolean
    }): void => {
      if (event.isMainFrame === false) {
        return
      }
      if (event.errorCode === -3) {
        // Why: Chromium reports redirect/cancel races as ERR_ABORTED (-3) even when the replacement navigation succeeds; ignore to avoid a false failure.
        return
      }
      trackNextLoadingEventRef.current = false
      const loadError = buildLoadError(event)
      activeLoadFailureRef.current = loadError
      onUpdatePageStateRef.current(browserTab.id, {
        loading: false,
        loadError
      })
    }

    const handleAnnotationViewportMessage = (event: { message?: string }): void => {
      const message = typeof event.message === 'string' ? event.message : ''
      const prefix = `${BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX}${annotationViewportBridgeTokenRef.current}:`
      if (!message.startsWith(prefix)) {
        return
      }
      try {
        const next = JSON.parse(message.slice(prefix.length)) as {
          scrollX?: unknown
          scrollY?: unknown
        }
        const scrollX =
          typeof next.scrollX === 'number' && Number.isFinite(next.scrollX) ? next.scrollX : 0
        const scrollY =
          typeof next.scrollY === 'number' && Number.isFinite(next.scrollY) ? next.scrollY : 0
        setBrowserOverlayViewport((current) => {
          if (current.scrollX === scrollX && current.scrollY === scrollY) {
            return current.version === 0 ? { ...current, version: 1 } : current
          }
          return { scrollX, scrollY, version: current.version + 1 }
        })
      } catch {
        // Ignore unrelated or malformed guest console output.
      }
    }

    webview.addEventListener('did-attach', handleDidAttach)
    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('focus', dismissAddressBarSuggestions)
    webview.addEventListener('did-start-loading', handleDidStartLoading)
    webview.addEventListener('did-stop-loading', handleDidStopLoading)
    // Why: close find only on full 'did-navigate', not the shared handler, which also fires on SPA in-page hash/pushState changes.
    const handleFindCloseOnNavigate = (): void => {
      setFindOpen(false)
    }

    webview.addEventListener('did-navigate', handleDidNavigate)
    webview.addEventListener('did-navigate', handleFindCloseOnNavigate)
    webview.addEventListener('did-navigate-in-page', handleDidNavigate)
    webview.addEventListener('page-title-updated', handleTitleUpdate)
    webview.addEventListener('page-favicon-updated', handleFaviconUpdate)
    webview.addEventListener('did-fail-load', handleFailLoad)
    webview.addEventListener('console-message', handleAnnotationViewportMessage)

    if (needsInitialNavigation) {
      // Why: set src only after listeners attach so a fast localhost failure isn't missed; only non-blank tabs show the loading indicator.
      const initialUrl =
        normalizeBrowserNavigationUrl(initialBrowserUrlRef.current) ?? NEXUS_BROWSER_BLANK_URL
      trackNextLoadingEventRef.current = initialUrl !== NEXUS_BROWSER_BLANK_URL
      lastKnownWebviewUrlRef.current = initialUrl
      webview.src = initialUrl
    }

    return () => {
      webview.removeEventListener('did-attach', handleDidAttach)
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('focus', dismissAddressBarSuggestions)
      webview.removeEventListener('did-start-loading', handleDidStartLoading)
      webview.removeEventListener('did-stop-loading', handleDidStopLoading)
      webview.removeEventListener('did-navigate', handleDidNavigate)
      webview.removeEventListener('did-navigate', handleFindCloseOnNavigate)
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate)
      webview.removeEventListener('page-title-updated', handleTitleUpdate)
      webview.removeEventListener('page-favicon-updated', handleFaviconUpdate)
      webview.removeEventListener('did-fail-load', handleFailLoad)
      webview.removeEventListener('console-message', handleAnnotationViewportMessage)

      if (webviewRef.current === webview) {
        webviewRef.current = null
      }

      // Why: park the viewport on chrome unmount (worktree switch) to keep the guest alive; destroy only on explicit close.
      moveFocusToRendererBeforeWebviewDetach(webview)
      parkBrowserPageViewport(browserTab.id)
    }
    // Why: wire listeners once per tab identity. browserTab.url is excluded (re-running would detach/reattach and cancel navigations; callbacks use refs).
    // webviewPartition IS included: Electron can't change a webview's partition after creation, so a profile switch must recreate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    browserTab.id,
    workspaceId,
    slotViewportReady,
    webviewPartition,
    worktreeId,
    createBrowserTab,
    focusAddressBarNow,
    focusWebviewNow,
    syncNavigationState,
    syncBrowserAnnotationViewportBridge
  ])

  useLayoutEffect(() => {
    applyBrowserPageViewportLayout(browserTab.id, { paintable: isPaintable, active: isActive })
    const syncChromeInset = (): void => {
      const header = chromeHeaderRef.current
      if (!header) {
        return
      }
      syncBrowserPageChromeInset(browserTab.id, header.offsetHeight)
    }
    syncChromeInset()
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncChromeInset)
    const header = chromeHeaderRef.current
    if (header) {
      resizeObserver?.observe(header)
    }
    return () => {
      resizeObserver?.disconnect()
    }
    // Why: re-run once slotViewportReady flips so visibility and chrome-inset land on a real viewport (first render no-ops).
  }, [browserTab.id, isActive, isPaintable, slotViewportReady])

  useEffect(() => {
    syncBrowserAnnotationViewportBridge()
  }, [
    browserAnnotations.length,
    browserTab.id,
    isActive,
    pendingAnnotationPayload,
    syncBrowserAnnotationViewportBridge
  ])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) {
      return
    }
    const normalizedUrl = normalizeBrowserNavigationUrl(browserTab.url)
    if (!normalizedUrl) {
      return
    }
    // Why: navigation events set both the store URL and this ref; a match means the change came from navigation, so skip to avoid a redirect infinite loop.
    if (lastKnownWebviewUrlRef.current === normalizedUrl) {
      return
    }
    let liveUrl: string | null = null
    try {
      liveUrl = webview.getURL() || null
    } catch {
      // Why: a newly attached guest can reject getURL(); skip so a transient error isn't misread as a mismatch and force-navigated.
      return
    }
    const normalizedLiveUrl = liveUrl ? (normalizeBrowserNavigationUrl(liveUrl) ?? liveUrl) : null
    const declaredSrc = webview.getAttribute('src')
    if (
      normalizedLiveUrl !== normalizedUrl &&
      webview.src !== normalizedUrl &&
      declaredSrc !== normalizedUrl
    ) {
      // Why: browserTab.url changes are Nexus-driven navigations; gate did-start-loading so only real navigations show loading UI.
      trackNextLoadingEventRef.current = normalizedUrl !== NEXUS_BROWSER_BLANK_URL
      lastKnownWebviewUrlRef.current = normalizedUrl
      webview.src = normalizedUrl
      if (normalizedUrl !== NEXUS_BROWSER_BLANK_URL) {
        keepAddressBarFocusRef.current = false
        if (document.activeElement === addressBarInputRef.current) {
          focusWebviewNow()
        }
      }
    }
  }, [browserTab.url, focusWebviewNow])

  useEffect(() => {
    if (!shouldPollChromiumErrorPage({ isActive, loading: browserTab.loading })) {
      return
    }

    const detectChromiumErrorPage = (): void => {
      const webview = webviewRef.current
      if (!webview) {
        return
      }
      try {
        const currentUrl = webview.getURL() || webview.src || ''
        if (!isChromiumErrorPage(currentUrl)) {
          return
        }

        const attemptedUrl = browserTabUrlRef.current || addressBarValueRef.current || 'about:blank'
        onUpdatePageStateRef.current(browserTab.id, {
          loading: false,
          loadError: {
            code: -1,
            description: translate(
              'auto.components.browser.pane.BrowserPane.e48569ac6d',
              'This site could not be reached.'
            ),
            validatedUrl: redactKagiSessionToken(attemptedUrl)
          }
        })
      } catch {
        // Why: ignore transient getURL() errors from a mid-attach guest; this poll is only a fallback.
      }
    }

    // Why: some Electron builds paint chrome-error pages without a did-fail-load event; poll only while the active tab loads as a fallback.
    detectChromiumErrorPage()
    const intervalId = window.setInterval(detectChromiumErrorPage, 250)
    return () => window.clearInterval(intervalId)
  }, [browserTab.id, browserTab.loading, isActive])

  const startGrabIntent = useCallback(
    (nextIntent: GrabIntent): void => {
      recordFeatureInteraction('browser-grab')
      if (nextIntent === 'annotate') {
        recordFeatureInteraction('browser-annotations')
      }
      setGrabIntent(nextIntent)
      recordFeatureInteraction(nextIntent === 'annotate' ? 'browser-annotations' : 'browser-grab')
      if (nextIntent === 'copy') {
        setPendingAnnotationPayload(null)
      } else {
        setBrowserAnnotationTrayOpen(true)
      }
      if (grab.state === 'idle' || grab.state === 'error' || grabIntent === nextIntent) {
        grab.toggle()
      }
    },
    [grab, grabIntent, recordFeatureInteraction]
  )

  // Why: Cmd+C is repurposed as the grab-mode gesture; native text copy in the guest is handled by Chromium and never reaches here.
  useEffect(() => {
    // Why: gate on isActive so only the active pane's global keydown listener toggles grab mode.
    if (!isActive) {
      return
    }
    const shortcutPlatform = getShortcutPlatform()
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Why: don't intercept in editable targets so native Cmd+C still copies in inputs/contentEditable.
      if (isEditableKeyboardTarget(e.target)) {
        return
      }
      // Why: don't start the in-guest picker behind an open markup overlay (matches the disabled toolbar buttons).
      if (
        !markup.isActive &&
        keybindingMatchesAction('browser.grabElement', e, shortcutPlatform, keybindings)
      ) {
        e.preventDefault()
        startGrabIntent('copy')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, keybindings, markup.isActive, startGrabIntent])

  useEffect(() => {
    if (!isActive) {
      return
    }
    const shortcutPlatform = getShortcutPlatform()
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!keybindingMatchesAction('browser.focusAddressBar', e, shortcutPlatform, keybindings)) {
        return
      }
      // Why: capture Cmd/Ctrl+L before the workspace or an embedded editor can claim the same chord.
      e.preventDefault()
      e.stopPropagation()
      focusAddressBarNow()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [focusAddressBarNow, isActive, keybindings])

  // Why: a focused guest gets Cmd/Ctrl+C inside Chromium; main forwards it back only when the page wouldn't use it for native copy.
  useEffect(() => {
    return window.api.browser.onGrabModeToggle((tabId) => {
      if (tabId === browserTab.id) {
        startGrabIntent('copy')
      }
    })
  }, [browserTab.id, startGrabIntent])

  // C / S copy the hovered element without clicking: extract via IPC while armed/awaiting, else use the captured payload.
  const grabPayloadRef = useRef(grab.payload)
  grabPayloadRef.current = grab.payload
  const handleGrabActionShortcut = useCallback(
    (key: 'c' | 's'): void => {
      if (grabIntent === 'annotate') {
        return
      }
      const copyFromPayload = (payload: BrowserGrabPayload): void => {
        if (key === 'c') {
          const text = formatGrabPayloadAsText(payload)
          void writeClipboardText(text).catch(warnClipboardWriteError)
          recordFeatureInteraction('browser-grab')
          showGrabToast('Copied', 'success', payload)
        } else {
          const dataUrl = payload.screenshot?.dataUrl
          if (dataUrl?.startsWith('data:image/png;base64,')) {
            void writeClipboardImage(dataUrl).catch(warnClipboardWriteError)
            recordFeatureInteraction('browser-grab')
            showGrabToast('Screenshotted', 'success', payload)
          } else {
            showGrabToast('No screenshot available', 'error', payload)
          }
        }
      }

      if (grab.state === 'confirming') {
        // Why: right-click (contextMenu) skips the left-click auto-copy, so C must still work here.
        if (grab.contextMenu && key === 'c') {
          const currentPayload = grabPayloadRef.current
          if (currentPayload) {
            copyFromPayload(currentPayload)
          }
          grab.rearm()
        } else if (key === 's') {
          const currentPayload = grabPayloadRef.current
          if (currentPayload) {
            copyFromPayload(currentPayload)
          }
          grab.rearm()
        }
      } else {
        // armed/awaiting — extract hovered element via IPC without clicking
        void (async () => {
          const result = await window.api.browser.extractHoverPayload({
            browserPageId: browserTabIdRef.current
          })
          if (!result.ok) {
            showGrabToast('No element hovered', 'error')
            return
          }
          const payload = result.payload as BrowserGrabPayload

          if (key === 's') {
            try {
              const ssResult = await window.api.browser.captureSelectionScreenshot({
                browserPageId: browserTabIdRef.current,
                rect: payload.target.rectViewport
              })
              if (ssResult.ok) {
                payload.screenshot = ssResult.screenshot as BrowserGrabScreenshot
              }
            } catch {
              // Screenshot failure is non-fatal for the copy flow
            }
          }

          copyFromPayload(payload)
        })()
      }
    },
    [grab, grabIntent, recordFeatureInteraction, showGrabToast]
  )

  useEffect(() => {
    if (grab.state === 'idle' || grab.state === 'error') {
      return
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isEditableKeyboardTarget(e.target)) {
        return
      }
      // Ignore if modifier keys are held — user may be doing Cmd+C etc.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      const key = e.key.toLowerCase()
      if (key !== 'c' && key !== 's') {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      handleGrabActionShortcut(key as 'c' | 's')
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [grab.state, handleGrabActionShortcut])

  useEffect(() => {
    if (grab.state === 'idle' || grab.state === 'error') {
      return
    }
    return window.api.browser.onGrabActionShortcut(({ browserPageId, key }) => {
      if (browserPageId !== browserTab.id) {
        return
      }
      handleGrabActionShortcut(key)
    })
  }, [browserTab.id, grab.state, handleGrabActionShortcut])

  // Why: Radix fires onOpenChange(false) before onSelect, so this flag lets onOpenChange skip the rearm that would clear the payload first.
  const grabMenuActionTakenRef = useRef(false)

  // Handlers for the right-click context dropdown menu
  const handleGrabCopy = useCallback(() => {
    grabMenuActionTakenRef.current = true
    const payload = grabPayloadRef.current
    if (!payload) {
      return
    }
    const text = formatGrabPayloadAsText(payload)
    void writeClipboardText(text).catch(warnClipboardWriteError)
    recordFeatureInteraction('browser-grab')
    showGrabToast('Copied', 'success', payload)
    grab.rearm()
  }, [grab, recordFeatureInteraction, showGrabToast])

  const handleGrabCopyScreenshot = useCallback(() => {
    grabMenuActionTakenRef.current = true
    const payload = grabPayloadRef.current
    if (!payload) {
      return
    }
    const dataUrl = payload.screenshot?.dataUrl
    if (!dataUrl?.startsWith('data:image/png;base64,')) {
      return
    }
    void writeClipboardImage(dataUrl).catch(warnClipboardWriteError)
    recordFeatureInteraction('browser-grab')
    showGrabToast('Screenshotted', 'success', payload)
    grab.rearm()
  }, [grab, recordFeatureInteraction, showGrabToast])

  const handleAddBrowserAnnotation = useCallback(
    (comment: string, intent: BrowserAnnotationIntent): void => {
      const payload = pendingAnnotationPayload
      if (!payload) {
        return
      }
      addBrowserPageAnnotation({
        id: createBrowserAnnotationId(),
        browserPageId: browserTab.id,
        comment,
        intent,
        priority: DEFAULT_BROWSER_ANNOTATION_PRIORITY,
        createdAt: new Date().toISOString(),
        payload: createBrowserAnnotationPayload(payload)
      })
      recordFeatureInteraction('browser-annotations')
      setPendingAnnotationPayload(null)
      setBrowserAnnotationTrayOpen(true)
      recordFeatureInteraction('browser-annotations')
      showGrabToast('Annotation added', 'success', payload)
      grab.rearm()
    },
    [
      addBrowserPageAnnotation,
      browserTab.id,
      grab,
      pendingAnnotationPayload,
      recordFeatureInteraction,
      showGrabToast
    ]
  )

  const handleCancelPendingBrowserAnnotation = useCallback((): void => {
    setPendingAnnotationPayload(null)
    if (grabIntent === 'annotate' && grab.state === 'confirming') {
      grab.rearm()
    }
  }, [grab, grabIntent])

  const handleCopyBrowserAnnotations = useCallback((): void => {
    if (!browserAnnotationsPrompt) {
      return
    }
    void writeClipboardText(browserAnnotationsPrompt).catch(warnClipboardWriteError)
    recordFeatureInteraction('browser-annotations')
    clearTimeout(annotationCopyTimerRef.current)
    setBrowserAnnotationsCopied(true)
    annotationCopyTimerRef.current = setTimeout(() => setBrowserAnnotationsCopied(false), 1400)
  }, [browserAnnotationsPrompt, recordFeatureInteraction])

  // 裁剪: handleAnnotationBannerSendOpenChange / handleAnnotationTraySendOpenChange
  // 及其同步/卸载 effect、handleBrowserAnnotationsSentToAgent（agent-send popover 目标态机制）。

  const handleClearBrowserAnnotations = useCallback((): void => {
    if (browserAnnotationsRef.current.length === 0) {
      return
    }
    clearTimeout(annotationCopyTimerRef.current)
    setBrowserAnnotationsCopied(false)
    recordFeatureInteraction('browser-annotations')
    clearBrowserPageAnnotations(browserTab.id)
  }, [browserTab.id, clearBrowserPageAnnotations, recordFeatureInteraction])

  const handleDeleteBrowserAnnotation = useCallback(
    (annotationId: string): void => {
      deleteBrowserPageAnnotation(browserTab.id, annotationId)
      recordFeatureInteraction('browser-annotations')
    },
    [browserTab.id, deleteBrowserPageAnnotation, recordFeatureInteraction]
  )

  const navigateToUrl = useCallback(
    (url: string): void => {
      const navigateBrowserUrl = (targetUrl: string): void => {
        const browserModelUrl = redactKagiSessionToken(targetUrl)
        setAddressBarValue(toDisplayUrl(browserModelUrl))
        onSetUrlRef.current(browserTab.id, browserModelUrl)
        onUpdatePageStateRef.current(browserTab.id, {
          loading: true,
          loadError: null,
          title: getBrowserDisplayTitle(browserModelUrl, browserModelUrl)
        })
        setResourceNotice(null)

        const webview = webviewRef.current
        if (!webview) {
          return
        }
        trackNextLoadingEventRef.current = targetUrl !== NEXUS_BROWSER_BLANK_URL
        lastKnownWebviewUrlRef.current =
          normalizeBrowserNavigationUrl(browserModelUrl) ?? browserModelUrl
        webview.src = targetUrl
        if (targetUrl !== NEXUS_BROWSER_BLANK_URL) {
          focusWebviewNow()
        }
      }

      // 裁剪: file:// notebook 分支（getConnectionId 远程连接判断 + runtime 文件
      // stat + editor slice openFile）——Nexus 无 worktree 文件体系，file:// URL 直接导航。

      navigateBrowserUrl(url)
    },
    // 裁剪: deps 中的 worktreeId（notebook 分支裁剪后回调体不再引用）。
    [browserTab.id, focusWebviewNow]
  )

  const submitAddressBar = (): void => {
    keepAddressBarFocusRef.current = false
    const searchEngine = useBrowserStore.getState().browserDefaultSearchEngine
    const kagiSessionLink = useBrowserStore.getState().browserKagiSessionLink
    const nextUrl = normalizeBrowserNavigationUrl(addressBarValue, searchEngine, {
      kagiSessionLink
    })
    if (!nextUrl) {
      onUpdatePageStateRef.current(browserTab.id, {
        loadError: {
          code: 0,
          description: translate(
            'auto.components.browser.pane.BrowserPane.87eb75f7d2',
            'Enter a valid http(s) or localhost URL.'
          ),
          // Why: redact a possible Kagi session token before persisting into loadError.
          validatedUrl: redactKagiSessionToken(addressBarValue.trim()) || 'about:blank'
        }
      })
      return
    }
    navigateToUrl(nextUrl)
  }

  // Why: a blank tab reads as 'about:blank' or the resolved data: URL, so match both to keep the "New Browser Tab" overlay visible.
  const isBlankTab = browserTab.url === 'about:blank' || browserTab.url === NEXUS_BROWSER_BLANK_URL
  const externalUrl = getOpenableExternalUrl(webviewRef.current, browserTab.url)
  const currentBrowserUrl = getCurrentBrowserUrl(webviewRef.current, browserTab.url)
  const failedNavigationUrl = browserTab.loadError?.validatedUrl ?? currentBrowserUrl
  const failureExternalUrl = normalizeExternalBrowserUrl(failedNavigationUrl)
  const showFailureOverlay = Boolean(browserTab.loadError) && !isBlankTab
  const visibleDownloads = (() => {
    const active = downloadStates.filter((download) => download.status === 'downloading')
    const recent = downloadStates
      .filter((download) => download.status !== 'downloading')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 3)
    return [...active, ...recent]
  })()
  const browserZoomIndicatorState = getBrowserPageZoomIndicatorState({
    feedbackVisible: browserZoomFeedbackVisible,
    isDefaultZoom: browserZoomPercent === browserDefaultZoomPercent
  })

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) {
      return
    }
    // Why: Electron webviews keep receiving native input under a React overlay unless their own hit testing is disabled.
    webview.style.pointerEvents = inputLocked ? 'none' : 'auto'
  }, [inputLocked])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) {
      return
    }
    // Why: some Electron builds keep painting a hidden guest layer, so drop it from layout (display:none) instead of just hiding it.
    webview.style.display = showFailureOverlay ? 'none' : 'flex'
  }, [showFailureOverlay])

  // 裁剪: handleInternalFileDragOver / handleInternalFileDrop（@/lib/workspace-file-drag +
  // file-preview：文件拖入浏览器开标签，worktree 文件体系增强入口）。

  const dismissBrowserDownload = useCallback((downloadId: string) => {
    setDownloadStates((current) => current.filter((download) => download.downloadId !== downloadId))
  }, [])

  const handleOpenDownloadedFile = useCallback(async (download: BrowserDownloadState) => {
    if (!download.savePath) {
      setResourceNotice(
        translate(
          'auto.components.browser.pane.BrowserPane.9f6f2e8c19',
          'The downloaded file path is unavailable.'
        )
      )
      return
    }
    const opened = await openFilePath(download.savePath)
    if (!opened) {
      setResourceNotice(
        translate(
          'auto.components.browser.pane.BrowserPane.0c79b7634d',
          'Could not open the downloaded file. It may have been moved or deleted.'
        )
      )
    }
  }, [])

  const handleShowDownloadedFile = useCallback(async (download: BrowserDownloadState) => {
    if (!download.savePath) {
      setResourceNotice(
        translate(
          'auto.components.browser.pane.BrowserPane.9f6f2e8c19',
          'The downloaded file path is unavailable.'
        )
      )
      return
    }
    const result = await openInFileManager(download.savePath)
    if (!result.ok) {
      setResourceNotice(
        translate(
          'auto.components.browser.pane.BrowserPane.397d9dc923',
          'Could not show the downloaded file. It may have been moved or deleted.'
        )
      )
    }
  }, [])

  return (
    <div
      className={cn(
        'absolute inset-0 flex min-h-0 flex-1 flex-col',
        isActive
          ? 'pointer-events-none z-10'
          : isPaintable
            ? 'pointer-events-none z-0 opacity-0'
            : 'pointer-events-none hidden'
      )}
      // Why: hidden panes stay paintable (automation/mobile) but must not stay keyboard-focusable.
      inert={!isActive}
      aria-hidden={!isActive}
    >
      {/* IPC-driven context menu in a Portal so position:fixed escapes ancestor transform/backdrop-filter containing blocks. */}
      {contextMenu
        ? createPortal(
            <>
              <div className="fixed inset-0 z-50" onPointerDown={() => setContextMenu(null)} />
              <div
                ref={contextMenuRef}
                role="menu"
                data-testid="browser-context-menu"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                className="fixed z-50 min-w-[13rem] overflow-hidden rounded-[11px] border border-black/14 bg-[rgba(255,255,255,0.82)] p-1 text-black shadow-[0_16px_36px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl dark:border-white/14 dark:bg-[rgba(0,0,0,0.72)] dark:text-white dark:shadow-[0_20px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                {contextMenu.linkUrl ? (
                  <>
                    <button
                      role="menuitem"
                      className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                      onClick={() => {
                        createBrowserTab(worktreeId, contextMenu.linkUrl!, {
                          title: contextMenu.linkUrl!
                        })
                        setContextMenu(null)
                      }}
                    >
                      {translate(
                        'auto.components.browser.pane.BrowserPane.b5b87d6cbb',
                        'Open Link In Nexus Browser'
                      )}
                    </button>
                    <button
                      role="menuitem"
                      className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                      onClick={() => {
                        const targetUrl = normalizeExternalBrowserUrl(contextMenu.linkUrl!)
                        if (targetUrl) {
                          void openUrl(targetUrl)
                        }
                        setContextMenu(null)
                      }}
                    >
                      {translate(
                        'auto.components.browser.pane.BrowserPane.8ce4f6b12e',
                        'Open Link In Default Browser'
                      )}
                    </button>
                    <button
                      role="menuitem"
                      className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                      onClick={() => {
                        void writeClipboardText(contextMenu.linkUrl ?? '').catch(
                          warnClipboardWriteError
                        )
                        setContextMenu(null)
                      }}
                    >
                      {translate(
                        'auto.components.browser.pane.BrowserPane.efb0e8f7f3',
                        'Copy Link Address'
                      )}
                    </button>
                    <div className="my-1 h-px bg-border/70" />
                  </>
                ) : null}
                {contextMenu.selectionText.trim() ? (
                  <>
                    <button
                      role="menuitem"
                      className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                      onClick={() => {
                        void writeClipboardText(contextMenu.selectionText).catch(
                          warnClipboardWriteError
                        )
                        setContextMenu(null)
                      }}
                    >
                      {translate('auto.components.browser.pane.BrowserPane.2a4c4b8e1f', 'Copy')}
                    </button>
                    <div className="my-1 h-px bg-border/70" />
                  </>
                ) : null}
                <button
                  role="menuitem"
                  disabled={!browserTab.canGoBack}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-white/14"
                  onClick={() => {
                    webviewRef.current?.goBack()
                    setContextMenu(null)
                  }}
                >
                  {translate('auto.components.browser.pane.BrowserPane.40edfa75cb', 'Back')}
                </button>
                <button
                  role="menuitem"
                  disabled={!browserTab.canGoForward}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-white/14"
                  onClick={() => {
                    webviewRef.current?.goForward()
                    setContextMenu(null)
                  }}
                >
                  {translate('auto.components.browser.pane.BrowserPane.250a9b3e42', 'Forward')}
                </button>
                <button
                  role="menuitem"
                  className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                  onClick={() => {
                    webviewRef.current?.reload()
                    setContextMenu(null)
                  }}
                >
                  {translate('auto.components.browser.pane.BrowserPane.0e080d820e', 'Reload')}
                </button>
                <div className="my-1 h-px bg-border/70" />
                <button
                  role="menuitem"
                  className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                  onClick={() => {
                    const targetUrl = normalizeExternalBrowserUrl(contextMenu.pageUrl)
                    if (targetUrl) {
                      void openUrl(targetUrl)
                    }
                    setContextMenu(null)
                  }}
                >
                  {translate(
                    'auto.components.browser.pane.BrowserPane.f7ab83f7ed',
                    'Open Page In Default Browser'
                  )}
                </button>
                <button
                  role="menuitem"
                  className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                  onClick={() => {
                    void writeClipboardText(contextMenu.pageUrl).catch(warnClipboardWriteError)
                    setContextMenu(null)
                  }}
                >
                  {translate(
                    'auto.components.browser.pane.BrowserPane.1b179ab561',
                    'Copy Page URL'
                  )}
                </button>
                <div className="my-1 h-px bg-border/70" />
                <button
                  role="menuitem"
                  className="relative flex w-full cursor-default items-center gap-2 rounded-[7px] px-2 py-0.5 text-[12px] leading-5 font-medium outline-none select-none hover:bg-black/8 dark:hover:bg-white/14"
                  onClick={() => {
                    void window.api.browser.openDevTools({ browserPageId: browserTab.id })
                    setContextMenu(null)
                  }}
                >
                  {translate('auto.components.browser.pane.BrowserPane.a8f37f70c3', 'Inspect Page')}
                </button>
              </div>
            </>,
            document.body
          )
        : null}

      <div ref={chromeHeaderRef} className="pointer-events-auto shrink-0">
        {/* 工具栏横向滚动：右侧 panel 可窄至 240px（工具栏最小内容宽约 340px），
            窄时允许横向滚动避免控件被裁切。 */}
        <div
          className="scrollbar-sleek relative z-10 flex items-center gap-2 overflow-x-auto border-b border-border/70 bg-background/95 px-3 py-1.5"
          data-contextual-tour-target="browser-toolbar"
        >
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => webviewRef.current?.goBack()}
            disabled={!browserTab.canGoBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => webviewRef.current?.goForward()}
            disabled={!browserTab.canGoForward}
          >
            <ArrowRight className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              const webview = webviewRef.current
              if (!webview) {
                return
              }
              if (browserTab.loading) {
                webview.stop()
              } else if (browserTab.loadError) {
                retryBrowserTabLoad(webview, browserTab, onUpdatePageStateRef.current)
              } else {
                webview.reload()
              }
            }}
          >
            {browserTab.loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>

          <BrowserAddressBar
            value={addressBarValue}
            onChange={setAddressBarValue}
            onSubmit={submitAddressBar}
            onNavigate={navigateToUrl}
            inputRef={addressBarInputRef}
            dismissSuggestionsRef={dismissAddressBarSuggestionsRef}
          />

          {/* 裁剪: BrowserImportHintButton —— 导入入口移入三点菜单（见 BrowserToolbarMenu）。 */}

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="icon"
                  variant={grab.state !== 'idle' && grabIntent === 'copy' ? 'default' : 'ghost'}
                  className={cn(
                    'h-8 w-8',
                    grab.state !== 'idle' &&
                      grabIntent === 'copy' &&
                      'bg-foreground/80 text-background hover:bg-foreground/90'
                  )}
                  onClick={() => startGrabIntent('copy')}
                  disabled={isBlankTab || markup.isActive}
                  aria-label={translate(
                    'auto.components.browser.pane.BrowserPane.fdfc7fe0ef',
                    'Grab page element'
                  )}
                  data-contextual-tour-target="browser-grab-control"
                >
                  <Crosshair className="size-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {translate(
                'auto.components.browser.pane.BrowserPane.acbe79fd01',
                'Grab page element ({{value0}})',
                { value0: grabElementShortcut }
              )}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              {/* Why: disabled <button> drops hover events, so wrap in a span so the tooltip trigger still fires. */}
              <span className="inline-flex">
                <Button
                  size="icon"
                  variant={grab.state !== 'idle' && grabIntent === 'annotate' ? 'default' : 'ghost'}
                  className={cn(
                    'relative h-8 w-8',
                    grab.state !== 'idle' &&
                      grabIntent === 'annotate' &&
                      'bg-foreground/80 text-background hover:bg-foreground/90'
                  )}
                  onClick={() => startGrabIntent('annotate')}
                  disabled={isBlankTab || markup.isActive}
                  aria-label={translate(
                    'auto.components.browser.pane.BrowserPane.fc9be38f6f',
                    'Annotate page element'
                  )}
                  data-contextual-tour-target="browser-annotation-control"
                >
                  <MessageSquarePlus className="size-4" />
                  {browserAnnotations.length > 0 ? (
                    <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                      {browserAnnotations.length}
                    </span>
                  ) : null}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {translate(
                'auto.components.browser.pane.BrowserPane.fc9be38f6f',
                'Annotate page element'
              )}
            </TooltipContent>
          </Tooltip>

          <MarkupDrawButton
            onClick={() => (markup.isActive ? markup.cancel() : void markup.start())}
            disabled={isBlankTab || grab.state !== 'idle'}
            active={markup.isActive}
            surfaceActive={isActive}
          />

          {/* 裁剪: 工具栏独立的「开发者工具」「在默认浏览器中打开」按钮——窄 panel 下
              展示不全，入口移入三点菜单（见 BrowserToolbarMenuDropdown）。 */}

          <BrowserToolbarMenu
            currentProfileId={sessionProfileId}
            workspaceId={workspaceId}
            browserPageId={browserTab.id}
            viewportPresetId={browserTab.viewportPresetId ?? null}
            externalUrl={externalUrl}
            onDestroyWebview={() => destroyPersistentWebview(browserTab.id)}
            isActive={isActive}
          />
        </div>
        {visibleDownloads.length > 0 ? (
          <div className="border-b border-border/60 bg-background px-3 py-1.5">
            <div className="scrollbar-sleek flex max-h-36 flex-col gap-1 overflow-y-auto">
              {visibleDownloads.map((download) => {
                const progressLabel = formatBrowserDownloadProgress(download)
                const statusLabel =
                  download.status === 'downloading'
                    ? download.progressState === 'interrupted'
                      ? translate(
                          'auto.components.browser.pane.BrowserPane.39c04fed61',
                          'Downloading paused'
                        )
                      : (progressLabel ??
                        translate(
                          'auto.components.browser.pane.BrowserPane.759f32af29',
                          'Downloading'
                        ))
                    : download.status === 'completed'
                      ? translate(
                          'auto.components.browser.pane.BrowserPane.5c3d530a68',
                          'Downloaded'
                        )
                      : download.status === 'canceled'
                        ? translate(
                            'auto.components.browser.pane.BrowserPane.4bb7424d6b',
                            'Canceled'
                          )
                        : (download.error ??
                          translate(
                            'auto.components.browser.pane.BrowserPane.6e776f9ef9',
                            'Download failed'
                          ))
                return (
                  <div
                    key={download.downloadId}
                    className="flex min-h-8 items-center gap-2 text-xs text-foreground"
                  >
                    {download.status === 'completed' ? (
                      <CircleCheck className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : download.status === 'failed' ? (
                      <OctagonX className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Download className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{download.filename}</div>
                      <div className="truncate text-muted-foreground">
                        {download.status === 'downloading'
                          ? translate(
                              'auto.components.browser.pane.BrowserPane.4300f38145',
                              'Downloading from {{value0}}{{value1}}',
                              {
                                value0: download.origin,
                                value1: statusLabel ? ` • ${statusLabel}` : ''
                              }
                            )
                          : statusLabel}
                      </div>
                    </div>
                    {download.status === 'downloading' ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-6 shrink-0"
                        onClick={() => {
                          void window.api.browser.cancelDownload({
                            downloadId: download.downloadId
                          })
                        }}
                      >
                        {translate('auto.components.browser.pane.BrowserPane.fa6ea61de3', 'Cancel')}
                      </Button>
                    ) : download.status === 'completed' ? (
                      <>
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-6 shrink-0 gap-1"
                          onClick={() => {
                            void handleOpenDownloadedFile(download)
                          }}
                        >
                          <ExternalLink className="size-3" />
                          {translate('auto.components.browser.pane.BrowserPane.756bfc25c9', 'Open')}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="h-6 shrink-0 gap-1"
                          onClick={() => {
                            void handleShowDownloadedFile(download)
                          }}
                        >
                          <FolderOpen className="size-3" />
                          {translate('auto.components.browser.pane.BrowserPane.09a9489aa5', 'Show')}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          onClick={() => dismissBrowserDownload(download.downloadId)}
                          aria-label={translate(
                            'auto.components.browser.pane.BrowserPane.2fdca7df09',
                            'Dismiss'
                          )}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => dismissBrowserDownload(download.downloadId)}
                        aria-label={translate(
                          'auto.components.browser.pane.BrowserPane.2fdca7df09',
                          'Dismiss'
                        )}
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
        {resourceNotice ? (
          <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground">
            <span>{resourceNotice}</span>
            <button
              type="button"
              onClick={() => setResourceNotice(null)}
              className="shrink-0 text-muted-foreground/60 hover:text-foreground"
              aria-label={translate(
                'auto.components.browser.pane.BrowserPane.2fdca7df09',
                'Dismiss'
              )}
            >
              ✕
            </button>
          </div>
        ) : null}
        {grab.state !== 'idle' ? (
          <div
            className={cn(
              'flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs text-foreground/90',
              grab.state === 'error' ? 'bg-destructive/10' : 'bg-accent'
            )}
          >
            <Crosshair
              className={cn(
                'size-3 shrink-0',
                grab.state === 'error' ? 'text-destructive' : 'text-muted-foreground'
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              {grab.state === 'error'
                ? translate(
                    'auto.components.browser.pane.BrowserPane.4328a0a062',
                    'Grab failed: {{value0}}',
                    { value0: grab.error ?? 'Unknown error' }
                  )
                : grabIntent === 'annotate'
                  ? pendingAnnotationPayload
                    ? translate(
                        'auto.components.browser.pane.BrowserPane.b733a91bd9',
                        'Add feedback for the selected element.'
                      )
                    : browserAnnotations.length === 1
                      ? translate(
                          'auto.components.browser.pane.BrowserPane.074f0ed10b',
                          '{{value0}} annotation ready. Select another element or copy all feedback.',
                          { value0: browserAnnotations.length }
                        )
                      : browserAnnotations.length > 0
                        ? translate(
                            'auto.components.browser.pane.BrowserPane.a2164a6e5a',
                            '{{value0}} annotations ready. Select another element or copy all feedback.',
                            { value0: browserAnnotations.length }
                          )
                        : translate(
                            'auto.components.browser.pane.BrowserPane.777b5bc4ec',
                            'Click an element to add feedback for the agent.'
                          )
                  : grab.state === 'confirming'
                    ? translate(
                        'auto.components.browser.pane.BrowserPane.e852e20cea',
                        'Copied — press S to screenshot, or select another element'
                      )
                    : translate(
                        'auto.components.browser.pane.BrowserPane.168350ae6a',
                        'Click or hover an element, then press C to copy or S to screenshot.'
                      )}
            </span>
            {grabIntent === 'annotate' && browserAnnotations.length > 0 ? (
              <>
                {/* 裁剪: 标注「Send」（发送到 agent/review）DropdownMenu——
                    BrowserAnnotationSendMenuContent 依赖链随 agent 体系裁剪。 */}
                <Button
                  size="xs"
                  variant="outline"
                  className="h-6 gap-1.5"
                  onClick={handleCopyBrowserAnnotations}
                >
                  {browserAnnotationsCopied ? (
                    <CircleCheck className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  {browserAnnotationsCopied
                    ? translate('auto.components.browser.pane.BrowserPane.6f4ab3592b', 'Copied')
                    : translate('auto.components.browser.pane.BrowserPane.499b31b84e', 'Copy All')}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={handleClearBrowserAnnotations}
                      aria-label={translate(
                        'auto.components.browser.pane.BrowserPane.734e4343ec',
                        'Clear browser annotations'
                      )}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {translate(
                      'auto.components.browser.pane.BrowserPane.11c5084aa2',
                      'Clear annotations'
                    )}
                  </TooltipContent>
                </Tooltip>
              </>
            ) : null}
            <button
              className="ml-auto shrink-0 rounded px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setPendingAnnotationPayload(null)
                grab.cancel()
              }}
            >
              {translate('auto.components.browser.pane.BrowserPane.fa6ea61de3', 'Cancel')}
            </button>
          </div>
        ) : null}
      </div>
      {pageViewport?.container
        ? createPortal(
            <>
              {markup.isActive && markup.baseImage ? (
                <MarkupOverlay
                  baseImage={markup.baseImage}
                  busy={markup.state === 'composing'}
                  onComplete={(input) => void markup.complete(input)}
                  onCancel={markup.cancel}
                />
              ) : null}
              <div
                role="status"
                aria-live="polite"
                aria-hidden={browserZoomIndicatorState.ariaHidden}
                className={cn(
                  'pointer-events-none absolute top-3 right-3 z-30 rounded-md border border-border bg-popover/95 px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-xs transition-opacity duration-300 ease-out',
                  browserZoomIndicatorState.opacityClassName
                )}
              >
                {browserZoomPercent}%
              </div>
              <BrowserFind
                isOpen={findOpen}
                onClose={() => setFindOpen(false)}
                webviewRef={webviewRef}
              />
              {showFailureOverlay && browserTab.loadError ? (
                <BrowserLoadFailureOverlay
                  loadError={browserTab.loadError}
                  externalUrl={failureExternalUrl}
                  currentUrl={toDisplayUrl(failedNavigationUrl)}
                  httpsRecoveryUrl={toHttpsRecoveryUrl(failedNavigationUrl)}
                  onRetry={() => {
                    const webview = webviewRef.current
                    if (!webview) {
                      return
                    }
                    onUpdatePageStateRef.current(browserTab.id, { loading: true })
                    retryBrowserTabLoad(webview, browserTab, onUpdatePageStateRef.current)
                  }}
                  onTryHttps={navigateToUrl}
                  onCopy={(url) => {
                    void writeClipboardText(url).catch(warnClipboardWriteError)
                    setResourceNotice(
                      translate(
                        'browser.loadFailure.addressCopied',
                        'Copied the current page address.'
                      )
                    )
                  }}
                  onOpenExternal={(url) => void openUrl(url)}
                  certificateFailure={certificateFailure}
                  expectedBrowserPageId={browserTab.id}
                  onProceedCertificate={(challengeId) =>
                    window.api.browser.proceedCertificate({
                      browserPageId: browserTab.id,
                      challengeId
                    })
                  }
                />
              ) : null}
              {isBlankTab ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_58%)] px-6">
                  <div className="flex flex-col items-center px-8 py-8 text-center opacity-70">
                    <div className="mb-4 rounded-full border border-border/70 bg-muted/30 p-3">
                      <Globe className="size-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-foreground/85">
                        {translate(
                          'auto.components.browser.pane.BrowserPane.366bf5d62c',
                          'New Tab'
                        )}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {translate(
                          'auto.components.browser.pane.BrowserPane.f796c774a4',
                          'Type a URL above to start browsing.'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              {pendingAnnotationPayload ? (
                <PendingBrowserAnnotationCard
                  payload={pendingAnnotationPayload}
                  anchor={getBrowserOverlayAnchor(
                    pendingAnnotationPayload,
                    containerRef.current,
                    webviewRef.current,
                    browserOverlayViewport
                  )}
                  portalContainer={containerRef.current}
                  onAdd={handleAddBrowserAnnotation}
                  onCancel={handleCancelPendingBrowserAnnotation}
                />
              ) : null}
              {browserAnnotations.length > 0 && browserAnnotationTrayOpen ? (
                <div className="absolute right-3 bottom-3 z-30 flex max-h-[45%] w-[min(20rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <MessageSquarePlus className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1 text-sm font-medium">
                      {browserAnnotations.length === 1
                        ? translate(
                            'auto.components.browser.pane.BrowserPane.ea6af700da',
                            '{{value0}} annotation',
                            { value0: browserAnnotations.length }
                          )
                        : translate(
                            'auto.components.browser.pane.BrowserPane.c13693fe27',
                            '{{value0}} annotations',
                            { value0: browserAnnotations.length }
                          )}
                    </div>
                    {/* 裁剪: 标注「Send」（发送到 agent/review）DropdownMenu——
                        BrowserAnnotationSendMenuContent 依赖链随 agent 体系裁剪。 */}
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1.5"
                      onClick={handleCopyBrowserAnnotations}
                    >
                      {browserAnnotationsCopied ? (
                        <CircleCheck className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {browserAnnotationsCopied
                        ? translate('auto.components.browser.pane.BrowserPane.6f4ab3592b', 'Copied')
                        : translate('auto.components.browser.pane.BrowserPane.d51ef37351', 'Copy')}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={handleClearBrowserAnnotations}
                          aria-label={translate(
                            'auto.components.browser.pane.BrowserPane.734e4343ec',
                            'Clear browser annotations'
                          )}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={6}>
                        {translate(
                          'auto.components.browser.pane.BrowserPane.11c5084aa2',
                          'Clear annotations'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-1.5">
                    {browserAnnotations.map((annotation, index) => (
                      <div
                        key={annotation.id}
                        className="group flex gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent focus-within:bg-accent"
                      >
                        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {annotation.payload.target.accessibility.accessibleName ||
                              annotation.payload.target.textSnippet ||
                              annotation.payload.target.tagName}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                            {annotation.comment}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            <span>{annotation.intent}</span>
                          </div>
                        </div>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="can-hover:opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
                          onClick={() => handleDeleteBrowserAnnotation(annotation.id)}
                          aria-label={translate(
                            'auto.components.browser.pane.BrowserPane.f2d0c22d67',
                            'Delete annotation {{value0}}',
                            { value0: index + 1 }
                          )}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {/* Right-click context dropdown, positioned at the grabbed element's center. */}
              <DropdownMenu
                open={grab.state === 'confirming' && grab.contextMenu && grabIntent === 'copy'}
                onOpenChange={(open) => {
                  if (!open && grab.state === 'confirming') {
                    // Why: skip rearm if a menu action already handled it — see grabMenuActionTakenRef.
                    if (grabMenuActionTakenRef.current) {
                      grabMenuActionTakenRef.current = false
                      return
                    }
                    grab.rearm()
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    aria-hidden
                    tabIndex={-1}
                    className="pointer-events-none absolute size-px opacity-0"
                    style={(() => {
                      if (!grab.payload) {
                        return { left: 0, top: 0 }
                      }
                      const rect = grab.payload.target.rectViewport
                      const webview = webviewRef.current
                      const webviewRect = webview?.getBoundingClientRect()
                      const cRect = containerRef.current?.getBoundingClientRect()
                      const offsetX = (webviewRect?.left ?? 0) - (cRect?.left ?? 0)
                      const offsetY = (webviewRect?.top ?? 0) - (cRect?.top ?? 0)
                      return {
                        left: offsetX + rect.x + rect.width / 2,
                        top: offsetY + rect.y + rect.height / 2
                      }
                    })()}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4}>
                  <DropdownMenuItem onSelect={handleGrabCopy}>
                    <Copy className="size-3.5" />
                    {translate(
                      'auto.components.browser.pane.BrowserPane.c2ef0359b9',
                      'Copy Contents'
                    )}
                    <DropdownMenuShortcut>C</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  {grab.payload?.screenshot?.dataUrl?.startsWith('data:image/png;base64,') ? (
                    <DropdownMenuItem onSelect={handleGrabCopyScreenshot}>
                      <Image className="size-3.5" />
                      {translate(
                        'auto.components.browser.pane.BrowserPane.1ded0d3168',
                        'Copy Screenshot'
                      )}
                      <DropdownMenuShortcut>S</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      grabMenuActionTakenRef.current = true
                      grab.cancel()
                    }}
                  >
                    {translate('auto.components.browser.pane.BrowserPane.fa6ea61de3', 'Cancel')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Inline toast bubble; flips above the element when near the viewport bottom so it doesn't occlude it. */}
              {grabToast ? (
                <div
                  className="absolute z-30 flex items-center animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    left: grabToast.x,
                    top: grabToast.y,
                    transform: grabToast.below
                      ? 'translate(-50%, 8px)'
                      : 'translate(-50%, -100%) translateY(-8px)',
                    flexDirection: grabToast.below ? 'column' : 'column-reverse'
                  }}
                >
                  {/* Caret pointing toward the element */}
                  <div
                    className="h-2 w-4 shrink-0"
                    style={{
                      clipPath: grabToast.below
                        ? 'polygon(50% 0%, 0% 100%, 100% 100%)'
                        : 'polygon(0% 0%, 100% 0%, 50% 100%)',
                      background: 'white'
                    }}
                  />
                  <div
                    className={`flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 shadow-lg ${
                      grabToast.type === 'success'
                        ? 'bg-white text-gray-900'
                        : 'bg-white text-red-600'
                    }`}
                  >
                    {grabToast.type === 'success' ? (
                      <CircleCheck className="size-4 fill-blue-600 text-white" />
                    ) : (
                      <OctagonX className="size-4 text-red-500" />
                    )}
                    <span className="text-sm font-semibold">{grabToast.message}</span>
                    {grabToast.payload?.screenshot?.dataUrl?.startsWith(
                      'data:image/png;base64,'
                    ) ? (
                      <DropdownMenu
                        onOpenChange={(open) => {
                          if (open) {
                            clearTimeout(grabToastTimerRef.current)
                          } else {
                            grabToastTimerRef.current = setTimeout(() => dismissGrabToast(), 1200)
                          }
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <button className="flex size-6 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/10 hover:text-gray-700">
                            <span className="text-sm font-bold leading-none">···</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={4}>
                          <DropdownMenuItem
                            onSelect={() => {
                              const dataUrl = grabToast.payload?.screenshot?.dataUrl
                              if (dataUrl?.startsWith('data:image/png;base64,')) {
                                void writeClipboardImage(dataUrl).catch(warnClipboardWriteError)
                                setGrabToast((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        message: translate(
                                          'auto.components.browser.pane.BrowserPane.f30d2d35a7',
                                          'Screenshotted'
                                        )
                                      }
                                    : null
                                )
                              }
                            }}
                          >
                            <Image className="size-3.5" />
                            {translate(
                              'auto.components.browser.pane.BrowserPane.1ded0d3168',
                              'Copy Screenshot'
                            )}
                            <DropdownMenuShortcut>S</DropdownMenuShortcut>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>,
            pageViewport.container
          )
        : null}
    </div>
  )
}
