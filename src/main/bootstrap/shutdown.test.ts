import { describe, expect, it, vi } from 'vitest'

import { shutdownServices } from './shutdown.js'

describe('shutdownServices', () => {
  it('waits for store flush and insertion disposal', async () => {
    const store = { flush: vi.fn(async () => undefined) }
    const insertion = { dispose: vi.fn(async () => undefined) }

    await shutdownServices({ store, insertion })

    expect(store.flush).toHaveBeenCalledTimes(1)
    expect(insertion.dispose).toHaveBeenCalledTimes(1)
  })

  it('times out slow tasks instead of blocking forever', async () => {
    vi.useFakeTimers()
    const store = { flush: vi.fn(async () => undefined) }
    const insertion = { dispose: vi.fn(() => new Promise<void>(() => undefined)) }

    const shutdownPromise = shutdownServices({ store, insertion }, 50)
    await vi.advanceTimersByTimeAsync(60)
    await shutdownPromise

    expect(store.flush).toHaveBeenCalledTimes(1)
    expect(insertion.dispose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
