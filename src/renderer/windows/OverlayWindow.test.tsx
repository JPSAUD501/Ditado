import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OverlayWindow } from './OverlayWindow'
import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import type { DictationSession } from '@shared/contracts'

const noticeSession: DictationSession = {
  id: 'session-1',
  activationMode: 'push-to-talk',
  status: 'notice',
  captureIntent: 'none',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  targetApp: 'Ditado',
  context: {
    appName: 'Ditado',
    windowTitle: null,
    selectedText: '',
    textBefore: '',
    textAfter: '',
    permissionsGranted: false,
    confidence: 'low',
    capturedAt: new Date().toISOString(),
  },
  partialText: '',
  finalText: '',
  insertionPlan: {
    strategy: 'clipboard-fallback',
    targetApp: 'Ditado',
    capability: 'clipboard-only',
  },
  errorMessage: null,
  noticeMessage: 'Segure para ditar. Toggle: Shift+Alt',
}

const toggleSession: DictationSession = {
  ...noticeSession,
  id: 'session-2',
  activationMode: 'toggle',
  status: 'listening',
  noticeMessage: null,
  targetApp: 'VS Code',
}

describe('OverlayWindow', () => {
  it('renders nothing while there is no active dictation session', async () => {
    window.ditado = {
      getOverlayState: vi.fn(async () => ({
        session: null,
        settings: defaultSettings,
        permissions: defaultPermissionState,
      })),
      getDashboardState: vi.fn(),
      subscribeOverlayState: vi.fn((listener) => {
        listener({
          session: null,
          settings: defaultSettings,
          permissions: defaultPermissionState,
        })
        return () => undefined
      }),
      subscribeDashboardState: vi.fn(() => () => undefined),
      startPushToTalk: vi.fn(async () => undefined),
      stopPushToTalk: vi.fn(async () => undefined),
      toggleDictation: vi.fn(async () => undefined),
      cancelDictation: vi.fn(async () => undefined),
      updateSettings: vi.fn(async () => defaultSettings),
      setApiKey: vi.fn(async () => defaultSettings),
      setHotkeyCaptureActive: vi.fn(async () => undefined),
      listMicrophones: vi.fn(async () => []),
      requestMicrophoneAccess: vi.fn(async () => defaultPermissionState),
      getPermissions: vi.fn(async () => defaultPermissionState),
      openDashboardTab: vi.fn(async () => undefined),
      clearHistory: vi.fn(async () => undefined),
      getHistoryAudio: vi.fn(async () => null),
      getTelemetryTail: vi.fn(async () => []),
      checkForUpdates: vi.fn(async () => undefined),
    }

    const { container } = render(<OverlayWindow />)

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
    expect(screen.queryByText(/listening|ready|done|fallback/i)).toBeNull()
  })

  it('renders the short-press hint when the session is in notice state', async () => {
    window.ditado = {
      getOverlayState: vi.fn(async () => ({
        session: noticeSession,
        settings: defaultSettings,
        permissions: defaultPermissionState,
      })),
      getDashboardState: vi.fn(),
      subscribeOverlayState: vi.fn((listener) => {
        listener({
          session: noticeSession,
          settings: defaultSettings,
          permissions: defaultPermissionState,
        })
        return () => undefined
      }),
      subscribeDashboardState: vi.fn(() => () => undefined),
      startPushToTalk: vi.fn(async () => undefined),
      stopPushToTalk: vi.fn(async () => undefined),
      toggleDictation: vi.fn(async () => undefined),
      cancelDictation: vi.fn(async () => undefined),
      updateSettings: vi.fn(async () => defaultSettings),
      setApiKey: vi.fn(async () => defaultSettings),
      setHotkeyCaptureActive: vi.fn(async () => undefined),
      listMicrophones: vi.fn(async () => []),
      requestMicrophoneAccess: vi.fn(async () => defaultPermissionState),
      getPermissions: vi.fn(async () => defaultPermissionState),
      openDashboardTab: vi.fn(async () => undefined),
      clearHistory: vi.fn(async () => undefined),
      getHistoryAudio: vi.fn(async () => null),
      getTelemetryTail: vi.fn(async () => []),
      checkForUpdates: vi.fn(async () => undefined),
    }

    render(<OverlayWindow />)

    expect(await screen.findByText(/toggle: shift\+alt/i)).toBeInTheDocument()
    expect(screen.getByText(/tip/i)).toBeInTheDocument()
    expect(screen.getByText('Hold')).toBeInTheDocument()
  })

  it('shows a distinct mode label for toggle dictation', async () => {
    window.ditado = {
      getOverlayState: vi.fn(async () => ({
        session: toggleSession,
        settings: defaultSettings,
        permissions: defaultPermissionState,
      })),
      getDashboardState: vi.fn(),
      subscribeOverlayState: vi.fn((listener) => {
        listener({
          session: toggleSession,
          settings: defaultSettings,
          permissions: defaultPermissionState,
        })
        return () => undefined
      }),
      subscribeDashboardState: vi.fn(() => () => undefined),
      startPushToTalk: vi.fn(async () => undefined),
      stopPushToTalk: vi.fn(async () => undefined),
      toggleDictation: vi.fn(async () => undefined),
      cancelDictation: vi.fn(async () => undefined),
      updateSettings: vi.fn(async () => defaultSettings),
      setApiKey: vi.fn(async () => defaultSettings),
      setHotkeyCaptureActive: vi.fn(async () => undefined),
      listMicrophones: vi.fn(async () => []),
      requestMicrophoneAccess: vi.fn(async () => defaultPermissionState),
      getPermissions: vi.fn(async () => defaultPermissionState),
      openDashboardTab: vi.fn(async () => undefined),
      clearHistory: vi.fn(async () => undefined),
      getHistoryAudio: vi.fn(async () => null),
      getTelemetryTail: vi.fn(async () => []),
      checkForUpdates: vi.fn(async () => undefined),
    }

    render(<OverlayWindow />)

    expect(await screen.findByText('Toggle')).toBeInTheDocument()
    expect(screen.getByText(/listening/i)).toBeInTheDocument()
  })
})
