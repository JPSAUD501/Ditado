import type { DictationAudioPayload, RecorderWarmupStatus } from '@shared/contracts'
import recorderWorkletUrl from './ditadoRecorderProcessor.js?url&no-inline'

export const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000
const MP3_MIME_CANDIDATES = ['audio/mpeg', 'audio/mp3'] as const

const RECORDER_WORKLET_NAME = 'ditado-recorder-worklet'

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

const encodeWav = (samples: Float32Array, sampleRate: number): Uint8Array => {
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

  return new Uint8Array(buffer)
}

const chooseEncodedMimeType = (): string | null => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null
  }

  return MP3_MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export class WavRecorder {
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private mediaRecorder: MediaRecorder | null = null
  private encodedChunks: Blob[] = []
  private encodedMimeType: string | null = null
  private encodedStopPromise: Promise<Blob | null> | null = null
  private chunks: Float32Array[] = []
  private recording = false
  private startedAtMs = 0
  private warmupPromise: Promise<RecorderWarmupStatus> | null = null

  /** Called with a normalized audio level (0–1) roughly every ~80ms while recording. */
  onAudioLevel: ((level: number) => void) | null = null

  setOnAudioLevel(listener: ((level: number) => void) | null): void {
    this.onAudioLevel = listener
  }

  async warmup(deviceId: string | null): Promise<RecorderWarmupStatus> {
    if (this.recording || this.audioContext || this.warmupPromise) {
      return this.warmupPromise ?? Promise.resolve('warmed')
    }

    this.warmupPromise = this.performWarmup(deviceId).finally(() => {
      this.warmupPromise = null
    })
    return this.warmupPromise
  }

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
    this.encodedChunks = []
    this.encodedMimeType = chooseEncodedMimeType()
    this.startedAtMs = Date.now()

    if (this.encodedMimeType) {
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.encodedMimeType })
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.encodedChunks.push(event.data)
        }
      }
      this.encodedStopPromise = new Promise((resolve) => {
        if (!this.mediaRecorder) {
          resolve(null)
          return
        }

        this.mediaRecorder.onstop = () => {
          if (!this.encodedMimeType || this.encodedChunks.length === 0) {
            resolve(null)
            return
          }
          resolve(new Blob(this.encodedChunks, { type: this.encodedMimeType }))
        }
      })
      this.mediaRecorder.start()
    } else {
      this.mediaRecorder = null
      this.encodedStopPromise = Promise.resolve(null)
    }

    this.processor.port.onmessage = (event: MessageEvent<Float32Array | { type: string; value: number }>) => {
      const data = event.data

      // RMS level message from worklet
      if (data && typeof data === 'object' && 'type' in data && data.type === 'rms') {
        this.onAudioLevel?.(data.value)
        return
      }

      const chunk = data as Float32Array
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

    const processingStartedAt = performance.now()
    const durationMs = Math.min(Math.max(Date.now() - this.startedAtMs, 0), MAX_RECORDING_DURATION_MS)
    this.recording = false
    const sampleRate = this.audioContext.sampleRate
    const encodedBlobPromise = this.stopMediaRecorder()

    const samples = mergeChunks(this.chunks)
    if (!samples.length) {
      this.cleanup()
      throw new Error('No audio captured')
    }
    const analysis = analyzeSamples(samples)
    const encodedBlob = await encodedBlobPromise
    const audioBytes = encodedBlob
      ? new Uint8Array(await encodedBlob.arrayBuffer())
      : encodeWav(samples, sampleRate)
    const mimeType = encodedBlob?.type || 'audio/wav'
    this.chunks = []
    this.cleanup()
    const audioProcessingMs = Math.round(performance.now() - processingStartedAt)

    return {
      audioBase64: toBase64(audioBytes),
      mimeType,
      languageHint,
      durationMs,
      audioProcessingMs,
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
    this.mediaRecorder = null
    this.encodedChunks = []
    this.encodedMimeType = null
    this.encodedStopPromise = null
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

  private async performWarmup(deviceId: string | null): Promise<RecorderWarmupStatus> {
    if (!(await this.shouldWarmupMicrophone())) {
      return 'skipped'
    }

    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      audioContext = new AudioContext()
      await audioContext.audioWorklet.addModule(recorderWorkletUrl)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      return 'warmed'
    } catch {
      // Startup warmup is opportunistic; normal capture remains the source of truth.
      return 'failed'
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
      if (audioContext) {
        void audioContext.close()
      }
    }
  }

  private async shouldWarmupMicrophone(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      return false
    }

    const isMac = /\bMac\b/i.test(navigator.userAgent)
    if (!navigator.permissions?.query) {
      return !isMac
    }

    try {
      const permissionStatus = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      })

      if (permissionStatus.state === 'denied') {
        return false
      }

      if (permissionStatus.state === 'granted') {
        return true
      }

      return !isMac
    } catch {
      return !isMac
    }
  }

  private stopMediaRecorder(): Promise<Blob | null> {
    if (!this.mediaRecorder) {
      return Promise.resolve(null)
    }

    const stopPromise = this.encodedStopPromise ?? Promise.resolve(null)
    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    return stopPromise
  }
}
