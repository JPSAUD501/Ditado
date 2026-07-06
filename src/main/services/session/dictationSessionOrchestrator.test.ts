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

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const createPayload = (): DictationAudioPayload => ({
  audioBase64: 'ZmFrZQ==',
  mimeType: 'audio/mpeg',
  languageHint: 'en-US',
  durationMs: 1600,
  audioProcessingMs: 32,
  speechDetected: true,
  peakAmplitude: 0.18,
  rmsAmplitude: 0.06,
})

const createStoreDouble = (
  overrides: Partial<{
    appendHistoryWithAudio: ReturnType<typeof vi.fn>
    getSettings: () => Settings
  }> = {},
) => {
  let activeSession: DictationSession | null = null
  const publish = (session: DictationSession | null): DictationSession | null => {
    activeSession = session
    return activeSession
  }
  const updateActive = (sessionId: string, patch: Partial<DictationSession>): DictationSession | null => {
    if (!activeSession || activeSession.id !== sessionId) {
      return activeSession
    }
    return publish({ ...activeSession, ...patch })
  }

  return {
    getSettings: overrides.getSettings ?? (() => settings),
    appendHistoryWithAudio: overrides.appendHistoryWithAudio ?? vi.fn(async () => undefined),
    getActiveSession: vi.fn(async () => activeSession),
    startSession: vi.fn(async (session: DictationSession) => publish(session)),
    updateSessionContext: vi.fn(async (sessionId: string, targetApp: string, contextPatch: DictationSession['context']) =>
      updateActive(sessionId, { targetApp, context: contextPatch }),
    ),
    markSessionListening: vi.fn(async (sessionId: string) =>
      updateActive(sessionId, { status: 'listening' }),
    ),
    markSessionRecorderFailed: vi.fn(async (
      sessionId: string,
      status: 'error' | 'permission-required',
      errorMessage: string,
      finishedAt: string,
    ) => updateActive(sessionId, { status, captureIntent: 'none', errorMessage, finishedAt })),
    requestSessionStop: vi.fn(async (sessionId: string, processingStartedAt: string) =>
      updateActive(sessionId, { status: 'processing', captureIntent: 'stop', processingStartedAt }),
    ),
    markSessionProcessing: vi.fn(async (
      sessionId: string,
      processingStartedAt: string,
      targetApp: string,
      contextPatch: DictationSession['context'],
      insertionPlan: DictationSession['insertionPlan'],
    ) => updateActive(sessionId, {
      status: 'processing',
      captureIntent: 'none',
      processingStartedAt,
      targetApp,
      context: contextPatch,
      insertionPlan,
    })),
    appendSessionPartial: vi.fn(async (sessionId: string, partialText: string) =>
      updateActive(sessionId, { status: 'streaming', partialText }),
    ),
    completeSession: vi.fn(async (sessionId: string, finishedAt: string, partialText: string, finalText: string) =>
      updateActive(sessionId, {
        status: 'completed',
        captureIntent: 'none',
        finishedAt,
        partialText,
        finalText,
      }),
    ),
    failSession: vi.fn(async (sessionId: string, finishedAt: string, errorMessage: string, partialText: string) =>
      updateActive(sessionId, {
        status: 'error',
        captureIntent: 'none',
        finishedAt,
        errorMessage,
        partialText,
      }),
    ),
    showSessionNotice: vi.fn(async (session: DictationSession) => publish(session)),
    cancelSession: vi.fn(async (sessionId: string, finishedAt: string) =>
      updateActive(sessionId, { status: 'cancelled', captureIntent: 'none', finishedAt }),
    ),
    dismissCurrentSession: vi.fn(async () => publish(null)),
  }
}

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

    const orchestrator = new DictationSessionOrchestrator(
      createStoreDouble() as never,
      { capture } as never,
      createInsertionEngineDouble() as never,
      { stream: vi.fn() } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => sessions.push(session))
    await orchestrator.startCapture('toggle')
    await flushPromises()

    expect(sessions.at(-1)?.status).toBe('arming')
    expect(capture).toHaveBeenCalledWith(true, true)
    expect(sessions.at(-1)?.targetApp).toBe('VS Code')

    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }
    await orchestrator.markRecorderStarted(sessionId)

    expect(orchestrator.getSessionSnapshot()?.status).toBe('listening')
  })

  it('captures context at start, reuses it during submit, streams text, and stores history', async () => {
    const store = createStoreDouble()
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
          return { text: 'new copy', latencyMs: 240, audioSendMs: 85, finishReason: 'stop' }
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
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(append).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledWith('new copy')
    expect(store.appendHistoryWithAudio).toHaveBeenCalledTimes(1)
    expect(store.appendHistoryWithAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sessionId,
        outputText: 'new copy',
        outcome: 'completed',
        audioProcessingMs: 32,
        audioSendMs: 85,
        fallbackUsed: true,
      }),
      expect.any(Object),
    )
    expect(orchestrator.getSessionSnapshot()?.status).toBe('completed')
  })

  it('moves to permission-required when the recorder fails to start and microphone access is blocked', async () => {
    const orchestrator = new DictationSessionOrchestrator(
      createStoreDouble() as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      { stream: vi.fn() } as never,
      { getState: vi.fn(async () => ({ microphone: 'denied', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('push-to-talk')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderFailed(sessionId, 'Unable to start microphone capture.')

    expect(orchestrator.getSessionSnapshot()?.status).toBe('permission-required')
    expect(orchestrator.getSessionSnapshot()?.errorMessage).toContain('Microphone access is required')
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
          return { text: 'ready', latencyMs: 180, audioSendMs: 60, finishReason: 'stop' }
        }),
      } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => {
      sessions.push(session)
      if (session?.status === 'completed') {
        completedObservedBeforeHistory = !historyPersisted
      }
    })

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(store.appendHistoryWithAudio).toHaveBeenCalledTimes(1)
    expect(sessions.at(-1)?.status).toBe('completed')
    expect(completedObservedBeforeHistory).toBe(true)
  })

  it('does not publish completed after cancellation during finalize', async () => {
    const finalizeState: { resolve: (() => void) | null } = { resolve: null }
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
        stream: vi.fn(async (): Promise<LlmResponse> => ({
          text: 'ready',
          latencyMs: 180,
          audioSendMs: 60,
          finishReason: 'stop',
        })),
      } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderStarted(sessionId)
    const submitPromise = orchestrator.submitAudio('toggle', createPayload())
    await Promise.resolve()
    await orchestrator.cancel()
    finalizeState.resolve?.()
    await submitPromise

    expect(orchestrator.getSessionSnapshot()?.status ?? 'idle').not.toBe('completed')
    expect(store.appendHistoryWithAudio).not.toHaveBeenCalled()
  })

  it('does not call the model when the recorder reports silence', async () => {
    const llm = { stream: vi.fn() }

    const orchestrator = new DictationSessionOrchestrator(
      createStoreDouble() as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      llm as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', {
      ...createPayload(),
      speechDetected: false,
      peakAmplitude: 0.01,
      rmsAmplitude: 0.002,
    })

    expect(llm.stream).not.toHaveBeenCalled()
    expect(orchestrator.getSessionSnapshot()?.status).toBe('notice')
    expect(orchestrator.getSessionSnapshot()?.noticeMessage).toContain('notices.noSpeechDetected')
  })

  it('treats audio shorter than 1.5 seconds as no speech for both modes', async () => {
    const llm = { stream: vi.fn() }

    const orchestrator = new DictationSessionOrchestrator(
      createStoreDouble() as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      llm as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('push-to-talk')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('push-to-talk', {
      ...createPayload(),
      durationMs: 1400,
    })

    expect(llm.stream).not.toHaveBeenCalled()
    expect(orchestrator.getSessionSnapshot()?.status).toBe('notice')
    expect(orchestrator.getSessionSnapshot()?.noticeMessage).toContain('notices.noSpeechDetected')
  })

  it('treats an empty model response as notice and avoids persisting history', async () => {
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
          audioSendMs: 45,
          finishReason: 'stop',
        })),
      } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(finalize).toHaveBeenCalledWith('')
    expect(store.appendHistoryWithAudio).not.toHaveBeenCalled()
    expect(orchestrator.getSessionSnapshot()?.status).toBe('notice')
    expect(orchestrator.getSessionSnapshot()?.noticeMessage).toContain('notices.noFinalText')
  })

  it('recovers partial text to clipboard and persists the failed session', async () => {
    const store = createStoreDouble()
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
          return { text: 'partial text', latencyMs: 150, audioSendMs: 52, finishReason: 'stop' }
        }),
      } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSessionSnapshot()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }

    await orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(recoverToClipboard).toHaveBeenCalledWith('partial text')
    expect(orchestrator.getSessionSnapshot()?.status).toBe('error')
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
  })
})
