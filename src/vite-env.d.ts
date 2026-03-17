/// <reference types="vite/client" />

import type {
  DashboardTab,
  DashboardViewModel,
  DeviceInfo,
  DictationAudioPayload,
  HistoryAudioAsset,
  OverlayViewModel,
  PermissionState,
  Settings,
  TelemetryRecord,
} from '@shared/contracts'

interface DitadoDesktopApi {
  getOverlayState: () => Promise<OverlayViewModel>
  getDashboardState: () => Promise<DashboardViewModel>
  subscribeOverlayState: (listener: (state: OverlayViewModel) => void) => () => void
  subscribeDashboardState: (listener: (state: DashboardViewModel) => void) => () => void
  startPushToTalk: () => Promise<void>
  stopPushToTalk: (payload: DictationAudioPayload) => Promise<void>
  toggleDictation: (payload?: DictationAudioPayload) => Promise<void>
  cancelDictation: () => Promise<void>
  notifyRecorderStarted: (sessionId: string) => Promise<void>
  notifyRecorderFailed: (sessionId: string, reason: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  setApiKey: (apiKey: string) => Promise<Settings>
setHotkeyCaptureActive: (active: boolean) => Promise<void>
  getShortcutStatus: () => Promise<{ captureActive: boolean; uiohookRunning: boolean }>
  listMicrophones: () => Promise<DeviceInfo[]>
  requestMicrophoneAccess: () => Promise<PermissionState>
  getPermissions: () => Promise<PermissionState>
  openDashboardTab: (tab: DashboardTab) => Promise<void>
  clearHistory: () => Promise<void>
  deleteHistoryEntry: (entryId: string) => Promise<void>
  getHistoryAudio: (entryId: string) => Promise<HistoryAudioAsset | null>
  getTelemetryTail: () => Promise<TelemetryRecord[]>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  sendAudioLevel: (level: number) => void
  subscribeAudioLevel: (listener: (level: number) => void) => () => void
}

declare global {
  interface Window {
    ditado: DitadoDesktopApi
  }
}

export {}
