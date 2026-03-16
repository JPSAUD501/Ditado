import { ipcMain } from 'electron'

import {
  apiKeyInputSchema,
  dashboardTabSchema,
  dictationAudioPayloadSchema,
  historyAudioRequestSchema,
  insertionBenchmarkRequestSchema,
  sessionIdInputSchema,
  settingsPatchSchema,
} from '../../shared/contracts.js'
import { ipcChannels } from '../../shared/ipc.js'
import type { DashboardTab } from '../../shared/contracts.js'
import type { PermissionService } from '../services/permissions/permissionService.js'
import type { InsertionBenchmarkService } from '../services/insertion/insertionBenchmarkService.js'
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
  benchmark: InsertionBenchmarkService
  setHotkeyCaptureActive: (active: boolean) => void
  getShortcutStatus: () => { captureActive: boolean; uiohookRunning: boolean }
  onSettingsChanged: () => Promise<void>
  broadcastState: () => Promise<void>
  openDashboardTab: (tab: DashboardTab) => void
}

export const registerIpc = ({
  store,
  orchestrator,
  permissions,
  telemetry,
  updates,
  benchmark,
  setHotkeyCaptureActive,
  getShortcutStatus,
  onSettingsChanged,
  broadcastState,
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
    orchestrator.submitAudio('push-to-talk', dictationAudioPayloadSchema.parse(payload)),
  )
  ipcMain.handle(ipcChannels.dictation.toggle, (_event, payload) => {
    if (payload) {
      return orchestrator.submitAudio('toggle', dictationAudioPayloadSchema.parse(payload))
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
  ipcMain.handle(ipcChannels.settings.benchmarkInsertion, (_event, request) =>
    benchmark.run(insertionBenchmarkRequestSchema.parse(request)),
  )

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

  ipcMain.handle(ipcChannels.permissions.requestMicrophone, () => permissions.requestMicrophoneAccess())
  ipcMain.handle(ipcChannels.permissions.get, () => permissions.getState())
  ipcMain.handle(ipcChannels.history.clear, async () => {
    await store.clearHistory()
    await broadcastState()
  })
  ipcMain.handle(ipcChannels.history.audio, (_event, entryId: string) =>
    store.getHistoryAudioAsset(historyAudioRequestSchema.parse(entryId)),
  )
  ipcMain.handle(ipcChannels.telemetry.tail, () => telemetry.tail())
  ipcMain.handle(ipcChannels.dashboardNavigation.openTab, (_event, tab: DashboardTab) =>
    openDashboardTab(dashboardTabSchema.parse(tab)),
  )
  ipcMain.handle(ipcChannels.updates.check, async () => {
    await updates.checkForUpdates()
    await broadcastState()
  })
}
