import { BrowserWindow, ipcMain } from 'electron'

import { ipcChannels } from '../../shared/ipc.js'
import type { DashboardTab } from '../../shared/contracts.js'
import type { PermissionService } from '../services/permissions/permissionService.js'
import type { DictationSessionOrchestrator } from '../services/session/dictationSessionOrchestrator.js'
import type { AppStore } from '../services/store/appStore.js'
import type { TelemetryService } from '../services/telemetry/telemetryService.js'
import type { UpdateService } from '../services/update/updateService.js'

interface RegisterIpcOptions {
  store: AppStore
  orchestrator: DictationSessionOrchestrator
  permissions: PermissionService
  telemetry: TelemetryService
  updates: UpdateService
  setHotkeyCaptureActive: (active: boolean) => void
  onSettingsChanged: () => Promise<void>
  openDashboardTab: (tab: DashboardTab) => void
}

export const registerIpc = ({
  store,
  orchestrator,
  permissions,
  telemetry,
  updates,
  setHotkeyCaptureActive,
  onSettingsChanged,
  openDashboardTab,
}: RegisterIpcOptions): void => {
  ipcMain.handle(ipcChannels.overlay.getState, async () => ({
    session: orchestrator.getSession(),
    settings: store.getSettings(),
    permissions: await permissions.getState(),
  }))

  ipcMain.handle(ipcChannels.dashboard.getState, async () => ({
    session: orchestrator.getSession(),
    settings: store.getSettings(),
    history: store.getHistory(),
    telemetryTail: await telemetry.tail(),
    permissions: await permissions.getState(),
    updateState: updates.getState(),
  }))

  ipcMain.handle(ipcChannels.dictation.startPushToTalk, () => orchestrator.startCapture('push-to-talk'))
  ipcMain.handle(ipcChannels.dictation.stopPushToTalk, (_event, payload) =>
    orchestrator.submitAudio('push-to-talk', payload),
  )
  ipcMain.handle(ipcChannels.dictation.toggle, (_event, payload) => {
    if (payload) {
      return orchestrator.submitAudio('toggle', payload)
    }

    return orchestrator.toggleCapture()
  })
  ipcMain.handle(ipcChannels.dictation.cancel, () => orchestrator.cancel())

  ipcMain.handle(ipcChannels.settings.update, async (_event, patch) => {
    const settings = await store.updateSettings(patch)
    await onSettingsChanged()
    return settings
  })

  ipcMain.handle(ipcChannels.settings.setApiKey, async (_event, apiKey: string) => {
    const settings = await store.setApiKey(apiKey)
    await onSettingsChanged()
    return settings
  })
  ipcMain.handle(ipcChannels.hotkeys.setCaptureMode, (_event, active: boolean) => {
    setHotkeyCaptureActive(active)
  })

  ipcMain.handle(ipcChannels.permissions.requestMicrophone, () => permissions.requestMicrophoneAccess())
  ipcMain.handle(ipcChannels.permissions.get, () => permissions.getState())
  ipcMain.handle(ipcChannels.history.clear, () => store.clearHistory())
  ipcMain.handle(ipcChannels.history.audio, (_event, entryId: string) => store.getHistoryAudioAsset(entryId))
  ipcMain.handle(ipcChannels.telemetry.tail, () => telemetry.tail())
  ipcMain.handle(ipcChannels.dashboardNavigation.openTab, (_event, tab: DashboardTab) => openDashboardTab(tab))
  ipcMain.handle(ipcChannels.updates.check, async () => {
    await updates.checkForUpdates()
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(ipcChannels.dashboard.state, {
        session: orchestrator.getSession(),
        settings: store.getSettings(),
        history: store.getHistory(),
        telemetryTail: await telemetry.tail(),
        permissions: await permissions.getState(),
        updateState: updates.getState(),
      })
    }
  })
}
