import { describe, expect, it } from 'vitest'

import {
  applyFadeEnvelope,
  BIT_DEPTH,
  DEFAULT_CHANNELS,
  SAMPLE_RATE,
  createWavBuffer,
  earconEntries,
  normalizeChannelSet,
  normalizeSamples,
  shapeEarconChannels,
  shapeEarconSamples,
  toMonoSamples,
  uiEarconDefinitions,
} from '../scripts/lib/uiEarcons.mjs'

describe('ui earcon metadata', () => {
  it('defines the full earcon pack with bounded short durations', () => {
    expect(earconEntries).toHaveLength(7)

    for (const entry of earconEntries) {
      expect(uiEarconDefinitions[entry.name].fileName).toBe(entry.fileName)
      expect(entry.durationMs).toBeGreaterThanOrEqual(0.12)
      expect(entry.durationMs).toBeLessThanOrEqual(0.34)
    }
  })
})

describe('wav helpers', () => {
  it('downmixes multiple channels to mono and writes a valid 48kHz 16-bit wav', () => {
    const mono = toMonoSamples([
      [0, 0.5, -0.5, 0.25],
      [0, -0.5, 0.5, 0.75],
    ])

    expect(Array.from(mono)).toEqual([0, 0, 0, 0.5])

    const buffer = createWavBuffer(mono)

    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF')
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE')
    expect(buffer.readUInt16LE(22)).toBe(DEFAULT_CHANNELS)
    expect(buffer.readUInt32LE(24)).toBe(SAMPLE_RATE)
    expect(buffer.readUInt16LE(34)).toBe(BIT_DEPTH)
    expect(buffer.readUInt32LE(40)).toBeGreaterThan(0)
  })

  it('normalizes peaks and applies gentle fades for smoother earcons', () => {
    const base = Float32Array.from([0.1, 0.5, -0.25, 0.75, -0.5, 0.2])
    const normalized = normalizeSamples(base, 0.8)

    expect(Math.max(...Array.from(normalized, (sample) => Math.abs(sample)))).toBeCloseTo(0.8, 4)

    const faded = applyFadeEnvelope(Float32Array.from([1, 1, 1, 1]), 1_000, 2, 2)
    expect(Array.from(faded)).toEqual([0, 1, 1, 0])

    const shaped = shapeEarconSamples(Float32Array.from([0.2, 0.4, 0.8, 0.4, 0.2]), 1_000)
    expect(shaped[0]).toBe(0)
    expect(shaped[shaped.length - 1]).toBe(0)
  })

  it('keeps stereo channels aligned and writes interleaved multichannel wav data', () => {
    const stereo = normalizeChannelSet([
      Float32Array.from([0.2, 0.4, 0.1]),
      Float32Array.from([0.1, 0.3, 0.6]),
    ], 0.75)

    const shapedStereo = shapeEarconChannels(stereo, 1_000)
    const buffer = createWavBuffer(shapedStereo, 1_000)

    expect(buffer.readUInt16LE(22)).toBe(2)
    expect(buffer.readUInt32LE(24)).toBe(1_000)
    expect(buffer.readInt16LE(44)).toBe(0)
    expect(buffer.readInt16LE(46)).toBe(0)
    expect(buffer.readUInt32LE(40)).toBe(12)
  })
})
