import type { DictationAudioPayload } from '@shared/contracts'

export const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000

const RECORDER_WORKLET_NAME = 'ditado-recorder-worklet'
const recorderWorkletUrl = new URL('./ditadoRecorderProcessor.js', import.meta.url)

const mergeChunks = (chunks: Float32Array[]): Float32Array => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(length)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

const analyzeSamples = (samples: Float32Array): {
  peakAmplitude: number
  rmsAmplitude: number
  speechDetected: boolean
} => {
  if (!samples.length) {
    return {
      peakAmplitude: 0,
      rmsAmplitude: 0,
      speechDetected: false,
    }
  }

  let peakAmplitude = 0
  let energySum = 0
  let activeSamples = 0

  for (const sample of samples) {
    const absolute = Math.abs(sample)
    peakAmplitude = Math.max(peakAmplitude, absolute)
    energySum += absolute * absolute
    if (absolute >= 0.02) {
      activeSamples += 1
    }
  }

  const rmsAmplitude = Math.sqrt(energySum / samples.length)
  const activityRatio = activeSamples / samples.length

  return {
    peakAmplitude,
    rmsAmplitude,
    speechDetected: peakAmplitude >= 0.045 && (rmsAmplitude >= 0.008 || activityRatio >= 0.012),
  }
}

const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const normalized = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff, true)
    offset += 2
  }

  return buffer
}

const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export class WavRecorder {
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private chunks: Float32Array[] = []
  private recording = false
  private startedAtMs = 0

  async start(deviceId: string | null): Promise<void> {
    if (this.recording) {
      return
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    })
    this.audioContext = new AudioContext()
    await this.audioContext.audioWorklet.addModule(recorderWorkletUrl)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    this.source = this.audioContext.createMediaStreamSource(this.stream)
    this.processor = new AudioWorkletNode(this.audioContext, RECORDER_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    })
    this.sink = this.audioContext.createGain()
    this.sink.gain.value = 0
    this.chunks = []
    this.startedAtMs = Date.now()

    this.processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const chunk = event.data
      if (!(chunk instanceof Float32Array) || chunk.length === 0) {
        return
      }
      this.chunks.push(chunk)
    }

    this.source.connect(this.processor)
    this.processor.connect(this.sink)
    this.sink.connect(this.audioContext.destination)
    this.recording = true
  }

  isRecording(): boolean {
    return this.recording
  }

  async stop(languageHint: string | null): Promise<DictationAudioPayload> {
    if (!this.recording || !this.audioContext) {
      throw new Error('Recorder is not active')
    }

    this.recording = false
    const sampleRate = this.audioContext.sampleRate
    this.cleanup()

    const samples = mergeChunks(this.chunks)
    if (!samples.length) {
      throw new Error('No audio captured')
    }
    const analysis = analyzeSamples(samples)

    const wavBuffer = encodeWav(samples, sampleRate)
    this.chunks = []

    return {
      wavBase64: toBase64(wavBuffer),
      mimeType: 'audio/wav',
      languageHint,
      durationMs: Math.min(Math.max(Date.now() - this.startedAtMs, 0), MAX_RECORDING_DURATION_MS),
      speechDetected: analysis.speechDetected,
      peakAmplitude: analysis.peakAmplitude,
      rmsAmplitude: analysis.rmsAmplitude,
    }
  }

  async cancel(): Promise<void> {
    this.recording = false
    this.startedAtMs = 0
    this.chunks = []
    this.cleanup()
  }

  private cleanup(): void {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.sink?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.audioContext?.close()
    this.processor = null
    this.source = null
    this.sink = null
    this.stream = null
    this.audioContext = null
    this.startedAtMs = 0
  }
}
