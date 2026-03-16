import { describe, expect, it, vi } from 'vitest'

import { InsertionBenchmarkService } from './insertionBenchmarkService.js'

describe('InsertionBenchmarkService', () => {
  it('measures the current insertion mode using the real insertion session contract', async () => {
    const append = vi.fn(async () => undefined)
    const finalize = vi.fn(async () => ({
      insertionMethod: 'clipboard-protected' as const,
      fallbackUsed: false,
    }))
    const sessionWarmup = vi.fn(async () => undefined)
    const warmup = vi.fn(async () => undefined)
    const dispose = vi.fn(async () => undefined)

    const service = new InsertionBenchmarkService(
      {
        captureClipboardSnapshot: vi.fn(async () => ({ text: 'before benchmark' })),
        createWriterSession: vi.fn(() => ({
          warmup,
          writeProtected: vi.fn(async () => undefined),
          dispose,
        })),
        createProgressiveSession: vi.fn(() => ({
          warmup: sessionWarmup,
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
      mode: 'chunks',
      text: 'abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz',
    })

    expect(warmup).toHaveBeenCalledTimes(1)
    expect(sessionWarmup).toHaveBeenCalledTimes(1)
    expect(append).toHaveBeenCalled()
    expect(finalize).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('chunks')
    expect(result.targetApp).toBe('VS Code')
    expect(result.graphemeCount).toBeGreaterThan(20)
    expect(result.charactersPerSecond).toBeGreaterThan(0)
    expect(result.insertionMethod).toBe('clipboard-protected')
    expect(result.fallbackUsed).toBe(false)
  })
})
