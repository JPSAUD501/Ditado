import { useEffect } from 'react'
import { SyncoreElectronProvider } from 'syncorejs/node/ipc/react'
import type { DashboardTab } from '@shared/contracts'
import { ElectronSyncoreProvider } from '@renderer/syncore/ElectronSyncoreProvider'
import { DashboardWindow } from '@renderer/windows/DashboardWindow'
import { OverlayWindow } from '@renderer/windows/OverlayWindow'

const searchParams = new URLSearchParams(window.location.search)
const windowType = searchParams.get('window') ?? 'dashboard'
const dashboardTab = (searchParams.get('tab') ?? 'overview') as DashboardTab

const isMac = navigator.userAgent.includes('Macintosh')
const isElectronRenderer = navigator.userAgent.toLowerCase().includes('electron')

const AppSyncoreProvider = isElectronRenderer ? ElectronSyncoreProvider : SyncoreElectronProvider

export const App = () => {
  useEffect(() => {
    document.body.dataset.window = windowType
    document.documentElement.dataset.window = windowType
    if (isMac) {
      document.documentElement.dataset.platform = 'darwin'
    }

    return () => {
      delete document.body.dataset.window
      delete document.documentElement.dataset.window
      delete document.documentElement.dataset.platform
    }
  }, [])

  if (windowType === 'overlay') {
    return (
      <AppSyncoreProvider>
        <OverlayWindow />
      </AppSyncoreProvider>
    )
  }

  return (
    <AppSyncoreProvider>
      <DashboardWindow initialTab={dashboardTab} />
    </AppSyncoreProvider>
  )
}
