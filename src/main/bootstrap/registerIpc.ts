import { app, type BrowserWindow, ipcMain, shell } from 'electron'

import {
  apiKeyInputSchema,
  dashboardTabSchema,
  dictationAudioPayloadSchema,
  historyAudioRequestSchema,
  recorderWarmupStatusSchema,
  sessionIdInputSchema,
  settingsPatchSchema,
} from '../../shared/contracts.js'
import { ipcChannels } from '../../shared/ipc.js'
import type { DashboardTab, RecorderWarmupStatus } from '../../shared/contracts.js'
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
  getShortcutStatus: () => { captureActive: boolean; uiohookRunning: boolean }
  canStartDictation: () => boolean
  onSettingsChanged: () => Promise<void>
  broadcastState: () => Promise<void>
  openDashboardTab: (tab: DashboardTab) => void
  getOverlayWindow: () => BrowserWindow | null
  onRecorderReady: () => void
  onRecorderWarmupFinished: (status: RecorderWarmupStatus) => void
}

export const registerIpc = ({
  store,
  orchestrator,
  permissions,
  telemetry,
  updates,
  setHotkeyCaptureActive,
  getShortcutStatus,
  canStartDictation,
  onSettingsChanged,
  broadcastState,
  openDashboardTab,
  getOverlayWindow,
  onRecorderReady,
  onRecorderWarmupFinished,
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
    appVersion: app.getVersion(),
  }))

  ipcMain.handle(ipcChannels.dictation.startPushToTalk, () => {
    if (!canStartDictation()) {
      return
    }

    return orchestrator.startCapture('push-to-talk')
  })
  ipcMain.handle(ipcChannels.dictation.stopPushToTalk, (_event, payload) =>
    orchestrator.submitAudio('push-to-talk', dictationAudioPayloadSchema.parse(payload)),
  )
  ipcMain.handle(ipcChannels.dictation.toggle, (_event, payload) => {
    if (payload) {
      return orchestrator.submitAudio('toggle', dictationAudioPayloadSchema.parse(payload))
    }

    if (!canStartDictation()) {
      return
    }

    return orchestrator.toggleCapture()
  })
  ipcMain.handle(ipcChannels.dictation.cancel, () => orchestrator.cancel())
  ipcMain.handle(ipcChannels.dictation.recorderStarted, (_event, sessionId: string) =>
    orchestrator.markRecorderStarted(sessionIdInputSchema.parse(sessionId)),
  )
  ipcMain.handle(ipcChannels.dictation.recorderFailed, (_event, sessionId: string, reason: string) =>
    orchestrator.markRecorderFailed(
      sessionIdInputSchema.parse(sessionId),
      typeof reason === 'string' ? reason : 'Unable to start microphone capture.',
    ),
  )

  ipcMain.handle(ipcChannels.settings.update, async (_event, patch) => {
    const settings = await store.updateSettings(settingsPatchSchema.parse(patch))
    await onSettingsChanged()
    return settings
  })

  ipcMain.handle(ipcChannels.settings.setApiKey, async (_event, apiKey: string) => {
    const settings = await store.setApiKey(apiKeyInputSchema.parse(apiKey))
    await onSettingsChanged()
    return settings
  })
  let captureAutoResetTimer: NodeJS.Timeout | null = null
  ipcMain.handle(ipcChannels.hotkeys.setCaptureMode, (_event, active: boolean) => {
    if (captureAutoResetTimer) {
      clearTimeout(captureAutoResetTimer)
      captureAutoResetTimer = null
    }
    setHotkeyCaptureActive(Boolean(active))
    if (active) {
      captureAutoResetTimer = setTimeout(() => {
        captureAutoResetTimer = null
        setHotkeyCaptureActive(false)
      }, 10_000)
    }
  })
  ipcMain.handle(ipcChannels.hotkeys.getStatus, () => getShortcutStatus())

  ipcMain.handle(ipcChannels.permissions.requestMicrophone, async () => {
    const state = await permissions.requestMicrophoneAccess()
    await broadcastState()
    return state
  })
  ipcMain.handle(ipcChannels.permissions.get, () => permissions.getState())
  ipcMain.handle(ipcChannels.startup.recorderReady, () => {
    onRecorderReady()
  })
  ipcMain.handle(ipcChannels.startup.recorderWarmupFinished, (_event, status) => {
    onRecorderWarmupFinished(recorderWarmupStatusSchema.parse(status))
  })
  ipcMain.handle(ipcChannels.history.clear, async () => {
    await store.clearHistory()
    await broadcastState()
  })
  ipcMain.handle(ipcChannels.history.audio, (_event, entryId: string) =>
    store.getHistoryAudioAsset(historyAudioRequestSchema.parse(entryId)),
  )
  ipcMain.handle(ipcChannels.history.deleteEntry, async (_event, entryId: string) => {
    await store.deleteHistoryEntry(historyAudioRequestSchema.parse(entryId))
    await broadcastState()
  })
  ipcMain.handle(ipcChannels.telemetry.tail, () => telemetry.tail())
  ipcMain.handle(ipcChannels.dashboardNavigation.openTab, (_event, tab: DashboardTab) =>
    openDashboardTab(dashboardTabSchema.parse(tab)),
  )
  ipcMain.handle(ipcChannels.updates.check, async () => {
    await updates.checkForUpdates()
    await broadcastState()
  })
  ipcMain.handle(ipcChannels.updates.download, async () => {
    await updates.downloadUpdate()
    await broadcastState()
  })
  ipcMain.handle(ipcChannels.updates.install, () => {
    updates.installUpdate()
  })

  ipcMain.handle(ipcChannels.shell.openExternal, (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      return shell.openExternal(url)
    }
  })

  // Fire-and-forget: forward audio level from dashboard renderer to overlay
  ipcMain.on(ipcChannels.dictation.audioLevel, (_event, level: number) => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(ipcChannels.dictation.audioLevel, level)
    }
  })
}
