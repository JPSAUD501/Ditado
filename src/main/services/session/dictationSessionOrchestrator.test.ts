import { describe, expect, it, vi } from 'vitest'

import { DictationSessionOrchestrator } from './dictationSessionOrchestrator.js'
import type {
  ContextSnapshot,
  DictationAudioPayload,
  DictationSession,
  HistoryEntry,
  InsertionPlan,
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

describe('DictationSessionOrchestrator', () => {
  it('emits a listening session immediately before context resolution completes', async () => {
    const sessions: Array<DictationSession | null> = []
    const captureControl: { resolve: (value: ContextSnapshot) => void } = {
      resolve: () => undefined,
    }

    const capturePromise = new Promise<ContextSnapshot>((resolve) => {
      captureControl.resolve = resolve
    })

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory: vi.fn(async () => undefined),
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 3200,
          audioMimeType: 'audio/wav',
        })),
      } as never,
      { capture: vi.fn(() => capturePromise) } as never,
      {
        createPlan: vi.fn(async (): Promise<InsertionPlan> => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'native-shortcuts',
        })),
        createProgressiveSession: vi.fn(),
      } as never,
      { stream: vi.fn() } as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => sessions.push(session))
    const startPromise = orchestrator.startCapture('toggle')

    expect(sessions.at(-1)?.status).toBe('listening')
    expect(sessions.at(-1)?.captureIntent).toBe('start')
    expect(sessions.at(-1)?.targetApp).toBe('Foreground app')

    captureControl.resolve(context)
    await startPromise

    expect(sessions.at(-1)?.targetApp).toBe('VS Code')
    expect(sessions.at(-1)?.context.appName).toBe('VS Code')
  })

  it('streams text and stores history', async () => {
    const appendedHistory: HistoryEntry[] = []
    const deltas: string[] = []
    const sessions: Array<DictationSession | null> = []
    const capture = vi
      .fn()
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce({
        ...context,
        selectedText: 'new selection',
        textBefore: 'before snippet',
        textAfter: 'after snippet',
      })

    const store = {
      getSettings: () => settings,
      appendHistory: vi.fn(async (entry: HistoryEntry) => {
        appendedHistory.push(entry)
      }),
      persistHistoryAudio: vi.fn(async () => ({
        audioFilePath: 'C:\\audio\\session.wav',
        audioDurationMs: 1400,
        audioMimeType: 'audio/wav',
      })),
    }

    const insertion = {
      createPlan: vi.fn(async (): Promise<InsertionPlan> => ({
        strategy: 'replace-selection',
        targetApp: 'VS Code',
        capability: 'native-shortcuts',
      })),
      createProgressiveSession: vi.fn(() => ({
        append: vi.fn(async (delta: string) => {
          deltas.push(delta)
        }),
        finalize: vi.fn(async () => undefined),
        fallback: vi.fn(async () => undefined),
      })),
    }

    const llm = {
      stream: vi.fn(
        async (request: LlmRequest, onDelta: (delta: string) => Promise<void>): Promise<LlmResponse> => {
          expect(request.context.appName).toBe('VS Code')
          expect(request.context.selectedText).toBe('new selection')
          expect(request.context.textBefore).toBe('before snippet')
          expect(request.context.textAfter).toBe('after snippet')
          await onDelta('new ')
          await onDelta('copy')
          return { text: 'new copy', latencyMs: 240, finishReason: 'stop' }
        },
      ),
    }

    const orchestrator = new DictationSessionOrchestrator(
      store as never,
      { capture } as never,
      insertion as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    orchestrator.subscribe((session: DictationSession | null) => sessions.push(session))
    await orchestrator.startCapture('toggle')

    const payload: DictationAudioPayload = {
      wavBase64: 'ZmFrZQ==',
      mimeType: 'audio/wav',
      languageHint: 'en-US',
      durationMs: 1400,
      speechDetected: true,
      peakAmplitude: 0.18,
      rmsAmplitude: 0.06,
    }
    await orchestrator.submitAudio('toggle', payload)

    expect(deltas.join('')).toBe('new copy')
    expect(appendedHistory).toHaveLength(1)
    expect(appendedHistory[0]?.audioDurationMs).toBe(1400)
    expect(appendedHistory[0]?.audioFilePath).toBe('C:\\audio\\session.wav')
    expect(appendedHistory[0]?.submittedContext?.selectedText).toBe('new selection')
    expect(appendedHistory[0]?.submittedContext?.textBefore).toBe('before snippet')
    expect(capture).toHaveBeenCalledTimes(2)
    expect(sessions.at(-1)?.status).toBe('completed')
    expect(sessions.at(-1)?.finalText).toBe('new copy')
  })

  it('ignores duplicate submit calls for the same active session', async () => {
    const appendHistory = vi.fn(async () => undefined)
    const persistHistoryAudio = vi.fn(async () => ({
      audioFilePath: 'C:\\audio\\session.wav',
      audioDurationMs: 900,
      audioMimeType: 'audio/wav',
    }))

    const llm = {
      stream: vi.fn(
        async (): Promise<LlmResponse> => {
          await Promise.resolve()
          return { text: 'unique', latencyMs: 140, finishReason: 'stop' }
        },
      ),
    }

    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory,
        persistHistoryAudio,
      } as never,
      { capture: vi.fn(async () => context) } as never,
      {
        createPlan: vi.fn(async (): Promise<InsertionPlan> => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'native-shortcuts',
        })),
        createProgressiveSession: vi.fn(() => ({
          append: vi.fn(async () => undefined),
          finalize: vi.fn(async () => undefined),
          fallback: vi.fn(async () => undefined),
        })),
      } as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    const payload: DictationAudioPayload = {
      wavBase64: 'ZmFrZQ==',
      mimeType: 'audio/wav',
      languageHint: 'en-US',
      durationMs: 900,
      speechDetected: true,
      peakAmplitude: 0.16,
      rmsAmplitude: 0.05,
    }

    const firstSubmit = orchestrator.submitAudio('toggle', payload)
    const secondSubmit = orchestrator.submitAudio('toggle', payload)
    await Promise.all([firstSubmit, secondSubmit])

    expect(llm.stream).toHaveBeenCalledTimes(1)
    expect(persistHistoryAudio).toHaveBeenCalledTimes(1)
    expect(appendHistory).toHaveBeenCalledTimes(1)
  })

  it('does not call the model when the recorder reports silence', async () => {
    const llm = {
      stream: vi.fn(),
    }
    const orchestrator = new DictationSessionOrchestrator(
      {
        getSettings: () => settings,
        appendHistory: vi.fn(async () => undefined),
        persistHistoryAudio: vi.fn(async () => ({
          audioFilePath: 'C:\\audio\\session.wav',
          audioDurationMs: 0,
          audioMimeType: 'audio/wav',
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      {
        createPlan: vi.fn(async (): Promise<InsertionPlan> => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'native-shortcuts',
        })),
        createProgressiveSession: vi.fn(() => ({
          append: vi.fn(async () => undefined),
          finalize: vi.fn(async () => undefined),
          fallback: vi.fn(async () => undefined),
        })),
      } as never,
      llm as never,
      { metric: vi.fn(async () => undefined), error: vi.fn(async () => undefined) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    )

    await orchestrator.startCapture('toggle')
    await orchestrator.submitAudio('toggle', {
      wavBase64: 'ZmFrZQ==',
      mimeType: 'audio/wav',
      languageHint: 'pt-BR',
      durationMs: 1800,
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
        })),
      } as never,
      { capture: vi.fn(async () => context) } as never,
      {
        createPlan: vi.fn(async (): Promise<InsertionPlan> => ({
          strategy: 'replace-selection',
          targetApp: 'VS Code',
          capability: 'native-shortcuts',
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
})
