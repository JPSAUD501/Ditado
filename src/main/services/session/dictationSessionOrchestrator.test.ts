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

const createInsertionEngineDouble = (
  overrides: Partial<{
    createPlan: ReturnType<typeof vi.fn>
    createProgressiveSession: ReturnType<typeof vi.fn>
    captureClipboardSnapshot: ReturnType<typeof vi.fn>
    createWriterSession: ReturnType<typeof vi.fn>
    warmupLetterInput: ReturnType<typeof vi.fn>
  }> = {},
) => ({
  captureClipboardSnapshot:
    overrides.captureClipboardSnapshot ?? vi.fn(async () => ({ text: 'previous clipboard' })),
  createWriterSession:
    overrides.createWriterSession ??
    vi.fn(() => ({
      warmup: vi.fn(async () => undefined),
      writeProtected: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    })),
  createPlan:
    overrides.createPlan ??
    vi.fn(() => ({
      strategy: 'replace-selection',
      targetApp: 'VS Code',
      capability: 'clipboard',
    })),
  warmupLetterInput: overrides.warmupLetterInput ?? vi.fn(async () => undefined),
  createProgressiveSession: overrides.createProgressiveSession ?? vi.fn(),
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
      insertionMethod: 'clipboard-protected' as const,
      fallbackUsed: false,
    })),
  warmup: overrides.warmup ?? vi.fn(async () => undefined),
  recoverToClipboard: overrides.recoverToClipboard ?? vi.fn(async () => undefined),
  cancel: overrides.cancel ?? vi.fn(() => undefined),
  getExecutionReport:
    overrides.getExecutionReport ??
    vi.fn(() => ({
      insertionMethod: 'clipboard-protected' as const,
      fallbackUsed: false,
    })),
})

describe('DictationSessionOrchestrator', () => {
  it('starts armed, updates the target app, and only switches to listening after the recorder confirms start', async () => {
    const sessions: Array<DictationSession | null> = []
    const capture = vi.fn(async () => context)

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory: vi.fn(async () => undefined),
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 3200,
          audioMimeType: 'audio/wav',
          audioBytes: 512,
        })),
      } as never,
      { capture } as never,
      createInsertionEngineDouble() as never,
      { stream: vi.fn() } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => sessions.push(session))
    await orchestrator.startCapture('toggle')

    expect(sessions.at(-1)?.status).toBe('arming')
    expect(capture).toHaveBeenCalledWith(true, true)
    expect(sessions.at(-1)?.targetApp).toBe('VS Code')

    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }
    orchestrator.markRecorderStarted(sessionId)

    expect(orchestrator.getSession()?.status).toBe('listening')
  })

  it('captures context at start, reuses it during submit, streams text, and stores history', async () => {
    const appendHistory = vi.fn(async () => undefined)
    const persistHistoryAudio = vi.fn(async () => ({
      audioFilePath: 'C:\\audio\\session.wav',
      audioDurationMs: 1400,
      audioMimeType: 'audio/wav',
      audioBytes: 1024,
    }))
    const append = vi.fn(async () => undefined)
    const finalize = vi.fn(async () => ({
      insertionMethod: 'clipboard-protected' as const,
      fallbackUsed: false,
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

    const capture = vi.fn(async () => context)

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory,
        persistHistoryAudio,
      } as never,
      { capture } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            append,
            finalize,
          }),
        ),
      }) as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }
    orchestrator.markRecorderStarted(sessionId)
    await orchestrator.submitAudio('toggle', createPayload())

    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenNthCalledWith(1, true, true)
    expect(append).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledWith('new copy')
    expect(persistHistoryAudio).toHaveBeenCalledTimes(1)
    expect(appendHistory).toHaveBeenCalledTimes(1)
    expect(orchestrator.getSession()?.status).toBe('completed')
    expect(orchestrator.getSession()?.finalText).toBe('new copy')
  })

  it('moves to permission-required when the recorder fails to start and microphone access is blocked', async () => {
    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory: vi.fn(async () => undefined),
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 0,
          audioMimeType: 'audio/wav',
          audioBytes: 0,
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      { stream: vi.fn() } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
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
  })

  it('publishes the completed session before history persistence finishes', async () => {
    let historyPersisted = false
    let completedObservedBeforeHistory = false
    const sessions: Array<DictationSession | null> = []

    const appendHistory = vi.fn(async () => {
      await Promise.resolve()
      historyPersisted = true
    })

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory,
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 1400,
          audioMimeType: 'audio/wav',
          audioBytes: 1024,
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            append: vi.fn(async () => undefined),
          }),
        ),
      }) as never,
      {
        stream: vi.fn(async (_request: LlmRequest, onDelta: (delta: string) => Promise<void>): Promise<LlmResponse> => {
          await onDelta('ready')
          return { text: 'ready', latencyMs: 180, finishReason: 'stop' }
        }),
      } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
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

    expect(appendHistory).toHaveBeenCalledTimes(1)
    expect(sessions.at(-1)?.status).toBe('completed')
    expect(completedObservedBeforeHistory).toBe(true)
  })

  it('does not publish completed after escape-style cancellation during finalize', async () => {
    const finalizeState: {
      resolve: (() => void) | null
    } = { resolve: null }
    const finalize = vi.fn(
      () =>
        new Promise<{ insertionMethod: 'clipboard-protected'; fallbackUsed: false }>((resolve) => {
          finalizeState.resolve = () => resolve({ insertionMethod: 'clipboard-protected', fallbackUsed: false })
        }),
    )
    const appendHistory = vi.fn(async () => undefined)

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory,
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 1400,
          audioMimeType: 'audio/wav',
          audioBytes: 1024,
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            append: vi.fn(async () => undefined),
            finalize,
          }),
        ),
      }) as never,
      {
        stream: vi.fn(async (): Promise<LlmResponse> => ({ text: 'ready', latencyMs: 180, finishReason: 'stop' })),
      } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
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
    if (finalizeState.resolve) {
      finalizeState.resolve()
    }
    await submitPromise

    expect(orchestrator.getSession()?.status ?? 'idle').not.toBe('completed')
    expect(appendHistory).not.toHaveBeenCalled()
  })

  it('ignores duplicate submit calls for the same active session', async () => {
    const appendHistory = vi.fn(async () => undefined)
    const persistHistoryAudio = vi.fn(async () => ({
      audioFilePath: 'C:\\audio\\session.wav',
      audioDurationMs: 900,
      audioMimeType: 'audio/wav',
      audioBytes: 512,
    }))

    const llm = {
      stream: vi.fn(async (): Promise<LlmResponse> => ({ text: 'unique', latencyMs: 140, finishReason: 'stop' })),
    }

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory,
        persistHistoryAudio,
      } as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            append: vi.fn(async () => undefined),
          }),
        ),
      }) as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }
    orchestrator.markRecorderStarted(sessionId)

    const firstSubmit = orchestrator.submitAudio('toggle', createPayload())
    const secondSubmit = orchestrator.submitAudio('toggle', createPayload())
    await Promise.all([firstSubmit, secondSubmit])

    expect(llm.stream).toHaveBeenCalledTimes(1)
    expect(persistHistoryAudio).toHaveBeenCalledTimes(1)
    expect(appendHistory).toHaveBeenCalledTimes(1)
  })

  it('does not call the model when the recorder reports silence', async () => {
    const llm = { stream: vi.fn() }

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory: vi.fn(async () => undefined),
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 0,
          audioMimeType: 'audio/wav',
          audioBytes: 0,
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            append: vi.fn(async () => undefined),
          }),
        ),
      }) as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
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
    expect(orchestrator.getSession()?.noticeMessage).toContain('Nenhuma fala')
  })

  it('shows a short-press hint instead of leaving a listening session around', async () => {
    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory: vi.fn(async () => undefined),
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 0,
          audioMimeType: 'audio/wav',
          audioBytes: 0,
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble() as never,
      { stream: vi.fn() } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.showShortPressHint()

    expect(orchestrator.getSession()?.status).toBe('notice')
    expect(orchestrator.getSession()?.noticeMessage).toContain('Shift+Alt')
  })

  it('switches to processing as soon as stop is requested and still accepts the audio payload', async () => {
    const finalize = vi.fn(async () => ({
      insertionMethod: 'clipboard-protected' as const,
      fallbackUsed: false,
    }))
    const capture = vi.fn(async (sendContextAutomatically: boolean, includeSelection: boolean) => {
      if (!sendContextAutomatically && !includeSelection) {
        return {
          ...context,
          selectedText: '',
          confidence: 'partial' as const,
        }
      }

      return context
    })
    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory: vi.fn(async () => undefined),
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 1400,
          audioMimeType: 'audio/wav',
          audioBytes: 1024,
        })),
      } as never,
      { capture } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn(() =>
          createProgressiveSessionDouble({
            append: vi.fn(async () => undefined),
            finalize,
          }),
        ),
      }) as never,
      {
        stream: vi.fn(async (): Promise<LlmResponse> => ({ text: 'ready', latencyMs: 150, finishReason: 'stop' })),
      } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('push-to-talk')
    const sessionId = orchestrator.getSession()?.id
    if (!sessionId) {
      throw new Error('Expected session id')
    }
    orchestrator.markRecorderStarted(sessionId)
    orchestrator.requestStop('push-to-talk')

    expect(orchestrator.getSession()?.status).toBe('processing')
    expect(orchestrator.getSession()?.captureIntent).toBe('stop')

    await orchestrator.submitAudio('push-to-talk', createPayload())

    expect(finalize).toHaveBeenCalledWith('ready')
    expect(orchestrator.getSession()?.status).toBe('completed')
    expect(capture).toHaveBeenCalledTimes(2)
    expect(capture).toHaveBeenNthCalledWith(1, false, false)
    expect(capture).toHaveBeenNthCalledWith(2, true, true)
  })

  it('persists failed writing attempts to history with the error message and partial text', async () => {
    const appendHistory = vi.fn(async () => undefined)
    const recoverToClipboard = vi.fn(async () => undefined)

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory,
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 1400,
          audioMimeType: 'audio/wav',
          audioBytes: 1024,
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      createInsertionEngineDouble({
        createProgressiveSession: vi.fn((mode: 'all-at-once' | 'chunks' | 'letter-by-letter') => {
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
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
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
    expect(appendHistory).toHaveBeenCalledTimes(1)
    expect(appendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'error',
        outputText: 'partial text',
        errorMessage: expect.stringContaining('Protected clipboard write failed'),
      }),
    )
  })
})
