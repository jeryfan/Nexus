import type {
  CommandDefinition,
  CommandShortcutPreferenceKey,
  KeybindingRule,
  RegisteredCommandDefinition,
  RegisteredKeybindingRule
} from '@shared/types/command'

import { parseContextExpr } from './contextExpr'

const defineCommand = <const T extends CommandDefinition>(definition: T): T => definition

export const COMMAND_DEFINITIONS = [
  defineCommand({
    id: 'app.fullscreen.exit',
    title: '退出全屏',
    categoryKey: 'settings.shortcuts.general',
    scope: 'renderer',
    keybinding: { defaultBinding: ['Escape'], editable: false }
  }),
  defineCommand({
    id: 'app.settings.open',
    title: '打开设置',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: { defaultBinding: ['CommandOrControl', ','], editable: false }
  }),
  defineCommand({
    id: 'app.window.show',
    title: '显示 / 隐藏应用',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: { defaultBinding: [], global: true }
  }),
  defineCommand({
    id: 'app.zoom.in',
    title: '放大界面',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: {
      defaultBinding: ['CommandOrControl', '='],
      additionalBindings: [['CommandOrControl', 'numadd']],
      editable: false
    }
  }),
  defineCommand({
    id: 'app.zoom.out',
    title: '缩小界面',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: {
      defaultBinding: ['CommandOrControl', '-'],
      additionalBindings: [['CommandOrControl', 'numsub']],
      editable: false
    }
  }),
  defineCommand({
    id: 'app.zoom.reset',
    title: '重置缩放',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: { defaultBinding: ['CommandOrControl', '0'], editable: false }
  })
] as const satisfies readonly CommandDefinition[]

export type CommandId = (typeof COMMAND_DEFINITIONS)[number]['id']

export const commandShortcutPreferenceKey = (
  command: CommandId
): CommandShortcutPreferenceKey<CommandId> =>
  `shortcut.${command}` as CommandShortcutPreferenceKey<CommandId>

export const KEYBINDING_RULES = COMMAND_DEFINITIONS.map((definition) => ({
  command: definition.id,
  scope: definition.scope,
  ...definition.keybinding
})) satisfies readonly KeybindingRule<CommandId>[]

const registerCommand = (
  definition: CommandDefinition<CommandId>
): RegisteredCommandDefinition<CommandId> => ({
  id: definition.id,
  title: definition.title,
  categoryKey: definition.categoryKey,
  scope: definition.scope,
  iconKey: definition.iconKey
})

const registerKeybinding = (
  rule: KeybindingRule<CommandId>
): RegisteredKeybindingRule<CommandId> => ({
  ...rule,
  preferenceKey: commandShortcutPreferenceKey(rule.command),
  when: rule.when ? parseContextExpr(rule.when) : undefined,
  whenSource: rule.when
})

export const REGISTERED_COMMANDS = COMMAND_DEFINITIONS.map(registerCommand)
export const REGISTERED_KEYBINDINGS = KEYBINDING_RULES.map(registerKeybinding)

const commandMap = new Map<CommandId, RegisteredCommandDefinition<CommandId>>(
  REGISTERED_COMMANDS.map((definition) => [definition.id, definition])
)
const keybindingMap = new Map<CommandId, RegisteredKeybindingRule<CommandId>>(
  REGISTERED_KEYBINDINGS.map((rule) => [rule.command, rule])
)

export const findCommandDefinition = (
  id: CommandId
): RegisteredCommandDefinition<CommandId> | undefined => commandMap.get(id)

export const findKeybindingRule = (
  id: CommandId
): RegisteredKeybindingRule<CommandId> | undefined => keybindingMap.get(id)
