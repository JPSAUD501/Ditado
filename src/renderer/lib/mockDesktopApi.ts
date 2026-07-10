import { defaultPermissionState, defaultUpdateState } from '@shared/defaults'
import type {
  DashboardNativeState,
  DeviceInfo,
  PermissionState,
} from '@shared/contracts'

const dashboardNativeState: DashboardNativeState = {
  permissions: defaultPermissionState,
  updateState: defaultUpdateState,
  appVersion: '0.0.0-mock',
}

const noopPermission = async (): Promise<PermissionState> => defaultPermissionState
const noopDevices = async (): Promise<DeviceInfo[]> => []
const noopDictation = async (): Promise<void> => undefined

export const ensureMockDesktopApi = (): void => {
  if (window.ditado) {
    return
  }

  window.ditado = {
    getDashboardNativeState: async () => dashboardNativeState,
    subscribeDashboardNativeState: () => () => undefined,
    subscribeDashboardTabRequests: () => () => undefined,
    startPushToTalk: noopDictation,
    stopPushToTalk: noopDictation,
    toggleDictation: noopDictation,
    cancelDictation: async () => undefined,
    setOnboardingDictationEnabled: async () => undefined,
    notifyRecorderStarted: async () => undefined,
    notifyRecorderFailed: async () => undefined,
    notifyRecorderReady: async () => undefined,
    notifyRecorderWarmupFinished: async () => undefined,
    setHotkeyCaptureActive: async () => undefined,
    getShortcutStatus: async () => ({ captureActive: false, uiohookRunning: true }),
    subscribeHotkeyCapture: () => () => undefined,
    listMicrophones: noopDevices,
    requestMicrophoneAccess: noopPermission,
    getPermissions: noopPermission,
    openDashboardTab: async () => undefined,
    checkForUpdates: async () => undefined,
    downloadUpdate: async () => undefined,
    installUpdate: async () => undefined,
    openExternalUrl: async (url: string) => { window.open(url, '_blank') },
    sendAudioLevel: () => undefined,
    subscribeAudioLevel: () => () => undefined,
  }
}
