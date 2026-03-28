import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import type {
  DashboardViewModel,
  DeviceInfo,
  OverlayViewModel,
  PermissionState,
  Settings,
  TelemetryRecord,
} from '@shared/contracts'

const overlayState: OverlayViewModel = {
  session: null,
  settings: defaultSettings,
  permissions: defaultPermissionState,
}

const dashboardState: DashboardViewModel = {
  session: null,
  settings: defaultSettings,
  history: [],
  telemetryTail: [],
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

const overlayListeners = new Set<(state: OverlayViewModel) => void>()
const dashboardListeners = new Set<(state: DashboardViewModel) => void>()

const notifyOverlay = (): void => {
  for (const listener of overlayListeners) {
    listener(overlayState)
  }
}

const notifyDashboard = (): void => {
  for (const listener of dashboardListeners) {
    listener(dashboardState)
  }
}

const updateSettings = async (patch: Partial<Settings>): Promise<Settings> => {
  Object.assign(overlayState.settings, patch)
  Object.assign(dashboardState.settings, patch)
  notifyOverlay()
  notifyDashboard()
  return dashboardState.settings
}

const noopPermission = async (): Promise<PermissionState> => defaultPermissionState
const noopTelemetry = async (): Promise<TelemetryRecord[]> => []
const noopDevices = async (): Promise<DeviceInfo[]> => []
const noopDictation = async (): Promise<void> => undefined

export const ensureMockDesktopApi = (): void => {
  if (window.ditado) {
    return
  }

  window.ditado = {
    getOverlayState: async () => overlayState,
    getDashboardState: async () => dashboardState,
    subscribeOverlayState: (listener) => {
      overlayListeners.add(listener)
      listener(overlayState)
      return () => overlayListeners.delete(listener)
    },
    subscribeDashboardState: (listener) => {
      dashboardListeners.add(listener)
      listener(dashboardState)
      return () => dashboardListeners.delete(listener)
    },
    subscribeDashboardTabRequests: () => () => undefined,
    startPushToTalk: noopDictation,
    stopPushToTalk: noopDictation,
    toggleDictation: noopDictation,
    cancelDictation: async () => undefined,
    notifyRecorderStarted: async () => undefined,
    notifyRecorderFailed: async () => undefined,
    notifyRecorderReady: async () => undefined,
    notifyRecorderWarmupFinished: async () => undefined,
    updateSettings,
    setApiKey: async () => {
      dashboardState.settings.apiKeyPresent = true
      overlayState.settings.apiKeyPresent = true
      notifyOverlay()
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
    getHistoryAudio: async () => null,
    getTelemetryTail: noopTelemetry,
    checkForUpdates: async () => undefined,
    downloadUpdate: async () => undefined,
    installUpdate: async () => undefined,
    openExternalUrl: async (url: string) => { window.open(url, '_blank') },
    sendAudioLevel: () => undefined,
    subscribeAudioLevel: () => () => undefined,
  }
}
