import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DictationSession } from '@shared/contracts'
import { createIdleSession } from '@shared/defaults'
import { useDictationRecorder } from './useDitadoBridge'

const recorderState = {
  recording: false,
  start: vi.fn(async () => {
    recorderState.recording = true
  }),
  stop: vi.fn(async () => {
    recorderState.recording = false
    return {
      wavBase64: 'ZmFrZQ==',
      mimeType: 'audio/wav',
      languageHint: 'pt-BR',
      durationMs: 500,
      speechDetected: true,
      peakAmplitude: 0.22,
      rmsAmplitude: 0.07,
    }
  }),
  cancel: vi.fn(async () => {
    recorderState.recording = false
  }),
}

vi.mock('@renderer/lib/wavRecorder', () => ({
  MAX_RECORDING_DURATION_MS: 1_000,
  WavRecorder: class {
    start = recorderState.start
    stop = recorderState.stop
    cancel = recorderState.cancel

    isRecording(): boolean {
      return recorderState.recording
    }
  },
}))

const Harness = ({ session }: { session: DictationSession | null }) => {
  useDictationRecorder(session, null)
  return null
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
  recorderState.start.mockClear()
  recorderState.stop.mockClear()
  recorderState.cancel.mockClear()

  window.ditado = {
    getOverlayState: vi.fn(),
    getDashboardState: vi.fn(),
    subscribeOverlayState: vi.fn(() => () => undefined),
    subscribeDashboardState: vi.fn(() => () => undefined),
    startPushToTalk: vi.fn(async () => undefined),
    stopPushToTalk: vi.fn(async () => undefined),
    toggleDictation: vi.fn(async () => undefined),
    cancelDictation: vi.fn(async () => undefined),
    notifyRecorderStarted: vi.fn(async () => undefined),
    notifyRecorderFailed: vi.fn(async () => undefined),
    updateSettings: vi.fn(),
    setApiKey: vi.fn(),
    benchmarkInsertion: vi.fn(),
    setHotkeyCaptureActive: vi.fn(),
    getShortcutStatus: vi.fn(async () => ({ captureActive: false, uiohookRunning: true })),
    listMicrophones: vi.fn(),
    requestMicrophoneAccess: vi.fn(),
    getPermissions: vi.fn(),
    openDashboardTab: vi.fn(),
    clearHistory: vi.fn(),
    getHistoryAudio: vi.fn(),
    getTelemetryTail: vi.fn(),
    checkForUpdates: vi.fn(),
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
