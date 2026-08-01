export interface IconDisplayConfig {
  scale: number
  borderRadius?: number
}

export type IconDisplayContext = 'mini-app' | 'provider-list'

const miniAppContainedIcon: IconDisplayConfig = { scale: 5 / 7, borderRadius: 10 }
const providerListContainedIcon: IconDisplayConfig = { scale: 5 / 7, borderRadius: 5 }
const defaultIcon: IconDisplayConfig = { scale: 1.2 }

const ICON_DISPLAY_CONFIG: Readonly<
  Record<IconDisplayContext, Readonly<Record<string, IconDisplayConfig>>>
> = {
  'mini-app': {
    minimax: miniAppContainedIcon,
    anthropic: miniAppContainedIcon,
    claude: miniAppContainedIcon
  },
  'provider-list': {
    anthropic: providerListContainedIcon
  }
}

export function getIconDisplayConfig(
  context: IconDisplayContext,
  iconId: string | undefined
): IconDisplayConfig | undefined {
  if (!iconId) return undefined
  return ICON_DISPLAY_CONFIG[context][iconId.toLowerCase()] ?? defaultIcon
}
