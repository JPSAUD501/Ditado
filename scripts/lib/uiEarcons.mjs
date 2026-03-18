import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SAMPLE_RATE = 48_000
export const BIT_DEPTH = 16
export const DEFAULT_CHANNELS = 1
const __dirname = dirname(fileURLToPath(import.meta.url))
export const OUTPUT_DIR = resolve(__dirname, '..', '..', 'public', 'audio', 'ui')

export const uiEarconDefinitions = {
  pttStart: { fileName: 'ptt_start.wav', durationMs: 0.26 },
  pttEnd: { fileName: 'ptt_end.wav', durationMs: 0.28 },
  pttTooShort: { fileName: 'ptt_too_short.wav', durationMs: 0.2 },
  tttStart: { fileName: 'ttt_start.wav', durationMs: 0.32 },
  tttEnd: { fileName: 'ttt_end.wav', durationMs: 0.32 },
  success: { fileName: 'success.wav', durationMs: 0.34 },
  error: { fileName: 'error.wav', durationMs: 0.3 },
}

export const earconEntries = Object.entries(uiEarconDefinitions).map(([name, definition]) => ({
  name,
  ...definition,
}))

export const toMonoSamples = (channels) => {
  if (!Array.isArray(channels) || channels.length === 0) {
    return new Float32Array()
  }

  if (channels.length === 1) {
    return Float32Array.from(channels[0])
  }

  const sampleCount = channels[0].length
  const mono = new Float32Array(sampleCount)

  for (let index = 0; index < sampleCount; index += 1) {
    let sample = 0
    for (const channel of channels) {
      sample += channel[index] ?? 0
    }
    mono[index] = sample / channels.length
  }

  return mono
}

export const normalizeChannelSet = (channels, targetPeak = 0.84) => {
  if (!Array.isArray(channels) || channels.length === 0) {
    return []
  }

  let maxAmplitude = 0
  for (const channel of channels) {
    for (const sample of channel) {
      maxAmplitude = Math.max(maxAmplitude, Math.abs(sample))
    }
  }

  if (maxAmplitude === 0) {
    return channels.map((channel) => Float32Array.from(channel))
  }

  const gain = targetPeak / maxAmplitude
  return channels.map((channel) => {
    const normalized = new Float32Array(channel.length)
    for (let index = 0; index < channel.length; index += 1) {
      normalized[index] = channel[index] * gain
    }
    return normalized
  })
}

export const normalizeSamples = (samples, targetPeak = 0.84) => {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    return samples
  }

  let maxAmplitude = 0
  for (const sample of samples) {
    maxAmplitude = Math.max(maxAmplitude, Math.abs(sample))
  }

  if (maxAmplitude === 0) {
    return Float32Array.from(samples)
  }

  const gain = targetPeak / maxAmplitude
  const normalized = new Float32Array(samples.length)

  for (let index = 0; index < samples.length; index += 1) {
    normalized[index] = samples[index] * gain
  }

  return normalized
}

export const applyFadeEnvelope = (
  samples,
  sampleRate = SAMPLE_RATE,
  fadeInMs = 4,
  fadeOutMs = 28,
) => {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    return samples
  }

  const faded = Float32Array.from(samples)
  const fadeInSamples = Math.min(faded.length, Math.max(1, Math.round(sampleRate * (fadeInMs / 1000))))
  const fadeOutSamples = Math.min(faded.length, Math.max(1, Math.round(sampleRate * (fadeOutMs / 1000))))

  for (let index = 0; index < fadeInSamples; index += 1) {
    const progress = fadeInSamples <= 1 ? 1 : index / (fadeInSamples - 1)
    const curve = progress * progress * (3 - 2 * progress)
    faded[index] *= curve
  }

  const fadeOutStart = Math.max(0, faded.length - fadeOutSamples)
  for (let offset = 0; offset < fadeOutSamples; offset += 1) {
    const index = fadeOutStart + offset
    const progress = fadeOutSamples <= 1 ? 1 : offset / (fadeOutSamples - 1)
    const curve = 1 - progress * progress * (3 - 2 * progress)
    faded[index] *= curve
  }

  return faded
}

export const shapeEarconSamples = (samples, sampleRate = SAMPLE_RATE) =>
  applyFadeEnvelope(normalizeSamples(samples), sampleRate)

export const shapeEarconChannels = (channels, sampleRate = SAMPLE_RATE) =>
  normalizeChannelSet(channels).map((channel) => applyFadeEnvelope(channel, sampleRate))

export const createWavBuffer = (samples, sampleRate = SAMPLE_RATE) => {
  const channelSamples = Array.isArray(samples) ? samples : [samples]
  const channelCount = Math.max(1, channelSamples.length)
  const frameCount = channelSamples[0]?.length ?? 0
  const bytesPerSample = BIT_DEPTH / 8
  const blockAlign = channelCount * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = frameCount * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channelCount, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(BIT_DEPTH, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  let offset = 44
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channelSamples[channelIndex][frameIndex] ?? 0))
      buffer.writeInt16LE(Math.round(sample * 32767), offset)
      offset += bytesPerSample
    }
  }

  return buffer
}
