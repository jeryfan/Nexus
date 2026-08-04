// Glue for Nexus: 浏览器设置分区——session profile 与 cookie 管理（导入/清除）。
// 标题/描述包装沿用 Nexus 设置页现有分区惯例（见 PluginSettingsPage）。
import { useEffect } from 'react'
import type { FC } from 'react'
import {
  SettingDescription,
  SettingsContentColumn,
  SettingTitle
} from '@renderer/components/SettingsPrimitives'
import { useBrowserStore } from '@renderer/stores/browser'
import { BrowserSessionCookiesSection } from './BrowserSessionCookiesSection'

export const BrowserSettingsPane: FC = () => {
  const fetchBrowserSessionProfiles = useBrowserStore((s) => s.fetchBrowserSessionProfiles)

  // Why: renderer 启动时未统一拉取 profile 列表，进入浏览器设置分区时拉取一次。
  useEffect(() => {
    void fetchBrowserSessionProfiles()
  }, [fetchBrowserSessionProfiles])

  return (
    <SettingsContentColumn>
      <SettingTitle>浏览器</SettingTitle>
      <SettingDescription>
        管理浏览器 Profile 与 Cookie：从本机浏览器或文件导入，选择新标签页的默认会话。
      </SettingDescription>
      <div className="mt-4 flex flex-col gap-4">
        <BrowserSessionCookiesSection />
      </div>
    </SettingsContentColumn>
  )
}
