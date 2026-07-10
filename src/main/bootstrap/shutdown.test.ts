import { describe, expect, it, vi } from 'vitest'

import { shutdownServices } from './shutdown.js'

describe('shutdownServices', () => {
  it('waits for insertion disposal', async () => {
    const insertion = { dispose: vi.fn(async () => undefined) }

    await shutdownServices({ insertion })

    expect(insertion.dispose).toHaveBeenCalledTimes(1)
  })

  it('times out slow tasks instead of blocking forever', async () => {
    vi.useFakeTimers()
    const insertion = { dispose: vi.fn(() => new Promise<void>(() => undefined)) }

    const shutdownPromise = shutdownServices({ insertion }, 50)
    await vi.advanceTimersByTimeAsync(60)
    await shutdownPromise

    expect(insertion.dispose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
