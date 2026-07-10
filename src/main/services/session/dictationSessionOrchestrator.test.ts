import { describe, expect, it, vi } from 'vitest'
import type { SyncoreClient } from 'syncorejs'

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
import { createTestSession } from '../../../shared/testFixtures.js'

type Call = { name: string; args: unknown }
type FunctionReferenceShape = { name?: string }

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
}

const payload: DictationAudioPayload = {
  audioBase64: 'ZmFrZQ==',
  mimeType: 'audio/mpeg',
  languageHint: 'pt-BR',
  durationMs: 1_600,
  audioProcessingMs: 20,
  speechDetected: true,
  peakAmplitude: 0.2,
  rmsAmplitude: 0.07,
}

const createActiveSession = (
  overrides: Partial<DictationSession> = {},
): DictationSession => ({
  ...createTestSession(),
  sessionId: 'session-test',
  isActive: true,
  activationMode: 'push-to-talk',
  status: 'listening',
  captureIntent: 'start',
  startedAt: new Date().toISOString(),
  targetApp: context.appName,
  context,
  ...overrides,
})

const createClient = (initialSession: DictationSession | null = null) => {
  const calls: Call[] = []
  let session = initialSession
  const mutation = vi.fn(async (reference: unknown, args?: unknown): Promise<unknown> => {
    const name = (reference as FunctionReferenceShape).name ?? 'unknown'
    calls.push({ name, args })
    if (name === 'sessions/start') {
      const start = args as {
        sessionId: string
        activationMode: DictationSession['activationMode']
        startedAt: string
        modelId: string
        requestedMode: DictationSession['insertion']['requestedMode']
      }
      session = createActiveSession({
        sessionId: start.sessionId,
        activationMode: start.activationMode,
        status: 'arming',
        startedAt: start.startedAt,
        llm: { ...createTestSession().llm, modelId: start.modelId },
        insertion: {
          ...createTestSession().insertion,
          requestedMode: start.requestedMode,
          effectiveMode: start.requestedMode,
        },
      })
    } else if (name === 'sessions/updateContext' && session) {
      const update = args as { targetApp: string; context: ContextSnapshot }
      session = { ...session, targetApp: update.targetApp, context: update.context }
    } else if (name === 'sessions/markListening' && session) {
      session = { ...session, status: 'listening' }
    } else if (name === 'sessions/requestStop' && session) {
      session = { ...session, status: 'processing', captureIntent: 'stop' }
    } else if (name === 'sessions/markProcessing' && session) {
      const update = args as Pick<DictationSession, 'targetApp' | 'context' | 'insertionPlan'>
      session = { ...session, ...update, status: 'processing', captureIntent: 'none' }
    } else if (name === 'sessions/appendPartial' && session) {
      const update = args as { partialText: string }
      session = { ...session, status: 'streaming', partialText: update.partialText }
    } else if (name === 'sessions/complete' && session) {
      const update = args as { finalText: string; partialText: string; finishedAt: string }
      session = {
        ...session,
        ...update,
        status: 'completed',
        isActive: false,
        captureIntent: 'none',
      }
    } else if (name === 'sessions/fail' && session) {
      const update = args as { errorMessage: string; partialText: string; finishedAt: string }
      session = {
        ...session,
        ...update,
        status: 'error',
        isActive: false,
        captureIntent: 'none',
      }
    }
    return session
  })
  const client = {
    query: vi.fn(async () => session),
    mutation,
    action: vi.fn(),
    watchQuery: vi.fn(),
    watchRuntimeStatus: vi.fn(),
  } as SyncoreClient
  return {
    client,
    calls,
    getSession: () => session,
    setSession: (next: DictationSession | null) => { session = next },
  }
}

const createInsertion = () => {
  const progressive = {
    append: vi.fn(async () => undefined),
    warmup: vi.fn(async () => undefined),
    finalize: vi.fn(async () => ({
      requestedMode: 'letter-by-letter' as const,
      effectiveMode: 'letter-by-letter' as const,
      insertionMethod: 'enigo-letter' as const,
      fallbackUsed: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 10,
      writtenCharacterCount: 11,
    })),
    recoverToClipboard: vi.fn(async () => undefined),
    cancel: vi.fn(),
    getExecutionReport: vi.fn(() => ({
      requestedMode: 'letter-by-letter' as const,
      effectiveMode: 'letter-by-letter' as const,
      insertionMethod: 'enigo-letter' as const,
      fallbackUsed: false,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      writtenCharacterCount: null,
    })),
  }
  return {
    progressive,
    engine: {
      warmupLetterInput: vi.fn(),
      createPlan: vi.fn(() => ({
        strategy: 'replace-selection' as const,
        targetApp: context.appName,
        capability: 'clipboard' as const,
      })),
      createProgressiveSession: vi.fn(() => progressive),
    },
  }
}

const createOrchestrator = (
  clientState: ReturnType<typeof createClient>,
  llmStream: (request: LlmRequest, onDelta: (delta: string) => Promise<void>) => Promise<LlmResponse>,
) => {
  const insertion = createInsertion()
  return {
    insertion,
    orchestrator: new DictationSessionOrchestrator(
      clientState.client,
      () => settings,
      clientState.getSession,
      { capture: vi.fn(async () => context) } as never,
      insertion.engine as never,
      { stream: vi.fn(llmStream) } as never,
      { getState: vi.fn(async () => ({ microphone: 'granted', accessibility: 'granted' })) } as never,
    ),
  }
}

describe('DictationSessionOrchestrator with Syncore', () => {
  it('starts and advances the session exclusively through Syncore mutations', async () => {
    const clientState = createClient()
    const { orchestrator } = createOrchestrator(clientState, async () => ({
      text: '', latencyMs: 0, finishReason: null,
    }))

    await orchestrator.startCapture('toggle')
    await Promise.resolve()
    const sessionId = clientState.getSession()?.sessionId
    expect(sessionId).toBeTruthy()
    await orchestrator.markRecorderStarted(sessionId ?? '')

    expect(clientState.calls.map((call) => call.name)).toEqual(expect.arrayContaining([
      'sessions/start',
      'sessions/updateContext',
      'sessions/markListening',
    ]))
    expect(clientState.getSession()?.status).toBe('listening')
  })

  it('coalesces partial text and flushes it before completion and history storage', async () => {
    const clientState = createClient(createActiveSession())
    const { orchestrator, insertion } = createOrchestrator(
      clientState,
      async (_request, onDelta) => {
        await onDelta('hello ')
        await onDelta('world')
        return { text: 'hello world', latencyMs: 50, finishReason: 'stop' }
      },
    )

    await orchestrator.submitAudio('push-to-talk', payload)

    const names = clientState.calls.map((call) => call.name)
    expect(names.filter((name) => name === 'sessions/appendPartial')).toHaveLength(1)
    expect(names.indexOf('sessions/appendPartial')).toBeLessThan(names.indexOf('sessions/complete'))
    expect(names.indexOf('sessions/complete')).toBeLessThan(names.indexOf('history/appendWithAudio'))
    expect(insertion.progressive.append).toHaveBeenNthCalledWith(1, 'hello ')
    expect(insertion.progressive.append).toHaveBeenNthCalledWith(2, 'world')
  })

  it('records an auditable failure and persists its history without fallback storage', async () => {
    const clientState = createClient(createActiveSession())
    const { orchestrator } = createOrchestrator(
      clientState,
      async (_request, onDelta) => {
        await onDelta('partial result')
        throw new Error('provider failed')
      },
    )

    await orchestrator.submitAudio('push-to-talk', payload)

    const names = clientState.calls.map((call) => call.name)
    expect(names).toContain('sessions/fail')
    expect(names.indexOf('sessions/fail')).toBeLessThan(names.indexOf('history/appendWithAudio'))
    const failure = clientState.calls.find((call) => call.name === 'sessions/fail')
    expect(failure?.args).toEqual(expect.objectContaining({
      errorMessage: 'provider failed Latest text copied to clipboard.',
      partialText: 'partial result',
    }))
  })

  it('does not start a second capture while Syncore reports a live session', async () => {
    const clientState = createClient(createActiveSession())
    const { orchestrator } = createOrchestrator(clientState, async () => ({
      text: '', latencyMs: 0, finishReason: null,
    }))

    await orchestrator.startCapture('toggle')

    expect(clientState.calls).toHaveLength(0)
  })
})
