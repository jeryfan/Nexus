// 裁剪: use* hooks 从全局 store 读取用户自定义键位覆盖
// （state.keybindings，默认 {}）；Nexus 尚无用户可配置键位，故直接使用默认绑定，
// 等价于未配置覆盖时的行为。
import {
  formatKeybinding,
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  isDoubleTapBinding,
  type KeybindingActionId,
  type KeybindingOverrides
} from '@shared/browser/keybindings'
import { getShortcutPlatform } from '../lib/shortcut-platform'

export { getShortcutPlatform }

export type ShortcutKeyComboDetails = {
  keys: string[]
  doubleTap: boolean
}

export function formatShortcutLabel(
  actionId: KeybindingActionId,
  overrides?: KeybindingOverrides
): string {
  const platform = getShortcutPlatform()
  return formatKeybindingList(
    getEffectiveKeybindingsForAction(actionId, platform, overrides),
    platform
  )
}

export function formatPrimaryShortcutLabel(
  actionId: KeybindingActionId,
  overrides?: KeybindingOverrides
): string {
  const platform = getShortcutPlatform()
  const [binding] = getEffectiveKeybindingsForAction(actionId, platform, overrides)
  return binding ? formatKeybindingList([binding], platform) : 'Unassigned'
}

export function useShortcutLabel(actionId: KeybindingActionId): string {
  return formatShortcutLabel(actionId)
}

// Why: returns null for unbound actions instead of the display sentinel
// 'Unassigned', so callers decide whether to render a hint without coupling
// UI logic to formatter copy (which may change or become localized).
export function formatOptionalShortcutLabel(
  actionId: KeybindingActionId,
  overrides?: KeybindingOverrides
): string | null {
  const platform = getShortcutPlatform()
  const bindings = getEffectiveKeybindingsForAction(actionId, platform, overrides)
  if (bindings.length === 0) {
    return null
  }
  return formatKeybindingList(bindings, platform)
}

export function useOptionalShortcutLabel(actionId: KeybindingActionId): string | null {
  return formatOptionalShortcutLabel(actionId)
}

export function formatShortcutKeyComboDetails(
  actionId: KeybindingActionId,
  overrides?: KeybindingOverrides
): ShortcutKeyComboDetails[] {
  const platform = getShortcutPlatform()
  return getEffectiveKeybindingsForAction(actionId, platform, overrides).map((binding) => ({
    keys: formatKeybinding(binding, platform),
    doubleTap: isDoubleTapBinding(binding)
  }))
}

export function useShortcutKeyComboDetails(
  actionId: KeybindingActionId
): ShortcutKeyComboDetails[] {
  return formatShortcutKeyComboDetails(actionId)
}

export function useShortcutKeyDetails(actionId: KeybindingActionId): ShortcutKeyComboDetails {
  return useShortcutKeyComboDetails(actionId)[0] ?? { keys: [], doubleTap: false }
}
