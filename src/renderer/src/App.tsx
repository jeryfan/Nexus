import { Button } from '@renderer/components/ui/button'
import { Terminal } from 'lucide-react'

function App(): React.JSX.Element {
  const ping = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nexus</h1>
        <p className="text-sm text-muted-foreground">
          electron-vite + React + TypeScript + shadcn/ui
        </p>
      </div>
      <Button variant="outline" onClick={ping}>
        <Terminal />
        Ping 主进程
      </Button>
    </div>
  )
}

export default App
