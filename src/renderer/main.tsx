import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@renderer/App'
import '@renderer/i18n'
import { ensureMockDesktopApi } from '@renderer/lib/mockDesktopApi'
import '@renderer/styles.css'

const isElectronRenderer = navigator.userAgent.toLowerCase().includes('electron')

if (!window.ditado) {
  if (isElectronRenderer) {
    throw new Error('Ditado desktop bridge is unavailable. The preload script did not initialize.')
  }
  ensureMockDesktopApi()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
