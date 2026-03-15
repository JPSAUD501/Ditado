import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@renderer/App'
import { ensureMockDesktopApi } from '@renderer/lib/mockDesktopApi'
import '@renderer/styles.css'

ensureMockDesktopApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
