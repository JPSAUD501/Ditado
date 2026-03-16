import { describe, expect, it, vi } from 'vitest'

import { TelemetryService } from './telemetryService.js'

const createStore = (telemetryEnabled: boolean) => ({
  getSettings: () => ({ telemetryEnabled }),
  appendTelemetry: vi.fn(async () => undefined),
  readTelemetryTail: vi.fn(async () => []),
})

const createRemote = () => ({
  remoteEnabled: true,
  startSessionSpan: vi.fn(() => undefined),
  updateSessionSpan: vi.fn(() => undefined),
  addSessionEvent: vi.fn(() => undefined),
  recordException: vi.fn(() => undefined),
  emitLog: vi.fn(() => undefined),
  incrementCounter: vi.fn(() => undefined),
  recordHistogram: vi.fn(() => undefined),
  endSessionSpan: vi.fn(() => undefined),
  shutdown: vi.fn(async () => undefined),
})

describe('TelemetryService', () => {
  it('does not persist locally or emit remotely when telemetry is disabled', async () => {
    const store = createStore(false)
    const remote = createRemote()
    const service = new TelemetryService(store as never, remote as never)

    await service.metric('dictation-started', { mode: 'toggle' }, { sessionId: 'session-1' })
    await service.error('dictation-failed', { message: 'boom' }, { sessionId: 'session-1', exception: new Error('boom') })

    expect(store.appendTelemetry).not.toHaveBeenCalled()
    expect(remote.emitLog).not.toHaveBeenCalled()
    expect(remote.incrementCounter).not.toHaveBeenCalled()
  })

  it('persists locally, mirrors logs remotely, and derives counters and histograms when enabled', async () => {
    const store = createStore(true)
    const remote = createRemote()
    const service = new TelemetryService(store as never, remote as never)

    await service.startSession('session-1', { activationMode: 'toggle' })
    await service.metric('dictation-started', { mode: 'toggle' }, { sessionId: 'session-1' })
    await service.metric('dictation-completed', {
      latencyMs: 240,
      fallbackUsed: true,
    }, { sessionId: 'session-1' })
    await service.finishSession('session-1', 'completed', { latencyMs: 240 })

    expect(store.appendTelemetry).toHaveBeenCalledTimes(2)
    expect(remote.startSessionSpan).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ activationMode: 'toggle', sessionId: 'session-1' }),
    )
    expect(remote.emitLog).toHaveBeenCalledTimes(2)
    expect(remote.incrementCounter).toHaveBeenCalledWith(
      'dictation_started',
      1,
      expect.objectContaining({ mode: 'toggle', sessionId: 'session-1' }),
    )
    expect(remote.incrementCounter).toHaveBeenCalledWith(
      'dictation_completed',
      1,
      expect.objectContaining({ fallbackUsed: true, sessionId: 'session-1' }),
    )
    expect(remote.incrementCounter).toHaveBeenCalledWith(
      'insertion_fallback_used',
      1,
      expect.objectContaining({ fallbackUsed: true, sessionId: 'session-1' }),
    )
    expect(remote.recordHistogram).toHaveBeenCalledWith(
      'dictation_latency_ms',
      240,
      expect.objectContaining({ latencyMs: 240, sessionId: 'session-1' }),
    )
    expect(remote.endSessionSpan).toHaveBeenCalledWith(
      'session-1',
      'completed',
      expect.objectContaining({ latencyMs: 240, sessionId: 'session-1' }),
    )
  })

  it('records remote exceptions for error events tied to a session', async () => {
    const store = createStore(true)
    const remote = createRemote()
    const service = new TelemetryService(store as never, remote as never)
    const error = new Error('boom')

    await service.error('dictation-failed', { message: 'boom' }, { sessionId: 'session-1', exception: error })

    expect(remote.recordException).toHaveBeenCalledWith(
      'session-1',
      error,
      expect.objectContaining({ message: 'boom', sessionId: 'session-1' }),
    )
  })

  it('shuts down the remote runtime', async () => {
    const remote = createRemote()
    const service = new TelemetryService(createStore(true) as never, remote as never)

    await service.shutdown()

    expect(remote.shutdown).toHaveBeenCalledTimes(1)
  })
})
