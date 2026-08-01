import '@renderer/assets/styles/index.css'
import '@renderer/assets/styles/tailwind.css'
import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
