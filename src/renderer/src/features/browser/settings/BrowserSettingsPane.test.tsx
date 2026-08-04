// @vitest-environment happy-dom
// Glue for Nexus: Task 11 冒烟测试——BrowserSettingsPane 挂载即拉取 profile 列表，
// 渲染 store 中的 profile 行；无 profile 时 default fallback 行兜底。
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowserSessionProfile } from '@shared/browser/types'
import { useBrowserStore } from '@renderer/stores/browser'
import { BrowserSettingsPane } from './BrowserSettingsPane'

// SettingsPrimitives 经 @nexus/ui（vitest 未配置 workspace 别名，桌面端由 electron.vite alias），
// 非本测试关注点，隔离为透传 div。
vi.mock('@renderer/components/SettingsPrimitives', () => ({
  SettingsContentColumn: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SettingTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SettingDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

const sessionListProfiles = vi.fn<[], Promise<BrowserSessionProfile[]>>()

// @ts-expect-error test window mock（happy-dom 提供 window，仅补 api 面）
window.api = {
  browser: {
    sessionListProfiles
  }
}

function profileFixture(id: string, label: string): BrowserSessionProfile {
  return {
    id,
    scope: 'isolated',
    partition: `persist:nexus-browser-${id}`,
    label,
    source: null
  }
}

describe('BrowserSettingsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionListProfiles.mockResolvedValue([])
    useBrowserStore.setState({
      browserSessionProfiles: [],
      browserSessionProfilesByHostId: {},
      browserSessionHostIdOverride: null,
      defaultBrowserSessionProfileId: null,
      defaultBrowserSessionProfileIdByHostId: {},
      browserSessionImportState: null,
      detectedBrowsers: [],
      detectedBrowsersLoaded: false
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('mount 时经 IPC 拉取 profile 列表', async () => {
    render(<BrowserSettingsPane />)
    await waitFor(() => expect(sessionListProfiles).toHaveBeenCalled())
  })

  it('渲染 store 返回的 profile label', async () => {
    sessionListProfiles.mockResolvedValue([profileFixture('work', 'Work Profile')])
    render(<BrowserSettingsPane />)
    expect(await screen.findByText('Work Profile')).toBeInTheDocument()
  })

  it('无 profile 时 default fallback 行存在', async () => {
    render(<BrowserSettingsPane />)
    await waitFor(() => expect(sessionListProfiles).toHaveBeenCalled())
    // fallback 行 label 走 i18n zh 映射（4399c77caa → 默认），且带导入入口
    expect(await screen.findByText('默认')).toBeInTheDocument()
    expect(screen.getByText('导入 Cookie')).toBeInTheDocument()
  })
})
