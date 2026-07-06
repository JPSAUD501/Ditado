import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { SyncoreProvider } from 'syncorejs/react'
import type { SyncoreClient, SyncoreWatch } from 'syncorejs'

import { defaultSettings } from '@shared/defaults'
import type { DashboardViewModel, DictationSession } from '@shared/contracts'

type FunctionReferenceShape = {
  name?: string
}

type QueryArgsShape = {
  sessionId?: string
  paginationOpts?: {
    numItems: number
  }
}

type SyncoreTestWindow = Window & {
  __syncoreDashboardState?: DashboardViewModel
  __syncoreActiveSession?: DictationSession | null
}

export const syncoreTestStateEvent = 'syncore-test-state'

const readyStatus = {
  kind: 'ready',
  capabilities: {
    storage: {
      available: true,
      protocol: 'file',
      supportsRange: true,
    },
  },
} as const

const readDashboardState = (): DashboardViewModel | null =>
  (window as SyncoreTestWindow).__syncoreDashboardState ?? null

const readActiveSession = (): DictationSession | null =>
  (window as SyncoreTestWindow).__syncoreActiveSession ?? null

const toSyncoreHistoryEntry = (entry: DashboardViewModel['history'][number]) => ({
  ...entry,
  sessionId: entry.id,
  createdAtMs: Date.parse(entry.createdAt),
  audio: {
    filePath: entry.audioFilePath,
    durationMs: entry.audioDurationMs,
    mimeType: entry.audioMimeType,
    bytes: entry.audioBytes,
    speechDetected: entry.audio.speechDetected,
    peakAmplitude: entry.audio.peakAmplitude,
    rmsAmplitude: entry.audio.rmsAmplitude,
    languageHint: entry.audio.languageHint,
    stopReason: entry.audio.stopReason,
    maxDurationReached: entry.audio.maxDurationReached,
  },
})

const readQueryValue = (reference: unknown, args?: unknown): unknown => {
  const name = (reference as FunctionReferenceShape).name
  const queryArgs = args as QueryArgsShape | undefined
  const state = readDashboardState()
  switch (name) {
    case 'settings/get':
      return state?.settings ?? defaultSettings
    case 'history/list':
      return state?.history.map(toSyncoreHistoryEntry) ?? []
    case 'history/page': {
      const results = state?.history.map(toSyncoreHistoryEntry) ?? []
      const count = queryArgs?.paginationOpts?.numItems ?? results.length
      return {
        page: results.slice(0, count),
        isDone: results.length <= count,
        cursor: results.length > count ? String(count) : null,
      }
    }
    case 'history/audio':
      return queryArgs?.sessionId ? { mimeType: 'audio/webm', base64: 'UklGRg==' } : null
    case 'sessions/active':
      return readActiveSession()
    default:
      return null
  }
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

export const createSyncoreTestClient = (): SyncoreClient => ({
  query: async (reference: unknown, args?: unknown) => readQueryValue(reference, args),
  mutation: async () => null,
  action: async () => null,
  watchQuery: (reference: unknown, args?: unknown) => watch(() => readQueryValue(reference, args)),
  watchRuntimeStatus: () => watch(() => readyStatus),
}) as unknown as SyncoreClient

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
