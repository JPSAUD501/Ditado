/// <reference types="vite/client" />

import type {
  DashboardTab,
  DashboardNativeState,
  DeviceInfo,
  DictationAudioPayload,
  PermissionState,
  RecorderWarmupStatus,
} from '@shared/contracts'
import type { HotkeyCapturePayload } from '@shared/hotkeys'

interface DitadoDesktopApi {
  getDashboardNativeState: () => Promise<DashboardNativeState>
  subscribeDashboardNativeState: (listener: (state: DashboardNativeState) => void) => () => void
  subscribeDashboardTabRequests: (listener: (tab: DashboardTab) => void) => () => void
  startPushToTalk: () => Promise<void>
  stopPushToTalk: (payload: DictationAudioPayload) => Promise<void>
  toggleDictation: (payload?: DictationAudioPayload) => Promise<void>
  cancelDictation: () => Promise<void>
  setOnboardingDictationEnabled: (enabled: boolean) => Promise<void>
  notifyRecorderStarted: (sessionId: string) => Promise<void>
  notifyRecorderFailed: (sessionId: string, reason: string) => Promise<void>
  notifyRecorderReady: () => Promise<void>
  notifyRecorderWarmupFinished: (status: RecorderWarmupStatus) => Promise<void>
  setHotkeyCaptureActive: (active: boolean) => Promise<void>
  getShortcutStatus: () => Promise<{ captureActive: boolean; uiohookRunning: boolean }>
  subscribeHotkeyCapture: (listener: (payload: HotkeyCapturePayload) => void) => () => void
  listMicrophones: () => Promise<DeviceInfo[]>
  requestMicrophoneAccess: () => Promise<PermissionState>
  getPermissions: () => Promise<PermissionState>
  openDashboardTab: (tab: DashboardTab) => Promise<void>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  sendAudioLevel: (level: number) => void
  subscribeAudioLevel: (listener: (level: number) => void) => () => void
}

declare global {
  interface Window {
    ditado: DitadoDesktopApi
  }
}

export {}
