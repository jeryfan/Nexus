import * as PreferenceTypes from '@shared/data/preference/preferenceTypes'

export interface PreferenceSchemas {
  default: {
    'app.proxy.bypass_rules': string
    'app.proxy.mode': PreferenceTypes.ProxyMode
    'app.proxy.url': string
    'app.spell_check.enabled': boolean
    'app.spell_check.languages': string[]
    'app.tray.enabled': boolean
    'app.tray.on_close': boolean
    'app.tray.on_launch': boolean
    'app.use_system_title_bar': boolean
    'app.user.id': string
    'app.user.name': string
    'app.zoom_factor': number
    'menu.presentation_mode': PreferenceTypes.MenuPresentationMode
    'shortcut.app.fullscreen.exit': PreferenceTypes.PreferenceShortcutType
    'shortcut.app.settings.open': PreferenceTypes.PreferenceShortcutType
    'shortcut.app.window.show': PreferenceTypes.PreferenceShortcutType
    'shortcut.app.zoom.in': PreferenceTypes.PreferenceShortcutType
    'shortcut.app.zoom.out': PreferenceTypes.PreferenceShortcutType
    'shortcut.app.zoom.reset': PreferenceTypes.PreferenceShortcutType
    'ui.theme_mode': PreferenceTypes.ThemeMode
    'ui.theme_user.code_font_family': string
    'ui.theme_user.color_primary': string
    'ui.theme_user.font_family': string
  }
}

export const DefaultPreferences: PreferenceSchemas = {
  default: {
    'app.proxy.bypass_rules': '',
    'app.proxy.mode': 'system',
    'app.proxy.url': '',
    'app.spell_check.enabled': false,
    'app.spell_check.languages': [],
    'app.tray.enabled': true,
    'app.tray.on_close': true,
    'app.tray.on_launch': false,
    'app.use_system_title_bar': false,
    'app.user.id': '',
    'app.user.name': '',
    'app.zoom_factor': 1,
    'menu.presentation_mode': 'nexus',
    'shortcut.app.fullscreen.exit': { binding: ['Escape'], enabled: true },
    'shortcut.app.settings.open': { binding: ['CommandOrControl', ','], enabled: true },
    'shortcut.app.window.show': { binding: [], enabled: false },
    'shortcut.app.zoom.in': { binding: ['CommandOrControl', '='], enabled: true },
    'shortcut.app.zoom.out': { binding: ['CommandOrControl', '-'], enabled: true },
    'shortcut.app.zoom.reset': { binding: ['CommandOrControl', '0'], enabled: true },
    'ui.theme_mode': PreferenceTypes.ThemeMode.system,
    'ui.theme_user.code_font_family': '',
    'ui.theme_user.color_primary': '#00b96b',
    'ui.theme_user.font_family': ''
  }
}

