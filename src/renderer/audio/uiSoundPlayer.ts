import type { UiSoundName } from '@shared/uiSounds'
import { resolveUiSoundAssetUrl, uiSoundCooldownMs, uiSoundNames } from '@shared/uiSounds'

type SoundBufferCache = Partial<Record<UiSoundName, AudioBuffer>>
type SoundTimeCache = Partial<Record<UiSoundName, number>>

const UI_SOUND_PLAYBACK_GAIN = 0.15

class UiSoundPlayer {
  private audioContext: AudioContext | null = null
  private readonly buffers: SoundBufferCache = {}
  private readonly lastPlayedAtMs: SoundTimeCache = {}
  private preloadPromise: Promise<void> | null = null

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null
    }

    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
    const AudioContextCtor = globalThis.AudioContext ?? audioWindow.webkitAudioContext
    if (!AudioContextCtor) {
      return null
    }

    this.audioContext ??= new AudioContextCtor()
    return this.audioContext
  }

  private async decodeSound(name: UiSoundName): Promise<AudioBuffer | null> {
    if (this.buffers[name]) {
      return this.buffers[name] ?? null
    }

    const context = this.getAudioContext()
    if (!context) {
      return null
    }

    const response = await fetch(resolveUiSoundAssetUrl(name))
    if (!response.ok) {
      throw new Error(`Failed to load UI sound: ${name}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0))
    this.buffers[name] = decoded
    return decoded
  }

  async preload(): Promise<void> {
    if (this.preloadPromise) {
      return this.preloadPromise
    }

    this.preloadPromise = Promise.all(uiSoundNames.map(async (name) => {
      await this.decodeSound(name)
    })).then(() => undefined)

    return this.preloadPromise
  }

  async play(name: UiSoundName): Promise<void> {
    const context = this.getAudioContext()
    if (!context) {
      return
    }

    const nowMs = performance.now()
    const lastPlayedAtMs = this.lastPlayedAtMs[name] ?? -Infinity
    if (nowMs - lastPlayedAtMs < uiSoundCooldownMs[name]) {
      return
    }

    const buffer = await this.decodeSound(name)
    if (!buffer) {
      return
    }

    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined)
    }

    const source = context.createBufferSource()
    const gain = context.createGain()
    gain.gain.value = UI_SOUND_PLAYBACK_GAIN
    source.buffer = buffer
    source.connect(gain)
    gain.connect(context.destination)
    source.start()
    this.lastPlayedAtMs[name] = nowMs
  }

  resetForTests(): void {
    this.preloadPromise = null
    this.audioContext = null
    for (const name of uiSoundNames) {
      delete this.buffers[name]
      delete this.lastPlayedAtMs[name]
    }
  }
}

const uiSoundPlayer = new UiSoundPlayer()

export const preloadUiSounds = (): Promise<void> => uiSoundPlayer.preload()
export const playUiSound = (name: UiSoundName): Promise<void> => uiSoundPlayer.play(name)
export const resetUiSoundPlayerForTests = (): void => uiSoundPlayer.resetForTests()
