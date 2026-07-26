import { useEffect } from 'react'
import { HomeView } from '@renderer/views/home-view'
import { SettingsView } from '@renderer/views/settings-view'
import { selectCurrentView, useNavigationStore } from '@renderer/stores/navigation'

function App(): React.JSX.Element {
  const view = useNavigationStore(selectCurrentView)

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

  return view === 'settings' ? <SettingsView /> : <HomeView />
}

export default App
