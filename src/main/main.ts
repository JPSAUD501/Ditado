import { app, BrowserWindow, ipcMain, nativeTheme, powerMonitor, screen, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElectronSyncoreApp } from 'syncorejs/node/ipc'

import { api } from '../../syncore/_generated/api.js'
import { components, functions, schema } from '../../syncore/_generated/runtime.js'
import crons from '../../syncore/crons.js'
import {
  defaultPermissionState,
  defaultPushToTalkHotkey,
  defaultToggleHotkey,
} from '../shared/defaults.js'
import type { HotkeyCapturePayload } from '../shared/hotkeys.js'
import { translate } from '../shared/i18n.js'
import { ipcChannels } from '../shared/ipc.js'
import { canUseDictation, isAppReady } from '../shared/readiness.js'
import { requiresUpgradeOnboarding } from '../shared/versioning.js'
import type {
  DashboardTab,
  RecorderWarmupStatus,
  Settings,
  WindowKind,
} from '../shared/contracts.js'
import { createWindowIcon } from './bootstrap/appIcon.js'
import { registerIpc } from './bootstrap/registerIpc.js'
import { configureMediaPermissions } from './bootstrap/configureMediaPermissions.js'
import { registerShortcuts, type ShortcutController } from './bootstrap/registerShortcuts.js'
import { registerTray } from './bootstrap/registerTray.js'
import { shutdownServices } from './bootstrap/shutdown.js'
import { AutomationService } from './services/automation/automationService.js'
import { ClipboardService } from './services/clipboard/clipboardService.js'
import { ActiveContextService } from './services/context/activeContextService.js'
import { InsertionEngine } from './services/insertion/insertionEngine.js'
import { OpenRouterService } from './services/llm/openRouterService.js'
import { PermissionService } from './services/permissions/permissionService.js'
import { ApiKeyVault } from './services/secrets/apiKeyVault.js'
import { DictationSessionOrchestrator } from './services/session/dictationSessionOrchestrator.js'
import { SyncoreStateObservers } from './syncore/stateObservers.js'
import { syncLoginItemSettings } from './services/system/loginItem.js'
import { runStartupUpdateFlow } from './services/update/startupUpdateFlow.js'
import { UpdateService } from './services/update/updateService.js'

type Windows = {
  overlay: BrowserWindow | null
  dashboard: BrowserWindow | null
}

const windows: Windows = {
  overlay: null,
  dashboard: null,
}
let syncoreApp: ReturnType<typeof createElectronSyncoreApp> | null = null
let isQuitting = false
let hotkeyCaptureActive = false
let uiohookRunning = false
let overlayHideTimer: NodeJS.Timeout | null = null
let overlayLoaded = false
let onOverlayLoaded: (() => void) | null = null
let dismissSessionNotice: (() => void) | null = null
let currentDashboardTheme: Settings['theme'] = 'system'
const OVERLAY_WIDTH = 420
const OVERLAY_HEIGHT = 54
const OVERLAY_EXIT_DURATION_MS = 140
const STARTUP_UPDATING_NOTICE_DURATION_MS = 900
const STARTUP_UPDATED_NOTICE_DURATION_MS = 1_400
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

const preloadPath = join(app.getAppPath(), 'dist-electron', 'preload', 'src', 'preload', 'preload.cjs')

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

const bindSyncoreWindow = (window: BrowserWindow): void => {
  if (!syncoreApp) {
    return
  }
  void syncoreApp.bindWindow(window).ready
}

const resolveDashboardTheme = (theme: Settings['theme']): 'dark' | 'light' => {
  if (theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  return theme
}

const shouldOpenUpgradeOnboarding = (settings: Settings): boolean =>
  settings.pendingUpgradeOnboardingVersion === app.getVersion()

const getPreferredDashboardTab = (settings: Settings): DashboardTab => {
  if (!settings.onboardingCompleted || shouldOpenUpgradeOnboarding(settings)) {
    return 'onboarding'
  }

  if (!settings.apiKeyPresent) {
    return 'settings'
  }

  return 'overview'
}

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
    onOverlayLoaded?.()
  })

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  bindSyncoreWindow(window)
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

  bindSyncoreWindow(window)
  void window.loadURL(createWindowUrl('dashboard', tab))
  return window
}

const broadcastHotkeyCapture = (payload: HotkeyCapturePayload): void => {
  windows.dashboard?.webContents.send(ipcChannels.hotkeys.captureUpdate, payload)
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
  dismissSessionNotice?.()
  hideOverlay()
}

const runWhenOverlayReady = (callback: () => void): void => {
  const overlay = windows.overlay
  if (!overlay) {
    return
  }

  if (overlayLoaded) {
    callback()
    return
  }

  overlay.webContents.once('did-finish-load', callback)
}

const showDashboard = (tab: DashboardTab = 'overview'): void => {
  if (!windows.dashboard || windows.dashboard.isDestroyed()) {
    windows.dashboard = createDashboardWindow(tab, currentDashboardTheme)
  } else {
    windows.dashboard.webContents.send(ipcChannels.dashboard.openTab, tab)
  }

  if (windows.dashboard.isMinimized()) {
    windows.dashboard.restore()
  }
  windows.dashboard.show()
  windows.dashboard.focus()
}

const broadcastNativeState = async (
  permissions: PermissionService,
  updates: UpdateService,
): Promise<void> => {
  const nativeState = {
    permissions: await permissions.getState().catch(() => defaultPermissionState),
    updateState: updates.getState(),
    appVersion: app.getVersion(),
  }
  windows.dashboard?.webContents.send(ipcChannels.dashboard.nativeState, nativeState)
}

void app.whenReady().then(async () => {
  app.setPath('userData', join(app.getPath('appData'), STABLE_USER_DATA_DIR_NAME))
  configureMediaPermissions(session.defaultSession)

  const apiKeyVault = new ApiKeyVault()
  await apiKeyVault.initialize()
  syncoreApp = createElectronSyncoreApp({
    app,
    ipcMain,
    userDataPath: app.getPath('userData'),
    schema,
    functions,
    components,
    capabilities: { apiKeyVault },
    scheduler: { recurringJobs: crons.jobs },
    appName: 'Ditado',
  })
  await syncoreApp.runtime.start()
  const client = syncoreApp.runtime.createClient()
  await client.mutation(api.settings.ensure, { appVersion: app.getVersion() })
  await client.mutation(api.sessions.finalizeInterruptedActive)

  const storedSettings = await client.query(api.settings.get)
  if (!storedSettings) {
    throw new Error('Syncore settings initialization failed.')
  }
  if (storedSettings.lastSeenAppVersion !== app.getVersion()) {
    const shouldRunUpgradeOnboarding =
      storedSettings.lastSeenAppVersion !== null &&
      requiresUpgradeOnboarding(app.getVersion(), storedSettings.lastSeenAppVersion)
    await client.mutation(api.settings.update, {
      patch: {
        lastSeenAppVersion: app.getVersion(),
        pendingStartupUpdatedNoticeVersion: app.getVersion(),
        pendingUpgradeOnboardingVersion: shouldRunUpgradeOnboarding
          ? app.getVersion()
          : null,
        pushToTalkHotkey: shouldRunUpgradeOnboarding
          ? defaultPushToTalkHotkey
          : storedSettings.pushToTalkHotkey,
        toggleHotkey: shouldRunUpgradeOnboarding
          ? defaultToggleHotkey
          : storedSettings.toggleHotkey,
      },
    })
  }
  await client.mutation(api.maintenance.pruneHistory)

  const observers = new SyncoreStateObservers(client)
  await observers.start()
  const getSettings = (): Settings =>
    observers.getSettings(apiKeyVault.getStatusSnapshot())
  currentDashboardTheme = getSettings().theme
  const shouldShowStartupUpdatedNotice =
    getSettings().pendingStartupUpdatedNoticeVersion === app.getVersion()

  const permissions = new PermissionService()
  const clipboardService = new ClipboardService()
  const automation = new AutomationService()
  const context = new ActiveContextService(clipboardService)
  const insertion = new InsertionEngine(clipboardService, automation)
  const llm = new OpenRouterService(apiKeyVault)
  const orchestrator = new DictationSessionOrchestrator(
    client,
    getSettings,
    () => observers.getSession(),
    context,
    insertion,
    llm,
    permissions,
  )
  dismissSessionNotice = () => {
    void orchestrator.dismissSessionNotice().catch(() => undefined)
  }
  const updates = new UpdateService(getSettings, () => {
    void broadcastNativeState(permissions, updates)
  })
  await updates.initialize()

  const startupWarmupState: {
    required: boolean
    sequenceStarted: boolean
    ready: boolean
    noticeShown: boolean
    updatedNoticeShown: boolean
    recorderRendererReady: boolean
    automationSettled: boolean
    contextSettled: boolean
    audioWarmupStatus: RecorderWarmupStatus | null
    readyNoticeBlockedUntil: number
  } = {
    required: false,
    sequenceStarted: false,
    ready: false,
    noticeShown: false,
    updatedNoticeShown: false,
    recorderRendererReady: false,
    automationSettled: false,
    contextSettled: false,
    audioWarmupStatus: null,
    readyNoticeBlockedUntil: 0,
  }
  const startupUpdateState = {
    complete: false,
  }
  let readyNoticeRetryTimer: NodeJS.Timeout | null = null

  const canStartDictation = (): boolean => (
    canUseDictation(getSettings()) &&
    onboardingDictationEnabled &&
    (!startupWarmupState.required || startupWarmupState.ready)
  )
  let onboardingDictationEnabled =
    getSettings().onboardingCompleted && !shouldOpenUpgradeOnboarding(getSettings())
  let shortcuts: ShortcutController | null = null

  const setHotkeyCaptureMode = (active: boolean): void => {
    if (hotkeyCaptureActive === active) {
      return
    }

    hotkeyCaptureActive = active
    if (!active) {
      broadcastHotkeyCapture({ phase: 'cancel', hotkey: null })
      shortcuts?.refresh()
    }
  }

  syncLoginItemSettings(app, getSettings().launchOnLogin)

  windows.overlay = createOverlayWindow()
  windows.dashboard = createDashboardWindow(
    getPreferredDashboardTab(getSettings()),
    currentDashboardTheme,
  )
  windows.dashboard.on('blur', () => { setHotkeyCaptureMode(false) })
  windows.dashboard.on('hide', () => { setHotkeyCaptureMode(false) })

  nativeTheme.on('updated', () => {
    if (currentDashboardTheme === 'system') {
      applyDashboardChrome(windows.dashboard, currentDashboardTheme)
    }
  })

  const showStartupNotice = (message: string, autoHideAfterMs = 1_600): void => {
    runWhenOverlayReady(() => {
      void orchestrator.showNotice(message)
        .then(() => {
          showOverlay()
          if (overlayHideTimer) {
            clearTimeout(overlayHideTimer)
            overlayHideTimer = null
          }
          if (autoHideAfterMs > 0) {
            overlayHideTimer = setTimeout(() => {
              dismissOverlay()
            }, autoHideAfterMs)
          }
        })
        .catch(() => undefined)
    })
  }

  const maybeFinalizeStartupWarmup = (): void => {
    if (!startupWarmupState.required || startupWarmupState.ready || !startupUpdateState.complete) {
      return
    }

    if (
      !overlayLoaded ||
      !startupWarmupState.recorderRendererReady ||
      !startupWarmupState.automationSettled ||
      !startupWarmupState.contextSettled ||
      startupWarmupState.audioWarmupStatus === null
    ) {
      return
    }

    startupWarmupState.ready = true

    const remainingReadyNoticeBlockMs = startupWarmupState.readyNoticeBlockedUntil - Date.now()
    if (remainingReadyNoticeBlockMs > 0) {
      if (readyNoticeRetryTimer) {
        clearTimeout(readyNoticeRetryTimer)
      }
      readyNoticeRetryTimer = setTimeout(() => {
        readyNoticeRetryTimer = null
        maybeFinalizeStartupWarmup()
      }, remainingReadyNoticeBlockMs + 10)
      return
    }

    if (!startupWarmupState.noticeShown) {
      startupWarmupState.noticeShown = true
      showStartupNotice('notices.ready')
    }
  }

  const beginStartupWarmup = (): void => {
    if (!isAppReady(getSettings()) || startupWarmupState.sequenceStarted) {
      return
    }

    startupWarmupState.required = true
    startupWarmupState.sequenceStarted = true

    void Promise.resolve()
      .then(() => {
        insertion.warmupLetterInput()
      })
      .catch(() => undefined)
      .finally(() => {
        startupWarmupState.automationSettled = true
        maybeFinalizeStartupWarmup()
      })

    void context
      .warmup()
      .catch(() => undefined)
      .finally(() => {
        startupWarmupState.contextSettled = true
        maybeFinalizeStartupWarmup()
      })
  }

  const completeStartupUpdateFlow = (): void => {
    if (startupUpdateState.complete) {
      return
    }

    startupUpdateState.complete = true
    if (shouldShowStartupUpdatedNotice && !startupWarmupState.updatedNoticeShown) {
      startupWarmupState.updatedNoticeShown = true
      startupWarmupState.readyNoticeBlockedUntil = Date.now() + STARTUP_UPDATED_NOTICE_DURATION_MS
      showStartupNotice('notices.updated', STARTUP_UPDATED_NOTICE_DURATION_MS)
      void client.mutation(api.settings.update, {
        patch: { pendingStartupUpdatedNoticeVersion: null },
      }).catch(() => undefined)
    }
    maybeFinalizeStartupWarmup()
  }

  const runStartupUpdateGate = async (): Promise<void> => {
    if (!isAppReady(getSettings())) {
      completeStartupUpdateFlow()
      return
    }

    const result = await runStartupUpdateFlow({
      updates,
      showNotice: (message) => {
        showStartupNotice(
          message,
          message === 'notices.updating' ? STARTUP_UPDATING_NOTICE_DURATION_MS : 0,
        )
      },
    })

    if (result === 'continue') {
      completeStartupUpdateFlow()
    }
  }

  onOverlayLoaded = () => {
    maybeFinalizeStartupWarmup()
  }

  shortcuts = registerShortcuts(
    getSettings,
    () => observers.getSession(),
    orchestrator,
    () => !canStartDictation(),
    (running) => { uiohookRunning = running },
    () => hotkeyCaptureActive,
    broadcastHotkeyCapture,
  )

  const resetShortcutRuntimeState = (): void => {
    shortcuts?.resetRuntimeState({ suppressUntilRelease: true })
  }

  powerMonitor.on('lock-screen', resetShortcutRuntimeState)
  powerMonitor.on('unlock-screen', resetShortcutRuntimeState)
  powerMonitor.on('suspend', resetShortcutRuntimeState)
  powerMonitor.on('resume', resetShortcutRuntimeState)

  const { refresh: refreshTray } = registerTray(
    {
      openOverview: () => showDashboard(getPreferredDashboardTab(getSettings())),
      openHistory: () => showDashboard('history'),
      openSettings: () => showDashboard('settings'),
      quit: () => {
        isQuitting = true
        app.quit()
      },
    },
    () => {
      const settings = getSettings()
      return {
        pushToTalkHotkey: settings.pushToTalkHotkey,
        toggleHotkey: settings.toggleHotkey,
      }
    },
    () => {
      const language = getSettings().language
      const systemLocale = app.getLocale()

      return {
        openApp: translate(language, systemLocale, 'tray.openApp'),
        openHistory: translate(language, systemLocale, 'tray.openHistory'),
        openSettings: translate(language, systemLocale, 'tray.openSettings'),
        version: translate(language, systemLocale, 'tray.version'),
        toggle: translate(language, systemLocale, 'common.toggle'),
        pushToTalk: translate(language, systemLocale, 'common.pushToTalk'),
        quit: translate(language, systemLocale, 'tray.quit'),
      }
    },
    app.getVersion(),
  )

  registerIpc({
    orchestrator,
    permissions,
    updates,
    setHotkeyCaptureActive: (active) => {
      setHotkeyCaptureMode(active)
    },
    getShortcutStatus: () => ({ captureActive: hotkeyCaptureActive, uiohookRunning }),
    canStartDictation,
    setOnboardingDictationEnabled: (enabled) => {
      onboardingDictationEnabled = enabled
      if (!enabled) {
        resetShortcutRuntimeState()
      }
    },
    broadcastNativeState: async () => {
      await broadcastNativeState(permissions, updates)
    },
    openDashboardTab: (tab) => showDashboard(tab),
    getOverlayWindow: () => windows.overlay,
    onRecorderReady: () => {
      startupWarmupState.recorderRendererReady = true
      maybeFinalizeStartupWarmup()
    },
    onRecorderWarmupFinished: (status) => {
      startupWarmupState.audioWarmupStatus = status
      maybeFinalizeStartupWarmup()
    },
  })

  observers.onSettings((settings, previous) => {
    currentDashboardTheme = settings.theme
    syncLoginItemSettings(app, settings.launchOnLogin)
    applyDashboardChrome(windows.dashboard, currentDashboardTheme)
    updates.syncFromSettings()
    shortcuts?.refresh()
    refreshTray()
    if (
      settings.historyRetentionDays !== previous.historyRetentionDays ||
      settings.maxHistoryAudioBytes !== previous.maxHistoryAudioBytes
    ) {
      void client.mutation(api.maintenance.pruneHistory)
    }
    beginStartupWarmup()
  })

  apiKeyVault.subscribe(() => {
    beginStartupWarmup()
  })

  observers.onSession((session) => {
    if (!session) {
      hideOverlay()
      return
    }

    showOverlay()

    if (
      session.status === 'completed' ||
      session.status === 'notice' ||
      session.status === 'error' ||
      session.status === 'permission-required' ||
      session.status === 'cancelled'
    ) {
      overlayHideTimer = setTimeout(() => {
        dismissOverlay()
      }, session.status === 'notice' ? 1600 : 1200)
    }
  })

  app.on('activate', () => {
    showDashboard(getPreferredDashboardTab(getSettings()))
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
    void shutdownServices({ insertion }).finally(() => {
      observers.dispose()
      isQuitting = true
      app.quit()
    })
  })

  await broadcastNativeState(permissions, updates)

  const settings = getSettings()
  if (isAppReady(settings) && !shouldOpenUpgradeOnboarding(settings)) {
    beginStartupWarmup()
    void runStartupUpdateGate()
  } else {
    if (isAppReady(settings)) {
      beginStartupWarmup()
      void runStartupUpdateGate()
    } else {
      completeStartupUpdateFlow()
    }
    showDashboard(getPreferredDashboardTab(settings))
  }
})
