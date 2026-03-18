import { app, BrowserWindow, nativeTheme, screen, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { defaultPermissionState } from '../shared/defaults.js'
import { ipcChannels } from '../shared/ipc.js'
import type { DashboardTab, DictationSession, OverlayViewModel, Settings, WindowKind } from '../shared/contracts.js'
import { createWindowIcon } from './bootstrap/appIcon.js'
import { registerIpc } from './bootstrap/registerIpc.js'
import { configureMediaPermissions } from './bootstrap/configureMediaPermissions.js'
import { registerShortcuts } from './bootstrap/registerShortcuts.js'
import { registerTray } from './bootstrap/registerTray.js'
import { shutdownServices } from './bootstrap/shutdown.js'
import { AutomationService } from './services/automation/automationService.js'
import { ClipboardService } from './services/clipboard/clipboardService.js'
import { ActiveContextService } from './services/context/activeContextService.js'
import { InsertionEngine } from './services/insertion/insertionEngine.js'
import { OpenRouterService } from './services/llm/openRouterService.js'
import { PermissionService } from './services/permissions/permissionService.js'
import { DictationSessionOrchestrator } from './services/session/dictationSessionOrchestrator.js'
import { AppStore } from './services/store/appStore.js'
import { syncLoginItemSettings } from './services/system/loginItem.js'
import { loadTelemetryBuildConfig } from './services/telemetry/telemetryBuildConfig.js'
import { createRemoteTelemetryRuntime } from './services/telemetry/telemetryRemoteRuntime.js'
import { TelemetryService } from './services/telemetry/telemetryService.js'
import { UpdateService } from './services/update/updateService.js'

type Windows = {
  overlay: BrowserWindow | null
  dashboard: BrowserWindow | null
}

const windows: Windows = {
  overlay: null,
  dashboard: null,
}
let isQuitting = false
let hotkeyCaptureActive = false
let uiohookRunning = false
let overlayHideTimer: NodeJS.Timeout | null = null
let overlayLoaded = false
let lastOverlayState: OverlayViewModel | null = null
let currentDashboardTheme: Settings['theme'] = 'system'
const OVERLAY_WIDTH = 340
const OVERLAY_HEIGHT = 54
const OVERLAY_EXIT_DURATION_MS = 140
const STARTUP_UPDATE_CHECK_DELAY_MS = 12_000
const LETTER_INPUT_WARMUP_DELAY_MS = 1_800
const STABLE_USER_DATA_DIR_NAME = 'Ditado'
const DASHBOARD_TITLEBAR_HEIGHT = 36

const dashboardChrome = {
  dark: {
    backgroundColor: '#0a0e13', // --bg-0: oklch(0.160 0.013 255)
    overlayColor: '#11151b',    // --bg-1: oklch(0.195 0.014 256)
    symbolColor: '#9a9490',
  },
  light: {
    backgroundColor: '#e1e5ea', // --bg-0: oklch(0.920 0.008 255)
    overlayColor: '#d8dde3',    // --bg-1: oklch(0.895 0.010 256)
    symbolColor: '#2f3440',
  },
} as const

const preloadPath = join(app.getAppPath(), 'dist-electron', 'preload', 'preload', 'preload.cjs')

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
}

const createWindowUrl = (kind: WindowKind, tab?: DashboardTab): string => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const query = kind === 'dashboard' && tab ? `?window=${kind}&tab=${tab}` : `?window=${kind}`

  if (devServerUrl) {
    return `${devServerUrl}/${query}`
  }

  return `${pathToFileURL(join(app.getAppPath(), 'dist', 'index.html')).toString()}${query}`
}

const resolveDashboardTheme = (theme: Settings['theme']): 'dark' | 'light' => {
  if (theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  return theme
}

const getPreferredDashboardTab = (settings: Settings): DashboardTab => {
  if (!settings.onboardingCompleted) {
    return 'onboarding'
  }

  if (!settings.apiKeyPresent) {
    return 'settings'
  }

  return 'overview'
}

const isAppReady = (settings: Settings): boolean => (
  settings.onboardingCompleted && settings.apiKeyPresent
)

const applyDashboardChrome = (window: BrowserWindow | null, theme: Settings['theme']): void => {
  if (!window || process.platform === 'darwin') {
    return
  }

  const chrome = dashboardChrome[resolveDashboardTheme(theme)]
  window.setBackgroundColor(chrome.backgroundColor)
  window.setTitleBarOverlay({
    color: chrome.overlayColor,
    symbolColor: chrome.symbolColor,
    height: DASHBOARD_TITLEBAR_HEIGHT,
  })
}

const createOverlayWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: createWindowIcon(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.setIgnoreMouseEvents(true)
  window.webContents.on('did-finish-load', () => {
    overlayLoaded = true
  })

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  void window.loadURL(createWindowUrl('overlay'))
  return window
}

const createDashboardWindow = (tab: DashboardTab = 'overview', theme: Settings['theme'] = currentDashboardTheme): BrowserWindow => {
  const isMac = process.platform === 'darwin'
  const chrome = dashboardChrome[resolveDashboardTheme(theme)]
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isMac ? undefined : {
      color: chrome.overlayColor,
      symbolColor: chrome.symbolColor,
      height: DASHBOARD_TITLEBAR_HEIGHT,
    },
    show: false,
    backgroundColor: chrome.backgroundColor,
    icon: createWindowIcon(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  void window.loadURL(createWindowUrl('dashboard', tab))
  return window
}

const showOverlay = (): void => {
  const overlay = windows.overlay
  if (!overlay) {
    return
  }

  if (!overlayLoaded) {
    overlay.webContents.once('did-finish-load', () => {
      overlayLoaded = true
      showOverlay()
    })
    return
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const posX = Math.round(display.workArea.x + (display.workArea.width - OVERLAY_WIDTH) / 2)
  const posY = Math.round(display.workArea.y + display.workArea.height - OVERLAY_HEIGHT - 22)
  overlay.setBounds({ x: posX, y: posY, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT }, false)
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer)
    overlayHideTimer = null
  }
  overlay.showInactive()
  if (!overlay.isVisible()) {
    overlay.show()
  }
}

const hideOverlay = (): void => {
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer)
    overlayHideTimer = null
  }
  overlayHideTimer = setTimeout(() => {
    windows.overlay?.hide()
    overlayHideTimer = null
  }, OVERLAY_EXIT_DURATION_MS)
}

const dismissOverlay = (): void => {
  if (lastOverlayState?.session) {
    const nextOverlayState = { ...lastOverlayState, session: null }
    lastOverlayState = nextOverlayState
    windows.overlay?.webContents.send(ipcChannels.overlay.state, nextOverlayState)
  }
  hideOverlay()
}

const showDashboard = (tab: DashboardTab = 'overview'): void => {
  if (!windows.dashboard) {
    windows.dashboard = createDashboardWindow(tab, currentDashboardTheme)
  } else {
    void windows.dashboard.loadURL(createWindowUrl('dashboard', tab))
  }

  windows.dashboard.show()
  windows.dashboard.focus()
}

const broadcastState = async (
  store: AppStore,
  orchestrator: DictationSessionOrchestrator,
  permissions: PermissionService,
  telemetry: TelemetryService,
  updates: UpdateService,
): Promise<void> => {
  const permissionState = await permissions.getState().catch(() => defaultPermissionState)
  const session = orchestrator.getSession()
  const overlayState = {
    session,
    settings: store.getSettings(),
    permissions: permissionState,
  }
  lastOverlayState = overlayState
  const dashboardState = {
    session,
    settings: store.getSettings(),
    history: store.getHistory(),
    telemetryTail: await telemetry.tail(),
    permissions: permissionState,
    updateState: updates.getState(),
    appVersion: app.getVersion(),
  }

  windows.overlay?.webContents.send(ipcChannels.overlay.state, overlayState)
  windows.dashboard?.webContents.send(ipcChannels.dashboard.state, dashboardState)
}

void app.whenReady().then(async () => {
  app.setPath('userData', join(app.getPath('appData'), STABLE_USER_DATA_DIR_NAME))
  configureMediaPermissions(session.defaultSession)
  const telemetryBuildConfig = await loadTelemetryBuildConfig()

  const store = new AppStore()
  await store.initialize()
  currentDashboardTheme = store.getSettings().theme

  const permissions = new PermissionService()
  const telemetry = new TelemetryService(
    store,
    createRemoteTelemetryRuntime(telemetryBuildConfig, { appVersion: app.getVersion() }),
  )
  const clipboardService = new ClipboardService()
  const automation = new AutomationService()
  const context = new ActiveContextService(clipboardService)
  const insertion = new InsertionEngine(clipboardService, automation)
  const llm = new OpenRouterService(store)
  const orchestrator = new DictationSessionOrchestrator(store, context, insertion, llm, telemetry, permissions)
  const updates = new UpdateService(store, () => {
    void broadcastState(store, orchestrator, permissions, telemetry, updates)
  })
  await updates.initialize()

  syncLoginItemSettings(app, store.getSettings().launchOnLogin)

  windows.overlay = createOverlayWindow()
  windows.dashboard = createDashboardWindow(
    getPreferredDashboardTab(store.getSettings()),
    currentDashboardTheme,
  )
  windows.dashboard.on('blur', () => { hotkeyCaptureActive = false })
  windows.dashboard.on('hide', () => { hotkeyCaptureActive = false })

  nativeTheme.on('updated', () => {
    if (currentDashboardTheme === 'system') {
      applyDashboardChrome(windows.dashboard, currentDashboardTheme)
    }
  })

  const refreshShortcuts = registerShortcuts(store, orchestrator, () => hotkeyCaptureActive, (running) => { uiohookRunning = running })

  const { refresh: refreshTray } = registerTray(
    {
      openOverview: () => showDashboard(getPreferredDashboardTab(store.getSettings())),
      openHistory: () => showDashboard('history'),
      quit: () => {
        isQuitting = true
        app.quit()
      },
    },
    () => {
      const settings = store.getSettings()
      return {
        pushToTalkHotkey: settings.pushToTalkHotkey,
        toggleHotkey: settings.toggleHotkey,
      }
    },
  )

  registerIpc({
    store,
    orchestrator,
    permissions,
    telemetry,
    updates,
    setHotkeyCaptureActive: (active) => {
      hotkeyCaptureActive = active
    },
    getShortcutStatus: () => ({ captureActive: hotkeyCaptureActive, uiohookRunning }),
    onSettingsChanged: async () => {
      currentDashboardTheme = store.getSettings().theme
      syncLoginItemSettings(app, store.getSettings().launchOnLogin)
      applyDashboardChrome(windows.dashboard, currentDashboardTheme)
      updates.syncFromSettings()
      refreshShortcuts()
      refreshTray()
      await broadcastState(store, orchestrator, permissions, telemetry, updates)
    },
    broadcastState: async () => {
      await broadcastState(store, orchestrator, permissions, telemetry, updates)
    },
    openDashboardTab: (tab) => showDashboard(tab),
    getOverlayWindow: () => windows.overlay,
  })

  orchestrator.subscribe((session) => {
    void broadcastState(store, orchestrator, permissions, telemetry, updates)
    if (!session || session.status === 'idle') {
      hideOverlay()
      return
    }

    showOverlay()

    if (
      session.status === 'completed' ||
      session.status === 'notice' ||
      session.status === 'error' ||
      session.status === 'permission-required'
    ) {
      overlayHideTimer = setTimeout(() => {
        dismissOverlay()
      }, session.status === 'notice' ? 1600 : 1200)
    }
  })

  orchestrator.subscribeHistoryUpdated(() => {
    void broadcastState(store, orchestrator, permissions, telemetry, updates)
  })

  app.on('activate', () => {
    showDashboard(getPreferredDashboardTab(store.getSettings()))
  })

  let shutdownInFlight = false
  app.on('before-quit', (event) => {
    if (updates.isInstallingUpdate()) {
      isQuitting = true
      return
    }

    if (shutdownInFlight) {
      return
    }

    shutdownInFlight = true
    event.preventDefault()
    void shutdownServices({
      store,
      insertion,
      telemetry,
    }).finally(() => {
      isQuitting = true
      app.quit()
    })
  })

  await broadcastState(store, orchestrator, permissions, telemetry, updates)

  // Show "Ditado is ready" notice on startup using the existing overlay system
  const showStartupNotice = (): void => {
    const now = new Date().toISOString()
    const startupSession: DictationSession = {
      id: 'startup',
      activationMode: 'toggle',
      status: 'notice',
      captureIntent: 'none',
      startedAt: now,
      finishedAt: null,
      processingStartedAt: null,
      targetApp: '',
      context: { appName: '', windowTitle: null, selectedText: '', permissionsGranted: false, confidence: 'low', capturedAt: now },
      partialText: '',
      finalText: '',
      insertionPlan: { strategy: 'insert-at-cursor', targetApp: '', capability: 'clipboard' },
      errorMessage: null,
      noticeMessage: 'notices.ready',
    }
    const startupNoticeState: OverlayViewModel = {
      session: startupSession,
      settings: store.getSettings(),
      permissions: defaultPermissionState,
    }
    lastOverlayState = startupNoticeState
    windows.overlay?.webContents.send(ipcChannels.overlay.state, startupNoticeState)
    showOverlay()
    overlayHideTimer = setTimeout(() => {
      dismissOverlay()
    }, 1600)
  }

  const settings = store.getSettings()
  if (isAppReady(settings)) {
    if (overlayLoaded) {
      showStartupNotice()
    } else {
      windows.overlay?.webContents.once('did-finish-load', () => {
        // Small delay to let React mount and register IPC listeners
        setTimeout(showStartupNotice, 150)
      })
    }
  } else {
    showDashboard(getPreferredDashboardTab(settings))
  }

  const runLetterInputWarmup = (): void => {
    if (isQuitting || updates.isInstallingUpdate()) {
      return
    }

    try {
      insertion.warmupLetterInput()
    } catch {
      // Warmup is best-effort; the live insertion path still handles fallback.
    }
  }

  const scheduleLetterInputWarmup = (): void => {
    setTimeout(runLetterInputWarmup, LETTER_INPUT_WARMUP_DELAY_MS)
  }

  if (windows.dashboard?.webContents.isLoadingMainFrame()) {
    windows.dashboard.webContents.once('did-finish-load', scheduleLetterInputWarmup)
  } else {
    scheduleLetterInputWarmup()
  }

  setTimeout(() => {
    void updates.checkForUpdates()
  }, STARTUP_UPDATE_CHECK_DELAY_MS)
})
