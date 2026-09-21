import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import type {
  ActivationMode,
  DashboardViewModel,
  DeviceInfo,
  DictationSession,
  DictationStatus,
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
const audioLevelListeners = new Set<(rms: number) => void>()

// Fresh object on every notify so React state updates are not skipped by reference equality
const notifyOverlay = (): void => {
  const snapshot = { ...overlayState }
  for (const listener of overlayListeners) {
    listener(snapshot)
  }
}

const notifyDashboard = (): void => {
  const snapshot = { ...dashboardState }
  for (const listener of dashboardListeners) {
    listener(snapshot)
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

/* ── Browser-only demo: cycles the overlay through every status ──────
 * Open the renderer in a plain browser (vite dev) with
 *   /?window=overlay&demo=1            → toggle mode
 *   /?window=overlay&demo=1&mode=ptt   → push-to-talk mode
 *   /?window=overlay&demo=manual       → no auto-cycle; drive it from devtools with
 *                                          window.__ditadoDemoSet({ status: "listening", ms: 0 })
 * The mock drives session state and synthetic mic levels so the pill's
 * transitions can be reviewed without launching Electron.
 */

type DemoStep = { status: DictationStatus | null; ms: number; notice?: string; selectedText?: string }

const demoScript: DemoStep[] = [
  { status: 'arming', ms: 700 },
  { status: 'listening', ms: 3200, selectedText: 'selected text' },
  { status: 'processing', ms: 2000, selectedText: 'selected text' },
  { status: 'streaming', ms: 2400, selectedText: 'selected text' },
  { status: 'completed', ms: 1200, selectedText: 'selected text' },
  { status: null, ms: 900 },
  { status: 'arming', ms: 600 },
  { status: 'listening', ms: 1800 },
  { status: 'processing', ms: 1200 },
  { status: 'error', ms: 1200 },
  { status: null, ms: 900 },
  { status: 'notice', ms: 1600, notice: 'notices.ready' },
  { status: null, ms: 700 },
  { status: 'notice', ms: 1600, notice: 'notices.doubleTapToToggle' },
  { status: null, ms: 1200 },
]

const buildDemoSession = (
  step: DemoStep,
  mode: ActivationMode,
  processingStartedAt: string | null,
): DictationSession => {
  const now = new Date().toISOString()
  return {
    id: 'demo-session',
    activationMode: mode,
    status: step.status ?? 'idle',
    captureIntent: 'none',
    startedAt: now,
    finishedAt: null,
    processingStartedAt,
    targetApp: 'Visual Studio Code',
    context: {
      appName: 'Visual Studio Code',
      windowTitle: null,
      selectedText: step.selectedText ?? '',
      permissionsGranted: true,
      confidence: 'high',
      capturedAt: now,
    },
    partialText: '',
    finalText: '',
    insertionPlan: { strategy: 'insert-at-cursor', targetApp: 'Visual Studio Code', capability: 'automation' },
    errorMessage: step.status === 'error' ? 'Demo error' : null,
    noticeMessage: step.notice ?? null,
  }
}

declare global {
  interface Window {
    /** Browser-only demo hook: jump the overlay to a given step (see startOverlayDemo). */
    __ditadoDemoSet?: (step: DemoStep) => void
  }
}

const startOverlayDemo = (mode: ActivationMode, manual: boolean): void => {
  let index = 0
  let processingStartedAt: string | null = null
  let levelTimer: number | null = null

  const stopLevels = (): void => {
    if (levelTimer !== null) {
      window.clearInterval(levelTimer)
      levelTimer = null
    }
  }

  const startLevels = (): void => {
    stopLevels()
    let t = 0
    levelTimer = window.setInterval(() => {
      t += 1
      // Rough "speech" envelope: bursts of syllables with short pauses
      const syllable = Math.max(0, Math.sin(t / 2.2)) * (0.55 + 0.45 * Math.sin(t / 9))
      const pause = Math.sin(t / 23) > 0.7 ? 0 : 1
      const rms = pause * (0.04 + syllable * 0.16 + Math.random() * 0.02)
      for (const listener of audioLevelListeners) listener(rms)
    }, 50)
  }

  const apply = (step: DemoStep): void => {
    if (step.status === 'processing' && processingStartedAt === null) {
      processingStartedAt = new Date().toISOString()
    }
    if (step.status === null || step.status === 'arming' || step.status === 'listening' || step.status === 'notice') {
      processingStartedAt = null
    }

    overlayState.session = step.status === null ? null : buildDemoSession(step, mode, processingStartedAt)
    dashboardState.session = overlayState.session
    notifyOverlay()
    notifyDashboard()

    if (step.status === 'listening') startLevels()
    else stopLevels()
  }

  const advance = (): void => {
    const step = demoScript[index % demoScript.length]
    index += 1
    apply(step)
    window.setTimeout(advance, step.ms)
  }

  window.__ditadoDemoSet = apply
  if (!manual) advance()
}

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
    sendAudioLevel: (rms: number) => {
      for (const listener of audioLevelListeners) listener(rms)
    },
    subscribeAudioLevel: (listener) => {
      audioLevelListeners.add(listener)
      return () => audioLevelListeners.delete(listener)
    },
  }

  const params = new URLSearchParams(window.location.search)
  const demo = params.get('demo')
  if (demo === '1' || demo === 'manual') {
    startOverlayDemo(params.get('mode') === 'ptt' ? 'push-to-talk' : 'toggle', demo === 'manual')
  }
}
