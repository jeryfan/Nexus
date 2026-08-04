// 浏览器设置默认值（主页 URL / 搜索引擎 / 默认缩放设置项），browser store 与面板组件直接取本常量：
// browserDefaultUrl / browserDefaultSearchEngine / browserKagiSessionLink 为可选字段，默认为 null
// （null 语义）；browserDefaultZoomLevel = DEFAULT_BROWSER_PAGE_ZOOM_LEVEL。
import { DEFAULT_BROWSER_PAGE_ZOOM_LEVEL } from '@shared/browser/browser-page-zoom'

export type BrowserSearchEngine = 'google' | 'duckduckgo' | 'bing' | 'kagi'

export type BrowserSettingsDefaults = {
  browserDefaultUrl: string | null
  browserDefaultSearchEngine: BrowserSearchEngine | null
  browserDefaultZoomLevel: number
  browserKagiSessionLink: string | null
}

export const BROWSER_SETTINGS_DEFAULTS: BrowserSettingsDefaults = {
  browserDefaultUrl: null,
  browserDefaultSearchEngine: null,
  browserDefaultZoomLevel: DEFAULT_BROWSER_PAGE_ZOOM_LEVEL,
  browserKagiSessionLink: null
}
