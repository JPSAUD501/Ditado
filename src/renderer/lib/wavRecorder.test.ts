import { describe, expect, it, vi } from 'vitest'

import { WavRecorder } from './wavRecorder'

describe('WavRecorder', () => {
  it('returns audioProcessingMs when finalizing captured audio', async () => {
    const recorder = new WavRecorder() as any

    recorder.recording = true
    recorder.audioContext = {
      sampleRate: 16_000,
      close: vi.fn(async () => undefined),
    }
    recorder.processor = { disconnect: vi.fn() }
    recorder.source = { disconnect: vi.fn() }
    recorder.sink = { disconnect: vi.fn() }
    recorder.stream = {
      getTracks: () => [{ stop: vi.fn() }],
    }
    recorder.chunks = [new Float32Array([0.12, -0.08, 0.05, -0.02])]
    recorder.startedAtMs = Date.now() - 500

    const payload = await recorder.stop('pt-BR')

    expect(payload.audioProcessingMs).toBeGreaterThanOrEqual(0)
    expect(payload.mimeType).toBe('audio/wav')
    expect(payload.audioBase64.length).toBeGreaterThan(0)
    expect(payload.durationMs).toBeGreaterThan(0)
  })
})
