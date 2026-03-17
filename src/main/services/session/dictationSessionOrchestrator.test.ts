import { describe, expect, it, vi } from 'vitest'

import { DictationSessionOrchestrator } from './dictationSessionOrchestrator.js'
import type {
  ContextSnapshot,
  DictationAudioPayload,
  DictationSession,
  LlmRequest,
  LlmResponse,
  Settings,
} from '../../../shared/contracts.js'
import { defaultSettings, emptyContextSnapshot } from '../../../shared/defaults.js'

const context: ContextSnapshot = {
  ...emptyContextSnapshot,
  appName: 'VS Code',
  selectedText: 'old line',
  confidence: 'high',
  permissionsGranted: true,
  capturedAt: new Date().toISOString(),
}

const settings: Settings = {
  ...defaultSettings,
  sendContextAutomatically: true,
  modelId: 'google/gemini-3-flash-preview',
}

const createPayload = (): DictationAudioPayload => ({
  wavBase64: 'ZmFrZQ==',
  mimeType: 'audio/wav',
  languageHint: 'en-US',
  durationMs: 1400,
  speechDetected: true,
  peakAmplitude: 0.18,
  rmsAmplitude: 0.06,
})

const createTelemetryDouble = () => ({
  startSession: vi.fn(async () => undefined),
  annotateSession: vi.fn(async () => undefined),
  sessionEvent: vi.fn(() => undefined),
  metric: vi.fn(async () => undefined),
  error: vi.fn(async () => undefined),
  finishSession: vi.fn(async () => undefined),
  shutdown: vi.fn(async () => undefined),
})

const createStoreDouble = (
  overrides: Partial<{
    appendHistoryWithAudio: ReturnType<typeof vi.fn>
    getSettings: () => Settings
  }> = {},
) => ({
  getSettings: overrides.getSettings ?? (() => settings),
  appendHistoryWithAudio: overrides.appendHistoryWithAudio ?? vi.fn(async () => undefined),
})

const createProgressiveSessionDouble = (
  overrides: Partial<{
    append: ReturnType<typeof vi.fn>
    finalize: ReturnType<typeof vi.fn>
    warmup: ReturnType<typeof vi.fn>
    recoverToClipboard: ReturnType<typeof vi.fn>
    cancel: ReturnType<typeof vi.fn>
    getExecutionReport: ReturnType<typeof vi.fn>
  }> = {},
) => ({
  append: overrides.append ?? vi.fn(async () => undefined),
  finalize:
    overrides.finalize ??
    vi.fn(async () => ({
      requestedMode: 'letter-by-letter' as const,
      effectiveMode: 'letter-by-letter' as const,
      insertionMethod: 'clipboard-all-at-once' as const,
      fallbackUsed: false,
    })),
  warmup: overrides.warmup ?? vi.fn(async () => undefined),
  recoverToClipboard: overrides.recoverToClipboard ?? vi.fn(async () => undefined),
  cancel: overrides.cancel ?? vi.fn(() => undefined),
  getExecutionReport:
    overrides.getExecutionReport ??
    vi.fn(() => ({
      requestedMode: 'letter-by-letter' as const,
      effectiveMode: 'letter-by-letter' as const,
      insertionMethod: 'clipboard-all-at-once' as const,
      fallbackUsed: false,
    })),
})

const createInsertionEngineDouble = (
  overrides: Partial<{
    createPlan: ReturnType<typeof vi.fn>
    createProgressiveSession: ReturnType<typeof vi.fn>
    warmupLetterInput: ReturnType<typeof vi.fn>
  }> = {},
) => ({
  createPlan:
    overrides.createPlan ??
    vi.fn(() => ({
      strategy: 'replace-selection',
      targetApp: 'VS Code',
      capability: 'clipboard',
    })),
  warmupLetterInput: overrides.warmupLetterInput ?? vi.fn(() => undefined),
  createProgressiveSession: overrides.createProgressiveSession ?? vi.fn(() => createProgressiveSessionDouble()),
})

describe('DictationSessionOrchestrator', () => {
  it('starts armed, updates the target app, and only switches to listening after the recorder confirms start', async () => {
    const sessions: Array<DictationSession | null> = []
    const capture = vi.fn(async () => context)
    const telemetry = createTelemetryDouble()

    const orchestrator = new DictationSessionOrchestrator(
      createStoreDouble() as never,
      { capture } as never,
      createInsertionEngineDouble() as never,
      { stream: vi.fn() } as never,
      telemetry as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => sessions.push(session))
    await orchestrator.startCapture('toggle')

    expect(sessions.at(-1)?.status).toBe('arming')
    expect(capture).toHaveBeenCalledWith(true, true)
    expect(sessions.at(-1)?.targetApp).toBe('VS Code')
    expect(telemetry.startSession).toHaveBeenCalledTimes(1)
    expect(telemetry.metric).toHaveBeenCalledWith('dictation-started', { mode: 'toggle' }, expect.any(Object))

    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }
    orchestrator.markRecorderStarted(sessionId)

    expect(orchestrator.getSession()?.status).toBe('listening')
    expect(telemetry.sessionEvent).toHaveBeenCalledWith(sessionId, 'recorder-started')
  })

  it('captures context at start, reuses it during submit, streams text, stores history, and closes the span as completed', async () => {
    const store = createStoreDouble()
    const telemetry = createTelemetryDouble()
    const append = vi.fn(async () => undefined)
    const finalize = vi.fn(async () => ({
      requestedMode: 'letter-by-letter' as const,
      effectiveMode: 'letter-by-letter' as const,
      insertionMethod: 'clipboard-all-at-once' as const,
      fallbackUsed: true,
    }))

    const llm = {
      stream: vi.fn(
        async (request: LlmRequest, onDelta: (delta: string) => Promise<void>): Promise<LlmResponse> => {
          expect(request.context.appName).toBe('VS Code')
          expect(request.context.selectedText).toBe('old line')
          await onDelta('new ')
          await onDelta('copy')
          return { text: 'new copy', latencyMs: 240, finishReason: 'stop' }
        },
      ),
    }

    const orchestrator = new DictationSessionOrchestrator(
      store as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            append,
            finalize,
          }),
        ),
      }) as never,
      llm as never,
      telemetry as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(append).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledWith('new copy')
    expect(store.appendHistoryWithAudio).toHaveBeenCalledTimes(1)
    expect(store.appendHistoryWithAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sessionId,
        outputText: 'new copy',
        outcome: 'completed',
        fallbackUsed: true,
      }),
      expect.any(Object),
    )
    expect(orchestrator.getSession()?.status).toBe('completed')
    expect(telemetry.finishSession).toHaveBeenCalledWith(
      sessionId,
      'completed',
      expect.objectContaining({
        latencyMs: 240,
        fallbackUsed: true,
      }),
    )
  })

  it('moves to permission-required when the recorder fails to start and microphone access is blocked', async () => {
    const telemetry = createTelemetryDouble()
    const orchestrator = new DictationSessionOrchestrator(
      createStoreDouble() as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      { stream: vi.fn() } as never,
      telemetry as never,
      { getState: vi.fn(async () => ({ microphone: 'denied', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('push-to-talk')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderFailed(sessionId, 'Unable to start microphone capture.')

    expect(orchestrator.getSession()?.status).toBe('permission-required')
    expect(orchestrator.getSession()?.errorMessage).toContain('Microphone access is required')
    expect(telemetry.error).toHaveBeenCalledWith(
      'microphone-permission-required',
      { mode: 'push-to-talk' },
      { sessionId },
    )
    expect(telemetry.finishSession).toHaveBeenCalledWith(
      sessionId,
      'permission-required',
      expect.objectContaining({ reason: 'microphone-permission-required' }),
    )
  })

  it('publishes the completed session before history persistence finishes', async () => {
    let historyPersisted = false
    let completedObservedBeforeHistory = false
    const sessions: Array<DictationSession | null> = []
    const store = createStoreDouble({
      appendHistoryWithAudio: vi.fn(async () => {
        await Promise.resolve()
        historyPersisted = true
      }),
    })

    const orchestrator = new DictationSessionOrchestrator(
      store as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      {
        stream: vi.fn(async (_request: LlmRequest, onDelta: (delta: string) => Promise<void>): Promise<LlmResponse> => {
          await onDelta('ready')
          return { text: 'ready', latencyMs: 180, finishReason: 'stop' }
        }),
      } as never,
      createTelemetryDouble() as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => {
      sessions.push(session)
      if (session?.status === 'completed') {
        completedObservedBeforeHistory = !historyPersisted
      }
    })

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(store.appendHistoryWithAudio).toHaveBeenCalledTimes(1)
    expect(sessions.at(-1)?.status).toBe('completed')
    expect(completedObservedBeforeHistory).toBe(true)
  })

  it('does not publish completed after cancellation during finalize and closes the span as cancelled', async () => {
    const finalizeState: { resolve: (() => void) | null } = { resolve: null }
    const telemetry = createTelemetryDouble()
    const store = createStoreDouble()
    const finalize = vi.fn(
      () =>
        new Promise<{
          requestedMode: 'letter-by-letter'
          effectiveMode: 'letter-by-letter'
          insertionMethod: 'clipboard-all-at-once'
          fallbackUsed: false
        }>((resolve) => {
          finalizeState.resolve = () => resolve({
            requestedMode: 'letter-by-letter',
            effectiveMode: 'letter-by-letter',
            insertionMethod: 'clipboard-all-at-once',
            fallbackUsed: false,
          })
        }),
    )

    const orchestrator = new DictationSessionOrchestrator(
      store as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            finalize,
          }),
        ),
      }) as never,
      {
        stream: vi.fn(async (): Promise<LlmResponse> => ({ text: 'ready', latencyMs: 180, finishReason: 'stop' })),
      } as never,
      telemetry as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    orchestrator.markRecorderStarted(sessionId)
    const submitPromise = orchestrator.submitAudio('toggle', createPayload())
    await Promise.resolve()
    await orchestrator.cancel()
    finalizeState.resolve?.()
    await submitPromise

    expect(orchestrator.getSession()?.status ?? 'idle').not.toBe('completed')
    expect(store.appendHistoryWithAudio).not.toHaveBeenCalled()
    expect(telemetry.finishSession).toHaveBeenCalledWith(
      sessionId,
      'cancelled',
      expect.objectContaining({ cancelledAt: expect.any(String) }),
    )
  })

  it('does not call the model when the recorder reports silence and closes the span as notice', async () => {
    const llm = { stream: vi.fn() }
    const telemetry = createTelemetryDouble()

    const orchestrator = new DictationSessionOrchestrator(
      createStoreDouble() as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      llm as never,
      telemetry as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', {
      ...createPayload(),
      speechDetected: false,
      peakAmplitude: 0.01,
      rmsAmplitude: 0.002,
    })

    expect(llm.stream).not.toHaveBeenCalled()
    expect(orchestrator.getSession()?.status).toBe('notice')
    expect(orchestrator.getSession()?.noticeMessage).toContain('notices.noSpeechDetected')
    expect(telemetry.finishSession).toHaveBeenCalledWith(
      sessionId,
      'notice',
      expect.objectContaining({ noticeName: 'dictation-no-speech' }),
    )
  })

  it('treats an empty model response as notice and avoids persisting history', async () => {
    const telemetry = createTelemetryDouble()
    const finalize = vi.fn(async () => ({
      requestedMode: 'letter-by-letter' as const,
      effectiveMode: 'letter-by-letter' as const,
      insertionMethod: 'clipboard-all-at-once' as const,
      fallbackUsed: false,
    }))
    const store = createStoreDouble()

    const orchestrator = new DictationSessionOrchestrator(
      store as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            finalize,
          }),
        ),
      }) as never,
      {
        stream: vi.fn(async (): Promise<LlmResponse> => ({
          text: '   ',
          latencyMs: 120,
          finishReason: 'stop',
        })),
      } as never,
      telemetry as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(finalize).toHaveBeenCalledWith('')
    expect(store.appendHistoryWithAudio).not.toHaveBeenCalled()
    expect(orchestrator.getSession()?.status).toBe('notice')
    expect(orchestrator.getSession()?.noticeMessage).toContain('notices.noFinalText')
    expect(telemetry.finishSession).toHaveBeenCalledWith(
      sessionId,
      'notice',
      expect.objectContaining({ noticeName: 'dictation-empty-output' }),
    )
  })

  it('recovers partial text to clipboard, persists the failed session, and closes the span as error', async () => {
    const store = createStoreDouble()
    const telemetry = createTelemetryDouble()
    const recoverToClipboard = vi.fn(async () => undefined)

    const orchestrator = new DictationSessionOrchestrator(
      store as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn((mode: 'all-at-once' | 'letter-by-letter') => {
          if (mode === 'all-at-once') {
            return createProgressiveSessionDouble({
              recoverToClipboard,
            })
          }

          return createProgressiveSessionDouble({
            append: vi.fn(async () => {
              throw new Error('Protected clipboard write failed')
            }),
          })
        }),
      }) as never,
      {
        stream: vi.fn(async (_request: LlmRequest, onDelta: (delta: string) => Promise<void>): Promise<LlmResponse> => {
          await onDelta('partial text')
          return { text: 'partial text', latencyMs: 150, finishReason: 'stop' }
        }),
      } as never,
      telemetry as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(recoverToClipboard).toHaveBeenCalledWith('partial text')
    expect(orchestrator.getSession()?.status).toBe('error')
    expect(store.appendHistoryWithAudio).toHaveBeenCalledTimes(1)
    expect(store.appendHistoryWithAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sessionId,
        outcome: 'error',
        outputText: 'partial text',
        errorMessage: expect.stringContaining('Protected clipboard write failed'),
      }),
      expect.any(Object),
    )
    expect(telemetry.finishSession).toHaveBeenCalledWith(
      sessionId,
      'error',
      expect.objectContaining({
        'error.message': 'Protected clipboard write failed',
        recoveredToClipboard: true,
      }),
    )
  })
})
