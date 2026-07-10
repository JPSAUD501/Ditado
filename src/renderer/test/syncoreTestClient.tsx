import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { SyncoreProvider } from 'syncorejs/react'
import type { SyncoreClient, SyncoreWatch } from 'syncorejs'
import { vi } from 'vitest'

import { defaultPermissionState, defaultSettings, defaultUpdateState } from '@shared/defaults'
import type {
  DashboardNativeState,
  DictationSession,
  HistoryEntry,
  Settings,
  SettingsDocument,
  SettingsPatch,
} from '@shared/contracts'

type FunctionReferenceShape = { name?: string }
type QueryArgsShape = {
  sessionId?: string
  query?: string
  paginationOpts?: { numItems: number }
}

export type SyncoreTestState = {
  settings: Settings
  session: DictationSession | null
  history: HistoryEntry[]
  native: DashboardNativeState
}

export const syncoreTestStateEvent = 'syncore-test-state'

const initialState = (): SyncoreTestState => ({
  settings: { ...defaultSettings, onboardingCompleted: true },
  session: null,
  history: [],
  native: {
    permissions: defaultPermissionState,
    updateState: defaultUpdateState,
    appVersion: '0.0.0-test',
  },
})

let state = initialState()

export const syncoreTestCalls = {
  settingsUpdate: vi.fn<(patch: SettingsPatch) => void>(),
  historyClear: vi.fn<() => void>(),
  historyRemove: vi.fn<(sessionId: string) => void>(),
  secretSet: vi.fn<(apiKey: string) => void>(),
}

export const resetSyncoreTestState = (next: Partial<SyncoreTestState> = {}): void => {
  state = { ...initialState(), ...next }
  syncoreTestCalls.settingsUpdate.mockClear()
  syncoreTestCalls.historyClear.mockClear()
  syncoreTestCalls.historyRemove.mockClear()
  syncoreTestCalls.secretSet.mockClear()
}

export const updateSyncoreTestState = (next: Partial<SyncoreTestState>): void => {
  state = { ...state, ...next }
  window.dispatchEvent(new Event(syncoreTestStateEvent))
}

const toSettingsDocument = (settings: Settings): SettingsDocument => {
  const { apiKeyPresent, ...stored } = settings
  void apiKeyPresent
  return {
    _id: 'settings:test' as SettingsDocument['_id'],
    _creationTime: 1,
    key: 'app',
    updatedAt: 1,
    ...stored,
  }
}

const readyStatus = {
  kind: 'ready',
  capabilities: {
    storage: { available: true, protocol: 'file', supportsRange: true },
  },
} as const

const readQueryValue = (reference: unknown, args?: unknown): unknown => {
  const name = (reference as FunctionReferenceShape).name
  const queryArgs = args as QueryArgsShape | undefined
  switch (name) {
    case 'settings/get':
      return toSettingsDocument(state.settings)
    case 'sessions/active':
      return state.session
    case 'history/page': {
      const count = queryArgs?.paginationOpts?.numItems ?? state.history.length
      return {
        page: state.history.slice(0, count),
        isDone: state.history.length <= count,
        cursor: state.history.length > count ? String(count) : null,
      }
    }
    case 'history/search': {
      const search = queryArgs?.query?.trim().toLowerCase() ?? ''
      return state.history.filter((entry) => entry.searchText.toLowerCase().includes(search))
    }
    case 'history/stats':
      return {
        total: state.history.length,
        completed: state.history.filter((entry) => entry.outcome === 'completed').length,
        errors: state.history.filter((entry) => entry.outcome === 'error').length,
        totalAudioMs: state.history.reduce((sum, entry) => sum + entry.audio.durationMs, 0),
        totalCharacters: state.history.reduce((sum, entry) => sum + entry.outputText.length, 0),
        averageLatencyMs: 0,
        topApps: [],
        weekActivity: Array(7).fill(0),
      }
    case 'history/audio':
      return queryArgs?.sessionId
        ? { mimeType: 'audio/wav', base64: 'UklGRg==' }
        : null
    default:
      return null
  }
}

const runMutation = async (reference: unknown, args?: unknown): Promise<unknown> => {
  const name = (reference as FunctionReferenceShape).name
  if (name === 'settings/update') {
    const patch = (args as { patch: SettingsPatch }).patch
    syncoreTestCalls.settingsUpdate(patch)
    state = { ...state, settings: { ...state.settings, ...patch } }
    window.dispatchEvent(new Event(syncoreTestStateEvent))
    return toSettingsDocument(state.settings)
  }
  if (name === 'history/clear') {
    syncoreTestCalls.historyClear()
    state = { ...state, history: [] }
    window.dispatchEvent(new Event(syncoreTestStateEvent))
    return { deletedEntries: 0, deletedAudio: 0 }
  }
  if (name === 'history/remove') {
    const sessionId = (args as { sessionId: string }).sessionId
    syncoreTestCalls.historyRemove(sessionId)
    state = { ...state, history: state.history.filter((entry) => entry.sessionId !== sessionId) }
    window.dispatchEvent(new Event(syncoreTestStateEvent))
    return { deleted: true }
  }
  return null
}

const runAction = async (reference: unknown, args?: unknown): Promise<unknown> => {
  const name = (reference as FunctionReferenceShape).name
  if (name === 'secrets/status') {
    return { present: state.settings.apiKeyPresent }
  }
  if (name === 'secrets/set') {
    const apiKey = (args as { apiKey: string }).apiKey
    syncoreTestCalls.secretSet(apiKey)
    state = { ...state, settings: { ...state.settings, apiKeyPresent: Boolean(apiKey.trim()) } }
    window.dispatchEvent(new Event(syncoreTestStateEvent))
    return { present: state.settings.apiKeyPresent }
  }
  return null
}

const watch = <T,>(read: () => T): SyncoreWatch<T> => ({
  localQueryResult: read,
  localQueryError: () => undefined,
  onUpdate: (listener: () => void) => {
    listener()
    window.addEventListener(syncoreTestStateEvent, listener)
    return () => window.removeEventListener(syncoreTestStateEvent, listener)
  },
  dispose: () => undefined,
})

export const createSyncoreTestClient = (): SyncoreClient => {
  const client = {
    query: async (reference: unknown, args?: unknown) => readQueryValue(reference, args),
    mutation: runMutation,
    action: runAction,
    watchQuery: (reference: unknown, args?: unknown) => watch(() => readQueryValue(reference, args)),
    watchRuntimeStatus: () => watch(() => readyStatus),
  }
  return client as SyncoreClient
}

export const installTestDesktopApi = (): void => {
  window.ditado = {
    getDashboardNativeState: vi.fn(async () => state.native),
    subscribeDashboardNativeState: vi.fn(() => () => undefined),
    subscribeDashboardTabRequests: vi.fn(() => () => undefined),
    startPushToTalk: vi.fn(async () => undefined),
    stopPushToTalk: vi.fn(async () => undefined),
    toggleDictation: vi.fn(async () => undefined),
    cancelDictation: vi.fn(async () => undefined),
    setOnboardingDictationEnabled: vi.fn(async () => undefined),
    notifyRecorderStarted: vi.fn(async () => undefined),
    notifyRecorderFailed: vi.fn(async () => undefined),
    notifyRecorderReady: vi.fn(async () => undefined),
    notifyRecorderWarmupFinished: vi.fn(async () => undefined),
    setHotkeyCaptureActive: vi.fn(async () => undefined),
    getShortcutStatus: vi.fn(async () => ({ captureActive: false, uiohookRunning: true })),
    subscribeHotkeyCapture: vi.fn(() => () => undefined),
    listMicrophones: vi.fn(async () => []),
    requestMicrophoneAccess: vi.fn(async () => state.native.permissions),
    getPermissions: vi.fn(async () => state.native.permissions),
    openDashboardTab: vi.fn(async () => undefined),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    openExternalUrl: vi.fn(async () => undefined),
    sendAudioLevel: vi.fn(),
    subscribeAudioLevel: vi.fn(() => () => undefined),
  }
}

export const renderWithSyncore = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult => {
  const client = createSyncoreTestClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SyncoreProvider client={client}>{children}</SyncoreProvider>
  )
  return render(ui, { ...options, wrapper: Wrapper })
}
