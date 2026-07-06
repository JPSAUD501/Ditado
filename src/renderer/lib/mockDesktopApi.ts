import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import type {
  DashboardViewModel,
  DeviceInfo,
  PermissionState,
  Settings,
} from '@shared/contracts'

const dashboardState: DashboardViewModel = {
  settings: defaultSettings,
  history: [],
  permissions: defaultPermissionState,
  updateState: {
    enabled: true,
    channel: 'stable',
    lastCheckedAt: null,
    status: 'idle',
    downloadProgress: null,
  },
  appVersion: '0.0.0-mock',
}

const dashboardListeners = new Set<(state: DashboardViewModel) => void>()

const notifyDashboard = (): void => {
  for (const listener of dashboardListeners) {
    listener(dashboardState)
  }
}

const updateSettings = async (patch: Partial<Settings>): Promise<Settings> => {
  Object.assign(dashboardState.settings, patch)
  notifyDashboard()
  return dashboardState.settings
}

const noopPermission = async (): Promise<PermissionState> => defaultPermissionState
const noopDevices = async (): Promise<DeviceInfo[]> => []
const noopDictation = async (): Promise<void> => undefined

export const ensureMockDesktopApi = (): void => {
  if (window.ditado) {
    return
  }

  window.ditado = {
    getDashboardState: async () => dashboardState,
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
    updateSettings,
    setApiKey: async () => {
      dashboardState.settings.apiKeyPresent = true
      notifyDashboard()
      return dashboardState.settings
    },
    setHotkeyCaptureActive: async () => undefined,
    getShortcutStatus: async () => ({ captureActive: false, uiohookRunning: true }),
    subscribeHotkeyCapture: () => () => undefined,
    listMicrophones: noopDevices,
    requestMicrophoneAccess: noopPermission,
    getPermissions: noopPermission,
    openDashboardTab: async () => undefined,
    clearHistory: async () => {
      dashboardState.history = []
      notifyDashboard()
    },
    deleteHistoryEntry: async (entryId: string) => {
      dashboardState.history = dashboardState.history.filter((e) => e.id !== entryId)
      notifyDashboard()
    },
    checkForUpdates: async () => undefined,
    downloadUpdate: async () => undefined,
    installUpdate: async () => undefined,
    openExternalUrl: async (url: string) => { window.open(url, '_blank') },
    sendAudioLevel: () => undefined,
    subscribeAudioLevel: () => () => undefined,
  }
}
