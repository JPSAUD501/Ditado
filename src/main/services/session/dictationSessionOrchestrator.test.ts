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

describe('DictationSessionOrchestrator', () => {
  it('starts listening immediately and updates the target app once preview context arrives', async () => {
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
      {
        createPlan: vi.fn(() => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'clipboard',
        })),
        createProgressiveSession: vi.fn(),
      } as never,
      { stream: vi.fn() } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => sessions.push(session))
    await orchestrator.startCapture('toggle')

    expect(sessions.at(-1)?.status).toBe('listening')
    expect(capture).toHaveBeenCalledWith(false, false)
    expect(sessions.at(-1)?.targetApp).toBe('VS Code')
  })

  it('captures context once, streams text, and stores history', async () => {
    const appendHistory = vi.fn(async () => undefined)
    const persistHistoryAudio = vi.fn(async () => ({
      audioFilePath: 'C:\\audio\\session.wav',
      audioDurationMs: 1400,
      audioMimeType: 'audio/wav',
      audioBytes: 1024,
    }))
    const append = vi.fn(async () => undefined)
    const finalize = vi.fn(async () => undefined)

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
      {
        createPlan: vi.fn(() => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'clipboard',
        })),
        createProgressiveSession: vi.fn(() => ({
          append,
          finalize,
          recoverToClipboard: vi.fn(async () => undefined),
        })),
      } as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    await orchestrator.submitAudio('toggle', createPayload())

    expect(capture).toHaveBeenCalledTimes(2)
    expect(capture).toHaveBeenNthCalledWith(1, false, false)
    expect(capture).toHaveBeenNthCalledWith(2, true, true)
    expect(append).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledWith('new copy')
    expect(persistHistoryAudio).toHaveBeenCalledTimes(1)
    expect(appendHistory).toHaveBeenCalledTimes(1)
    expect(orchestrator.getSession()?.status).toBe('completed')
    expect(orchestrator.getSession()?.finalText).toBe('new copy')
  })

  it('publishes the completed session only after history persistence finishes', async () => {
    let historyPersisted = false
    let completedObservedAfterHistory = false
    const sessions: Array<DictationSession | null> = []

    const appendHistory = vi.fn(async () => {
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
      {
        createPlan: vi.fn(() => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'clipboard',
        })),
        createProgressiveSession: vi.fn(() => ({
          append: vi.fn(async () => undefined),
          finalize: vi.fn(async () => undefined),
          recoverToClipboard: vi.fn(async () => undefined),
        })),
      } as never,
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
        completedObservedAfterHistory = historyPersisted
      }
    })

    await orchestrator.startCapture('toggle')
    await orchestrator.submitAudio('toggle', createPayload())

    expect(appendHistory).toHaveBeenCalledTimes(1)
    expect(sessions.at(-1)?.status).toBe('completed')
    expect(completedObservedAfterHistory).toBe(true)
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
      {
        createPlan: vi.fn(() => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'clipboard',
        })),
        createProgressiveSession: vi.fn(() => ({
          append: vi.fn(async () => undefined),
          finalize: vi.fn(async () => undefined),
          recoverToClipboard: vi.fn(async () => undefined),
        })),
      } as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')

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
      {
        createPlan: vi.fn(() => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'clipboard',
        })),
        createProgressiveSession: vi.fn(() => ({
          append: vi.fn(async () => undefined),
          finalize: vi.fn(async () => undefined),
          recoverToClipboard: vi.fn(async () => undefined),
        })),
      } as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
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
      {
        createPlan: vi.fn(() => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'clipboard',
        })),
        createProgressiveSession: vi.fn(),
      } as never,
      { stream: vi.fn() } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.showShortPressHint()

    expect(orchestrator.getSession()?.status).toBe('notice')
    expect(orchestrator.getSession()?.noticeMessage).toContain('Shift+Alt')
  })

  it('switches to processing as soon as stop is requested and still accepts the audio payload', async () => {
    const finalize = vi.fn(async () => undefined)
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
      { capture: vi.fn(async () => context) } as never,
      {
        createPlan: vi.fn(() => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'clipboard',
        })),
        createProgressiveSession: vi.fn(() => ({
          append: vi.fn(async () => undefined),
          finalize,
          recoverToClipboard: vi.fn(async () => undefined),
        })),
      } as never,
      {
        stream: vi.fn(async (): Promise<LlmResponse> => ({ text: 'ready', latencyMs: 150, finishReason: 'stop' })),
      } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('push-to-talk')
    orchestrator.requestStop('push-to-talk')

    expect(orchestrator.getSession()?.status).toBe('processing')
    expect(orchestrator.getSession()?.captureIntent).toBe('stop')

    await orchestrator.submitAudio('push-to-talk', createPayload())

    expect(finalize).toHaveBeenCalledWith('ready')
    expect(orchestrator.getSession()?.status).toBe('completed')
  })
})
