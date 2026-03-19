import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import i18n from '@renderer/i18n'
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
    permissionsGranted: false,
    confidence: 'low',
    capturedAt: new Date().toISOString(),
  },
  partialText: '',
  finalText: '',
  insertionPlan: {
    strategy: 'insert-at-cursor',
    targetApp: 'Ditado',
    capability: 'automation',
  },
  errorMessage: null,
  noticeMessage: 'Segure para ditar. Toggle: Shift+Alt',
  processingStartedAt: null,
}

const toggleSession: DictationSession = {
  ...noticeSession,
  id: 'session-2',
  activationMode: 'toggle',
  status: 'listening',
  noticeMessage: null,
  targetApp: 'VS Code',
}

const unknownAppSession: DictationSession = {
  ...toggleSession,
  id: 'session-3',
  targetApp: 'Unknown App',
  context: {
    ...toggleSession.context,
    appName: 'Unknown App',
  },
}

const noSpeechNoticeSession: DictationSession = {
  ...noticeSession,
  id: 'session-4',
  noticeMessage: 'notices.noSpeechDetected',
}

const installOverlayApi = (session: DictationSession | null): void => {
  window.ditado = {
    getOverlayState: vi.fn(async () => ({
      session,
      settings: defaultSettings,
      permissions: defaultPermissionState,
    })),
    getDashboardState: vi.fn(),
    subscribeOverlayState: vi.fn((listener) => {
      listener({
        session,
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
    notifyRecorderStarted: vi.fn(async () => undefined),
    notifyRecorderFailed: vi.fn(async () => undefined),
    notifyRecorderReady: vi.fn(async () => undefined),
    notifyRecorderWarmupFinished: vi.fn(async () => undefined),
    updateSettings: vi.fn(async () => defaultSettings),
    setApiKey: vi.fn(async () => defaultSettings),
    setHotkeyCaptureActive: vi.fn(async () => undefined),
    getShortcutStatus: vi.fn(async () => ({ captureActive: false, uiohookRunning: true })),
    listMicrophones: vi.fn(async () => []),
    requestMicrophoneAccess: vi.fn(async () => defaultPermissionState),
    getPermissions: vi.fn(async () => defaultPermissionState),
    openDashboardTab: vi.fn(async () => undefined),
    clearHistory: vi.fn(async () => undefined),
    deleteHistoryEntry: vi.fn(async () => undefined),
    getHistoryAudio: vi.fn(async () => null),
    getTelemetryTail: vi.fn(async () => []),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    openExternalUrl: vi.fn(async () => undefined),
    sendAudioLevel: vi.fn(),
    subscribeAudioLevel: vi.fn(() => () => undefined),
  }
}

describe('OverlayWindow', () => {
  it('renders the translated no speech notice without falling back to the raw key', async () => {
    installOverlayApi(noSpeechNoticeSession)
    render(<OverlayWindow />)

    expect(await screen.findByText(i18n.t('notices.noSpeechDetected'))).toBeInTheDocument()
    expect(screen.queryByText('notices.noSpeechDetected')).toBeNull()
  })

  it('renders nothing while there is no active dictation session', async () => {
    installOverlayApi(null)

    const { container } = render(<OverlayWindow />)

    await waitFor(() => {
      expect(container.querySelector('.overlay-shell')).toBeInTheDocument()
      expect(container.querySelector('.overlay-chip')).toBeNull()
    })
    expect(screen.queryByText(/listening|ready|done|error/i)).toBeNull()
  })

  it('renders the short-press hint when the session is in notice state', async () => {
    installOverlayApi(noticeSession)
    render(<OverlayWindow />)

    expect(await screen.findByText(/toggle: shift\+alt/i)).toBeInTheDocument()
    const chip = document.querySelector('.overlay-chip')
    expect(chip).toHaveAttribute('data-mode', 'push-to-talk')
    expect(chip).toHaveAttribute('data-status', 'notice')
  })

  it('shows a distinct mode indicator for toggle dictation', async () => {
    installOverlayApi(toggleSession)
    render(<OverlayWindow />)

    await waitFor(() => {
      const chip = document.querySelector('.overlay-chip')
      expect(chip).toHaveAttribute('data-mode', 'toggle')
      expect(chip).toHaveAttribute('data-status', 'listening')
    })
  })

  it('renders App instead of Unknown App', async () => {
    installOverlayApi(unknownAppSession)
    render(<OverlayWindow />)

    expect(await screen.findByText('App')).toBeInTheDocument()
    expect(screen.queryByText('Unknown App')).toBeNull()
  })
})
