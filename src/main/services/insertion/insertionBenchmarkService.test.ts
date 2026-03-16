import { describe, expect, it, vi } from 'vitest'

import { InsertionBenchmarkService } from './insertionBenchmarkService.js'

describe('InsertionBenchmarkService', () => {
  it('reports requested and effective modes using the progressive insertion session contract', async () => {
    const append = vi.fn(async () => undefined)
    const finalize = vi.fn(async () => ({
      requestedMode: 'letter-by-letter' as const,
      effectiveMode: 'all-at-once' as const,
      insertionMethod: 'clipboard-all-at-once' as const,
      fallbackUsed: true,
    }))
    const warmup = vi.fn(async () => undefined)

    const service = new InsertionBenchmarkService(
      {
        createProgressiveSession: vi.fn(() => ({
          warmup,
          append,
          finalize,
        })),
      } as never,
      {
        capture: vi.fn(async () => ({
          appName: 'VS Code',
          windowTitle: 'bench.txt',
          selectedText: '',
          permissionsGranted: true,
          confidence: 'high',
          capturedAt: new Date().toISOString(),
        })),
      } as never,
    )

    const result = await service.run({
      mode: 'letter-by-letter',
      text: 'abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz',
    })

    expect(warmup).toHaveBeenCalledTimes(1)
    expect(append).toHaveBeenCalledWith('abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz')
    expect(finalize).toHaveBeenCalledWith('abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz')
    expect(result.mode).toBe('letter-by-letter')
    expect(result.effectiveMode).toBe('all-at-once')
    expect(result.targetApp).toBe('VS Code')
    expect(result.graphemeCount).toBeGreaterThan(20)
    expect(result.charactersPerSecond).toBeGreaterThan(0)
    expect(result.insertionMethod).toBe('clipboard-all-at-once')
    expect(result.fallbackUsed).toBe(true)
  })
})
