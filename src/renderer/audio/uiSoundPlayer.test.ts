import { describe, expect, it, vi, beforeEach } from 'vitest'

import { createIdleSession } from '@shared/defaults'

import { getUiSoundForSessionTransition } from './uiSoundEvents'
import { playUiSound, preloadUiSounds, resetUiSoundPlayerForTests } from './uiSoundPlayer'

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null
  connect = vi.fn()
  start = vi.fn()
}

class MockGainNode {
  gain = { value: 1 }
  connect = vi.fn()
}

class MockAudioContext {
  static decodeAudioData = vi.fn(async () => ({ duration: 0.12 } as AudioBuffer))

  state: AudioContextState = 'running'
  destination = {}
  decodeAudioData = MockAudioContext.decodeAudioData
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode())
  createGain = vi.fn(() => new MockGainNode())
  resume = vi.fn(async () => undefined)
}

const audioContextInstances: MockAudioContext[] = []
const AudioContextStub = vi.fn(() => {
  const context = new MockAudioContext()
  audioContextInstances.push(context)
  return context
})

describe('uiSoundEvents', () => {
  it('maps session transitions to the expected UI sound names', () => {
    const baseSession = {
      ...createIdleSession(),
      id: 'session-1',
      startedAt: new Date().toISOString(),
      targetApp: 'VS Code',
    }

    expect(getUiSoundForSessionTransition(null, {
      ...baseSession,
      activationMode: 'push-to-talk',
      status: 'arming',
      captureIntent: 'start',
    })).toBe('pttStart')

    expect(getUiSoundForSessionTransition({
      ...baseSession,
      activationMode: 'push-to-talk',
      status: 'listening',
      captureIntent: 'start',
    }, {
      ...baseSession,
      activationMode: 'push-to-talk',
      status: 'processing',
      captureIntent: 'stop',
    })).toBe('pttEnd')

    expect(getUiSoundForSessionTransition(null, {
      ...baseSession,
      activationMode: 'push-to-talk',
      status: 'notice',
      captureIntent: 'none',
      noticeMessage: 'notices.holdToDictate::Shift+Alt',
    })).toBe('pttTooShort')

    expect(getUiSoundForSessionTransition(null, {
      ...baseSession,
      activationMode: 'toggle',
      status: 'arming',
      captureIntent: 'start',
    })).toBe('tttStart')

    expect(getUiSoundForSessionTransition({
      ...baseSession,
      activationMode: 'toggle',
      status: 'listening',
      captureIntent: 'start',
    }, {
      ...baseSession,
      activationMode: 'toggle',
      status: 'processing',
      captureIntent: 'stop',
    })).toBe('tttEnd')

    expect(getUiSoundForSessionTransition({
      ...baseSession,
      status: 'streaming',
    }, {
      ...baseSession,
      status: 'completed',
      finalText: 'done',
    })).toBe('success')

    expect(getUiSoundForSessionTransition({
      ...baseSession,
      status: 'processing',
    }, {
      ...baseSession,
      status: 'error',
      errorMessage: 'boom',
    })).toBe('error')
  })

  it('does not replay the short-press sound when the same notice is rebroadcast', () => {
    const shortPressNotice = {
      ...createIdleSession(),
      id: 'session-1',
      activationMode: 'push-to-talk' as const,
      status: 'notice' as const,
      captureIntent: 'none' as const,
      noticeMessage: 'notices.holdToDictate::Shift+Alt',
    }

    expect(getUiSoundForSessionTransition(shortPressNotice, {
      ...shortPressNotice,
    })).toBeNull()
  })
})

describe('uiSoundPlayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    audioContextInstances.length = 0
    resetUiSoundPlayerForTests()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })))
    vi.stubGlobal('AudioContext', AudioContextStub)
  })

  it('preloads and decodes every UI sound asset', async () => {
    await preloadUiSounds()
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(MockAudioContext.decodeAudioData).toHaveBeenCalledTimes(7)
  })

  it('applies a cooldown so the same sound does not spam repeatedly', async () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(100)
    await playUiSound('success')

    now.mockReturnValue(150)
    await playUiSound('success')

    now.mockReturnValue(400)
    await playUiSound('success')

    expect(audioContextInstances[0]?.createBufferSource).toHaveBeenCalledTimes(2)
  })

  it('plays UI sounds at a lower output gain', async () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(100)

    await playUiSound('success')

    expect(audioContextInstances[0]?.createGain).toHaveBeenCalledTimes(1)
    expect((audioContextInstances[0]?.createGain.mock.results[0]?.value as MockGainNode).gain.value).toBeCloseTo(0.15)
  })
})
