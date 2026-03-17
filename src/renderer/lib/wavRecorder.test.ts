import { describe, expect, it, vi } from 'vitest'

import { WavRecorder } from './wavRecorder'

type RecorderTestHarness = WavRecorder & {
  recording: boolean
  audioContext: { sampleRate: number; close: () => Promise<void> } | null
  processor: { disconnect: () => void } | null
  source: { disconnect: () => void } | null
  sink: { disconnect: () => void } | null
  stream: { getTracks: () => Array<{ stop: () => void }> } | null
  chunks: Float32Array[]
  startedAtMs: number
}

describe('WavRecorder', () => {
  it('returns audioProcessingMs when finalizing captured audio', async () => {
    const recorder = new WavRecorder() as unknown as RecorderTestHarness

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

  it('warms audio capture resources when microphone warmup is allowed', async () => {
    const stopTrack = vi.fn()
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }],
    }))
    const addModule = vi.fn(async () => undefined)
    const resume = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      mediaDevices: { getUserMedia },
      permissions: {
        query: vi.fn(async () => ({ state: 'granted' })),
      },
    })
    vi.stubGlobal('AudioContext', class {
      audioWorklet = { addModule }
      state = 'suspended'
      resume = resume
      close = close
    })

    const recorder = new WavRecorder()
    await recorder.warmup(null)

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(addModule).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalledTimes(1)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('skips warmup on macOS when microphone permission is still undecided', async () => {
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    }))

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      mediaDevices: { getUserMedia },
      permissions: {
        query: vi.fn(async () => ({ state: 'prompt' })),
      },
    })

    const recorder = new WavRecorder()
    await recorder.warmup(null)

    expect(getUserMedia).not.toHaveBeenCalled()
  })
})
