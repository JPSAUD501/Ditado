import { app, BrowserWindow, screen, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { defaultPermissionState } from '../shared/defaults.js'
import { ipcChannels } from '../shared/ipc.js'
import type { DashboardTab, WindowKind } from '../shared/contracts.js'
import { registerIpc } from './bootstrap/registerIpc.js'
import { configureMediaPermissions } from './bootstrap/configureMediaPermissions.js'
import { registerShortcuts } from './bootstrap/registerShortcuts.js'
import { registerTray } from './bootstrap/registerTray.js'
import { AutomationService } from './services/automation/automationService.js'
import { ClipboardService } from './services/clipboard/clipboardService.js'
import { ActiveContextService } from './services/context/activeContextService.js'
import { InsertionEngine } from './services/insertion/insertionEngine.js'
import { InsertionBenchmarkService } from './services/insertion/insertionBenchmarkService.js'
import { OpenRouterService } from './services/llm/openRouterService.js'
import { PermissionService } from './services/permissions/permissionService.js'
import { DictationSessionOrchestrator } from './services/session/dictationSessionOrchestrator.js'
import { AppStore } from './services/store/appStore.js'
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
const OVERLAY_WIDTH = 280
const OVERLAY_HEIGHT = 54
const STARTUP_UPDATE_CHECK_DELAY_MS = 12_000
const STABLE_USER_DATA_DIR_NAME = 'Ditado'

const preloadPath = join(app.getAppPath(), 'dist-electron', 'preload', 'preload', 'preload.cjs')

const createWindowUrl = (kind: WindowKind, tab?: DashboardTab): string => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const query = kind === 'dashboard' && tab ? `?window=${kind}&tab=${tab}` : `?window=${kind}`

  if (devServerUrl) {
    return `${devServerUrl}/${query}`
  }

  return `${pathToFileURL(join(app.getAppPath(), 'dist', 'index.html')).toString()}${query}`
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
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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

const createDashboardWindow = (tab: DashboardTab = 'overview'): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 1040,
    minHeight: 760,
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#040916',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
  windows.overlay?.hide()
}

const showDashboard = (tab: DashboardTab = 'overview'): void => {
  if (!windows.dashboard) {
    windows.dashboard = createDashboardWindow(tab)
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
  const dashboardState = {
    session,
    settings: store.getSettings(),
    history: store.getHistory(),
    telemetryTail: await telemetry.tail(),
    permissions: permissionState,
    updateState: updates.getState(),
  }

  windows.overlay?.webContents.send(ipcChannels.overlay.state, overlayState)
  windows.dashboard?.webContents.send(ipcChannels.dashboard.state, dashboardState)
}

void app.whenReady().then(async () => {
  app.setPath('userData', join(app.getPath('appData'), STABLE_USER_DATA_DIR_NAME))
  configureMediaPermissions(session.defaultSession)

  const store = new AppStore()
  await store.initialize()

  const permissions = new PermissionService()
  const telemetry = new TelemetryService(store)
  const clipboardService = new ClipboardService()
  const automation = new AutomationService()
  const context = new ActiveContextService(clipboardService)
  const insertion = new InsertionEngine(clipboardService, automation)
  const benchmark = new InsertionBenchmarkService(insertion, context)
  const llm = new OpenRouterService(store)
  const orchestrator = new DictationSessionOrchestrator(store, context, insertion, llm, telemetry, permissions)
  const updates = new UpdateService(store, () => {
    void broadcastState(store, orchestrator, permissions, telemetry, updates)
  })
  await updates.initialize()

  app.setLoginItemSettings({ openAtLogin: store.getSettings().launchOnLogin })

  windows.overlay = createOverlayWindow()
  windows.dashboard = createDashboardWindow(store.getSettings().onboardingCompleted ? 'overview' : 'onboarding')
  windows.dashboard.on('blur', () => { hotkeyCaptureActive = false })
  windows.dashboard.on('hide', () => { hotkeyCaptureActive = false })

  const refreshShortcuts = registerShortcuts(store, orchestrator, () => hotkeyCaptureActive, (running) => { uiohookRunning = running })

  registerTray({
    openOverview: () => showDashboard('overview'),
    openHistory: () => showDashboard('history'),
    showOverlay: () => showOverlay(),
    quit: () => {
      isQuitting = true
      app.quit()
    },
  })

  registerIpc({
    store,
    orchestrator,
    permissions,
    telemetry,
    updates,
    benchmark,
    setHotkeyCaptureActive: (active) => {
      hotkeyCaptureActive = active
    },
    getShortcutStatus: () => ({ captureActive: hotkeyCaptureActive, uiohookRunning }),
    onSettingsChanged: async () => {
      app.setLoginItemSettings({ openAtLogin: store.getSettings().launchOnLogin })
      updates.syncFromSettings()
      refreshShortcuts()
      await broadcastState(store, orchestrator, permissions, telemetry, updates)
    },
    broadcastState: async () => {
      await broadcastState(store, orchestrator, permissions, telemetry, updates)
    },
    openDashboardTab: (tab) => showDashboard(tab),
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
        hideOverlay()
      }, session.status === 'notice' ? 1600 : 1200)
    }
  })

  app.on('activate', () => {
    showDashboard(store.getSettings().onboardingCompleted ? 'overview' : 'onboarding')
  })

  let shutdownInFlight = false
  app.on('before-quit', (event) => {
    if (shutdownInFlight) {
      return
    }

    shutdownInFlight = true
    event.preventDefault()
    void Promise.allSettled([
      store.flush(),
      insertion.dispose(),
    ]).finally(() => {
      isQuitting = true
      app.quit()
    })
  })

  await broadcastState(store, orchestrator, permissions, telemetry, updates)
  setTimeout(() => {
    void updates.checkForUpdates()
  }, STARTUP_UPDATE_CHECK_DELAY_MS)
})
