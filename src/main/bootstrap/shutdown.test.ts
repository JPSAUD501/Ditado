import { describe, expect, it, vi } from 'vitest'

import { shutdownServices } from './shutdown.js'

describe('shutdownServices', () => {
  it('waits for store flush, insertion disposal, and telemetry shutdown', async () => {
    const store = { flush: vi.fn(async () => undefined) }
    const insertion = { dispose: vi.fn(async () => undefined) }
    const telemetry = { shutdown: vi.fn(async () => undefined) }

    await shutdownServices({ store, insertion, telemetry })

    expect(store.flush).toHaveBeenCalledTimes(1)
    expect(insertion.dispose).toHaveBeenCalledTimes(1)
    expect(telemetry.shutdown).toHaveBeenCalledTimes(1)
  })

  it('times out slow tasks instead of blocking forever', async () => {
    vi.useFakeTimers()
    const store = { flush: vi.fn(async () => undefined) }
    const insertion = { dispose: vi.fn(() => new Promise<void>(() => undefined)) }
    const telemetry = { shutdown: vi.fn(() => new Promise<void>(() => undefined)) }

    const shutdownPromise = shutdownServices({ store, insertion, telemetry }, 50)
    await vi.advanceTimersByTimeAsync(60)
    await shutdownPromise

    expect(store.flush).toHaveBeenCalledTimes(1)
    expect(insertion.dispose).toHaveBeenCalledTimes(1)
    expect(telemetry.shutdown).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
