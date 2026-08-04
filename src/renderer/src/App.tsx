import { useEffect } from 'react'
import { PopupHost } from '@renderer/components/PopupHost'
import { ResizeDragOverlay } from '@renderer/components/ui/resizable'
import { ThemeProvider } from '@renderer/components/ThemeProvider'
import ToastHost from '@renderer/components/ToastHost'
import { Toaster } from '@renderer/features/browser/ui/sonner'
import { useBrowserIpcEvents } from '@renderer/features/browser/useBrowserIpcEvents'
import { useBrowserSessionHydration } from '@renderer/features/browser/useBrowserSessionHydration'
import { HomeView } from '@renderer/views/home-view'
import { SettingsView } from '@renderer/views/settings-view'
import { selectCurrentView, useNavigationStore } from '@renderer/stores/navigation'

function App(): React.JSX.Element {
  const view = useNavigationStore(selectCurrentView)

  // 浏览器常驻胶水挂在 App 层——
  // 设置视图切换会卸载 HomeView，挂 AgentPage 会导致此间 CLI requestTabCreate 等退订超时。
  // 两个 hook 只读 zustand（useAgentStore/useBrowserStore），不依赖 AgentRuntimeProvider 上下文。
  useBrowserSessionHydration()
  useBrowserIpcEvents()

  // 快捷键 ⌘,（Windows/Linux 为 Ctrl+,）进入设置
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault()
        useNavigationStore.getState().navigate('settings')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ThemeProvider>
      {view === 'settings' ? <SettingsView /> : <HomeView />}
      <ToastHost />
      {/* sonner Toaster：features/browser 的 toast.* 调用（cookie 导入、profile 操作等）的渲染宿主。 */}
      <Toaster closeButton toastOptions={{ className: 'font-sans text-sm' }} />
      <PopupHost />
      <ResizeDragOverlay />
    </ThemeProvider>
  )
}

export default App
