import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DictationSession, OverlayViewModel } from '@shared/contracts'
import { createIdleSession, defaultPermissionState, defaultSettings } from '@shared/defaults'
import { useDictationRecorder, useOverlayBridge } from './useDitadoBridge'

const recorderState = {
  recording: false,
  onAudioLevel: null as ((level: number) => void) | null,
  start: vi.fn(async () => {
    recorderState.recording = true
  }),
  stop: vi.fn(async () => {
    recorderState.recording = false
    return {
      audioBase64: 'ZmFrZQ==',
      mimeType: 'audio/mpeg',
      languageHint: 'pt-BR',
      durationMs: 500,
      audioProcessingMs: 18,
      speechDetected: true,
      peakAmplitude: 0.22,
      rmsAmplitude: 0.07,
    }
  }),
  cancel: vi.fn(async () => {
    recorderState.recording = false
  }),
  warmup: vi.fn(async () => undefined),
  setOnAudioLevel: vi.fn((listener: ((level: number) => void) | null) => {
    recorderState.onAudioLevel = listener
  }),
}

vi.mock('@renderer/lib/wavRecorder', () => ({
  MAX_RECORDING_DURATION_MS: 1_000,
  WavRecorder: class {
    start = recorderState.start
    stop = recorderState.stop
    cancel = recorderState.cancel
    warmup = recorderState.warmup
    setOnAudioLevel = recorderState.setOnAudioLevel

    isRecording(): boolean {
      return recorderState.recording
    }
  },
}))

const Harness = ({ session }: { session: DictationSession | null }) => {
  useDictationRecorder(session, null)
  return null
}

const OverlayBridgeHarness = () => {
  const state = useOverlayBridge()
  return <div data-testid="overlay-status">{state.session?.status ?? 'idle'}</div>
}

const buildSession = (overrides: Partial<DictationSession>): DictationSession => ({
  ...createIdleSession(),
  id: 'session-1',
  activationMode: 'push-to-talk',
  status: 'listening',
  captureIntent: 'start',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  targetApp: 'VS Code',
  errorMessage: null,
  noticeMessage: null,
  ...overrides,
})

beforeEach(() => {
  recorderState.recording = false
  recorderState.onAudioLevel = null
  recorderState.start.mockClear()
  recorderState.stop.mockClear()
  recorderState.cancel.mockClear()
  recorderState.warmup.mockClear()
  recorderState.setOnAudioLevel.mockClear()

  window.ditado = {
    getOverlayState: vi.fn(),
    getDashboardState: vi.fn(),
    subscribeOverlayState: vi.fn(() => () => undefined),
    subscribeDashboardState: vi.fn(() => () => undefined),
    subscribeDashboardTabRequests: vi.fn(() => () => undefined),
    startPushToTalk: vi.fn(async () => undefined),
    stopPushToTalk: vi.fn(async () => undefined),
    toggleDictation: vi.fn(async () => undefined),
    cancelDictation: vi.fn(async () => undefined),
    notifyRecorderStarted: vi.fn(async () => undefined),
    notifyRecorderFailed: vi.fn(async () => undefined),
    notifyRecorderReady: vi.fn(async () => undefined),
    notifyRecorderWarmupFinished: vi.fn(async () => undefined),
    updateSettings: vi.fn(),
    setApiKey: vi.fn(),
    setHotkeyCaptureActive: vi.fn(),
    getShortcutStatus: vi.fn(async () => ({ captureActive: false, uiohookRunning: true })),
    subscribeHotkeyCapture: vi.fn(() => () => undefined),
    listMicrophones: vi.fn(),
    requestMicrophoneAccess: vi.fn(),
    getPermissions: vi.fn(),
    openDashboardTab: vi.fn(),
    clearHistory: vi.fn(),
    deleteHistoryEntry: vi.fn(async () => undefined),
    getHistoryAudio: vi.fn(),
    getTelemetryTail: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    openExternalUrl: vi.fn(async () => undefined),
    sendAudioLevel: vi.fn(),
    subscribeAudioLevel: vi.fn(() => () => undefined),
  }
})

describe('useDictationRecorder', () => {
  it('auto-submits after the maximum recording duration exactly once', async () => {
    vi.useFakeTimers()
    render(<Harness session={buildSession({ captureIntent: 'start' })} />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(recorderState.start).toHaveBeenCalledTimes(1)
    expect(window.ditado.notifyRecorderStarted).toHaveBeenCalledWith('session-1')

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.ditado.stopPushToTalk).toHaveBeenCalledTimes(1)
    expect(recorderState.stop).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancels the recorder when a short-press notice replaces the listening session', async () => {
    const { rerender } = render(<Harness session={buildSession({ captureIntent: 'start' })} />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(recorderState.start).toHaveBeenCalledTimes(1)

    await act(async () => {
      rerender(
        <Harness
          session={buildSession({
            status: 'notice',
            captureIntent: 'none',
            finishedAt: new Date().toISOString(),
            noticeMessage: 'Segure para ditar. Toggle: Shift+Alt',
          })}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(recorderState.cancel).toHaveBeenCalledTimes(1)
    expect(window.ditado.stopPushToTalk).not.toHaveBeenCalled()
  })
})

describe('useOverlayBridge', () => {
  it('keeps the newer subscribed overlay session when the initial snapshot resolves late', async () => {
    let resolveInitialState: ((value: OverlayViewModel) => void) | null = null
    let subscriptionListener: ((state: OverlayViewModel) => void) | null = null

    const initialStatePromise = new Promise<OverlayViewModel>((resolve) => {
      resolveInitialState = resolve
    })

    const subscribedState: OverlayViewModel = {
      session: {
        ...createIdleSession(),
        id: 'session-live',
        activationMode: 'push-to-talk',
        status: 'notice',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        targetApp: 'Ditado',
        noticeMessage: 'Segure para ditar. Toggle: Shift+Alt',
      },
      settings: defaultSettings,
      permissions: defaultPermissionState,
    }

    const staleInitialState: OverlayViewModel = {
      session: null,
      settings: defaultSettings,
      permissions: defaultPermissionState,
    }

    window.ditado.getOverlayState = vi.fn(() => initialStatePromise)
    window.ditado.subscribeOverlayState = vi.fn((listener) => {
      subscriptionListener = listener
      return () => undefined
    })

    const view = render(<OverlayBridgeHarness />)

    await act(async () => {
      subscriptionListener?.(subscribedState)
      await Promise.resolve()
    })

    expect(view.getByTestId('overlay-status').textContent).toBe('notice')

    await act(async () => {
      resolveInitialState?.(staleInitialState)
      await Promise.resolve()
    })

    expect(view.getByTestId('overlay-status').textContent).toBe('notice')
  })
})
