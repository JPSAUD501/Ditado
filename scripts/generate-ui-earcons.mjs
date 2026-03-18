import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { app, BrowserWindow } from 'electron'

import { OUTPUT_DIR, createWavBuffer, earconEntries, shapeEarconChannels } from './lib/uiEarcons.mjs'

const require = createRequire(import.meta.url)
const toneBundleUrl = pathToFileURL(join(dirname(require.resolve('tone')), '..', 'Tone.js')).toString()
const shellHtmlPath = join(dirname(fileURLToPath(import.meta.url)), 'renderer-shell.html')

const renderInRenderer = async (entries, toneUrl) => {
  const renderTailPaddingMs = 80

  if (!window.Tone) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = toneUrl
      script.onload = resolve
      script.onerror = () => reject(new Error(`Failed to load Tone bundle: ${toneUrl}`))
      document.head.appendChild(script)
    })
  }

  const Tone = window.Tone

  const createMaster = async () => {
    const output = new Tone.Gain(0.8).toDestination()
    const limiter = new Tone.Limiter(-1.5).connect(output)
    const compressor = new Tone.Compressor({
      threshold: -27,
      ratio: 1.9,
      attack: 0.014,
      release: 0.22,
    }).connect(limiter)
    const lowpass = new Tone.Filter(7_400, 'lowpass').connect(compressor)
    const highpass = new Tone.Filter(55, 'highpass').connect(lowpass)
    const space = new Tone.Freeverb({
      roomSize: 0.3,
      dampening: 2_800,
    }).connect(compressor)
    const spaceSend = new Tone.Gain(0.22).connect(space)
    const glossDelay = new Tone.FeedbackDelay({
      delayTime: 0.07,
      feedback: 0.08,
      wet: 0.025,
    }).connect(compressor)
    const glossSend = new Tone.Gain(0.05).connect(glossDelay)

    return {
      input: highpass,
      space: spaceSend,
      gloss: glossSend,
      dispose: () => {
        glossSend.dispose()
        glossDelay.dispose()
        spaceSend.dispose()
        space.dispose()
        highpass.dispose()
        lowpass.dispose()
        compressor.dispose()
        limiter.dispose()
        output.dispose()
      },
    }
  }

  const createStereoPath = (destination, space, gloss, pan = 0, spaceWet = 0.12, glossWet = 0.04) => {
    const panner = new Tone.Panner(pan)
    const spaceSend = new Tone.Gain(spaceWet).connect(space)
    const glossSend = new Tone.Gain(glossWet).connect(gloss)
    panner.connect(destination)
    panner.connect(spaceSend)
    panner.connect(glossSend)
    return {
      input: panner,
      dispose: () => {
        panner.dispose()
        spaceSend.dispose()
        glossSend.dispose()
      },
    }
  }

  const addAirPulse = (
    time,
    destination,
    space,
    gloss,
    {
      amount = 0.035,
      attack = 0.004,
      decay = 0.05,
      hp = 1_000,
      lp = 4_000,
      wet = 0.08,
      glossWet = 0.012,
      pan = 0,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, wet, glossWet)
    const highpass = new Tone.Filter(hp, 'highpass')
    const lowpass = new Tone.Filter(lp, 'lowpass').connect(path.input)
    const noise = new Tone.NoiseSynth({
      volume: Tone.gainToDb(amount),
      noise: { type: 'pink' },
      envelope: {
        attack,
        decay,
        sustain: 0,
        release: 0.02,
      },
    })
    noise.connect(highpass)
    highpass.connect(lowpass)
    noise.triggerAttackRelease(decay, time)
  }

  const addBloom = (
    time,
    destination,
    space,
    gloss,
    {
      amount = 0.016,
      attack = 0.012,
      decay = 0.1,
      lp = 1_800,
      wet = 0.22,
      glossWet = 0.02,
      pan = 0,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, wet, glossWet)
    const lowpass = new Tone.Filter(lp, 'lowpass').connect(path.input)
    const noise = new Tone.NoiseSynth({
      volume: Tone.gainToDb(amount),
      noise: { type: 'pink' },
      envelope: {
        attack,
        decay,
        sustain: 0,
        release: 0.03,
      },
    })
    noise.connect(lowpass)
    noise.triggerAttackRelease(decay, time)
  }

  const buildVelvetPoly = (
    destination,
    space,
    gloss,
    {
      volume = -16,
      cutoff = 4_200,
      delayTime = 0.065,
      delayWet = 0.05,
      spaceWet = 0.18,
      glossWet = 0.02,
      pan = 0,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, spaceWet, glossWet)
    const filter = new Tone.Filter(cutoff, 'lowpass').connect(path.input)
    const synth = new Tone.PolySynth(Tone.Synth, {
      volume,
      oscillator: {
        type: 'triangle',
        partials: [1, 0.24, 0.06],
      },
      envelope: {
        attack: 0.018,
        decay: 0.16,
        sustain: 0.22,
        release: 0.24,
      },
    })
    const delay = new Tone.FeedbackDelay({
      delayTime,
      feedback: 0.1,
      wet: delayWet,
    }).connect(path.input)
    synth.connect(filter)
    synth.connect(delay)
    return {
      synth,
      dispose: () => {
        synth.dispose()
        filter.dispose()
        delay.dispose()
        path.dispose()
      },
    }
  }

  const buildHaloBell = (
    destination,
    space,
    gloss,
    {
      volume = -22,
      cutoff = 4_800,
      delayWet = 0.06,
      spaceWet = 0.18,
      glossWet = 0.025,
      pan = 0,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, spaceWet, glossWet)
    const filter = new Tone.Filter(cutoff, 'lowpass').connect(path.input)
    const synth = new Tone.FMSynth({
      volume,
      harmonicity: 1.5,
      modulationIndex: 2.2,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: {
        attack: 0.01,
        decay: 0.16,
        sustain: 0,
        release: 0.22,
      },
      modulationEnvelope: {
        attack: 0.006,
        decay: 0.12,
        sustain: 0,
        release: 0.16,
      },
    })
    const earlyDelay = new Tone.FeedbackDelay({
      delayTime: 0.04,
      feedback: 0.06,
      wet: delayWet * 0.55,
    }).connect(path.input)
    const lateDelay = new Tone.FeedbackDelay({
      delayTime: 0.068,
      feedback: 0.1,
      wet: delayWet,
    }).connect(path.input)
    synth.connect(filter)
    synth.connect(earlyDelay)
    synth.connect(lateDelay)
    return {
      synth,
      dispose: () => {
        synth.dispose()
        filter.dispose()
        earlyDelay.dispose()
        lateDelay.dispose()
        path.dispose()
      },
    }
  }

  const buildWarmMono = (
    destination,
    space,
    gloss,
    {
      volume = -20,
      cutoff = 1_450,
      spaceWet = 0.14,
      glossWet = 0.01,
      pan = 0,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, spaceWet, glossWet)
    const filter = new Tone.Filter(cutoff, 'lowpass').connect(path.input)
    const synth = new Tone.MonoSynth({
      volume,
      oscillator: { type: 'sine' },
      filter: { Q: 0.5, type: 'lowpass', rolloff: -24 },
      envelope: {
        attack: 0.02,
        decay: 0.2,
        sustain: 0.14,
        release: 0.24,
      },
      filterEnvelope: {
        attack: 0.018,
        decay: 0.16,
        sustain: 0,
        release: 0.22,
        baseFrequency: 100,
        octaves: 1.8,
      },
    }).connect(filter)
    return {
      synth,
      dispose: () => {
        synth.dispose()
        filter.dispose()
        path.dispose()
      },
    }
  }

  const buildSilkPluck = (
    destination,
    space,
    gloss,
    {
      volume = -18,
      dampening = 2_200,
      delayWet = 0.035,
      spaceWet = 0.16,
      glossWet = 0.015,
      pan = 0,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, spaceWet, glossWet)
    const filter = new Tone.Filter(3_600, 'lowpass').connect(path.input)
    const delay = new Tone.FeedbackDelay({
      delayTime: 0.06,
      feedback: 0.08,
      wet: delayWet,
    }).connect(path.input)
    const synth = new Tone.PluckSynth({
      volume,
      attackNoise: 0.08,
      dampening,
      resonance: 0.18,
    })
    synth.connect(filter)
    synth.connect(delay)
    return {
      synth,
      dispose: () => {
        synth.dispose()
        filter.dispose()
        delay.dispose()
        path.dispose()
      },
    }
  }

  const buildGlassSparkle = (
    destination,
    space,
    gloss,
    {
      volume = -32,
      pan = 0,
      spaceWet = 0.1,
      glossWet = 0.03,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, spaceWet, glossWet)
    const filter = new Tone.Filter(4_400, 'lowpass').connect(path.input)
    const synth = new Tone.FMSynth({
      volume,
      harmonicity: 1.8,
      modulationIndex: 1.2,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: 0.08,
        sustain: 0,
        release: 0.14,
      },
      modulationEnvelope: {
        attack: 0.008,
        decay: 0.05,
        sustain: 0,
        release: 0.1,
      },
    }).connect(filter)
    return {
      synth,
      dispose: () => {
        synth.dispose()
        filter.dispose()
        path.dispose()
      },
    }
  }

  const buildAiryPad = (
    destination,
    space,
    gloss,
    {
      volume = -21,
      cutoff = 3_600,
      spaceWet = 0.24,
      glossWet = 0.015,
      pan = 0,
    } = {},
  ) => {
    const path = createStereoPath(destination, space, gloss, pan, spaceWet, glossWet)
    const filter = new Tone.Filter(cutoff, 'lowpass').connect(path.input)
    const synth = new Tone.PolySynth(Tone.AMSynth, {
      volume,
      harmonicity: 1.25,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: {
        attack: 0.03,
        decay: 0.16,
        sustain: 0.34,
        release: 0.3,
      },
      modulationEnvelope: {
        attack: 0.016,
        decay: 0.12,
        sustain: 0.06,
        release: 0.18,
      },
    })
    const chorus = new Tone.Chorus({
      frequency: 1.2,
      delayTime: 4.2,
      depth: 0.24,
      spread: 80,
      wet: 0.1,
    }).connect(path.input)
    synth.connect(filter)
    synth.connect(chorus)
    return {
      synth,
      dispose: () => {
        synth.dispose()
        filter.dispose()
        chorus.dispose()
        path.dispose()
      },
    }
  }

  const triggerSequence = (instrument, events) => {
    for (const event of events) {
      instrument.triggerAttackRelease(event.note, event.duration, event.time, event.velocity)
    }
  }

  const triggerChordSequence = (instrument, events) => {
    for (const event of events) {
      instrument.triggerAttackRelease(event.notes, event.duration, event.time, event.velocity)
    }
  }

  const renderSingle = async (entry) => {
    const duration = entry.durationMs + (renderTailPaddingMs / 1000)

    const rendered = await Tone.Offline(async () => {
      const master = await createMaster()
      const poly = buildVelvetPoly(master.input, master.space, master.gloss, {
        pan: -0.1,
      })
      const widePoly = buildVelvetPoly(master.input, master.space, master.gloss, {
        volume: -18,
        cutoff: 6_200,
        delayTime: 0.07,
        delayWet: 0.12,
        spaceWet: 0.2,
        glossWet: 0.08,
        pan: 0.18,
      })
      const bell = buildHaloBell(master.input, master.space, master.gloss, {
        pan: 0.08,
      })
      const warm = buildWarmMono(master.input, master.space, master.gloss, {
        pan: -0.05,
      })
      const pluck = buildSilkPluck(master.input, master.space, master.gloss, {
        pan: -0.16,
      })
      const pad = buildAiryPad(master.input, master.space, master.gloss, {
        pan: 0.12,
      })
      const sparkleLeft = buildGlassSparkle(master.input, master.space, master.gloss, {
        pan: -0.32,
      })
      const sparkleRight = buildGlassSparkle(master.input, master.space, master.gloss, {
        pan: 0.3,
      })

      switch (entry.name) {
        case 'pttStart':
          addAirPulse(0, master.input, master.space, master.gloss, { amount: 0.024, hp: 2_000, lp: 5_600, pan: -0.08 })
          addBloom(0.012, master.input, master.space, master.gloss, { amount: 0.012, attack: 0.009, decay: 0.09, lp: 2_800, pan: 0.16 })
          pad.synth.triggerAttackRelease(['G4', 'A4', 'D5'], 0.22, 0.01, 0.18)
          triggerSequence(pluck.synth, [
            { note: 'G5', time: 0.008, duration: 0.07, velocity: 0.3 },
            { note: 'A5', time: 0.05, duration: 0.06, velocity: 0.22 },
          ])
          triggerChordSequence(poly.synth, [
            { notes: ['G5', 'B5', 'D6'], time: 0.02, duration: 0.1, velocity: 0.34 },
            { notes: ['A5', 'D6', 'F#6'], time: 0.072, duration: 0.11, velocity: 0.22 },
          ])
          triggerSequence(bell.synth, [
            { note: 'D6', time: 0.058, duration: 0.11, velocity: 0.16 },
            { note: 'A6', time: 0.108, duration: 0.09, velocity: 0.09 },
          ])
          warm.synth.triggerAttackRelease('G3', 0.19, 0.012, 0.22)
          break
        case 'pttEnd':
          addAirPulse(0, master.input, master.space, master.gloss, { amount: 0.022, hp: 1_100, lp: 4_300, pan: 0.06 })
          addBloom(0.016, master.input, master.space, master.gloss, { amount: 0.01, attack: 0.009, decay: 0.1, lp: 2_000, pan: -0.14 })
          pad.synth.triggerAttackRelease(['D4', 'F#4', 'A4'], 0.22, 0.016, 0.16)
          triggerSequence(pluck.synth, [
            { note: 'A5', time: 0.015, duration: 0.07, velocity: 0.24 },
            { note: 'F#5', time: 0.055, duration: 0.075, velocity: 0.22 },
          ])
          triggerChordSequence(poly.synth, [
            { notes: ['A5', 'D6', 'F#6'], time: 0.022, duration: 0.11, velocity: 0.3 },
            { notes: ['F#5', 'A5', 'D6'], time: 0.085, duration: 0.12, velocity: 0.18 },
          ])
          triggerSequence(bell.synth, [
            { note: 'A5', time: 0.07, duration: 0.1, velocity: 0.13 },
            { note: 'E6', time: 0.13, duration: 0.09, velocity: 0.08 },
          ])
          warm.synth.triggerAttackRelease('D3', 0.21, 0.016, 0.22)
          break
        case 'pttTooShort':
          addAirPulse(0, master.input, master.space, master.gloss, { amount: 0.018, attack: 0.002, decay: 0.03, hp: 2_300, lp: 5_400, wet: 0.06, pan: -0.18 })
          addAirPulse(0.03, master.input, master.space, master.gloss, { amount: 0.012, attack: 0.002, decay: 0.028, hp: 1_900, lp: 4_600, wet: 0.05, pan: 0.18 })
          triggerSequence(pluck.synth, [
            { note: 'B4', time: 0.012, duration: 0.05, velocity: 0.18 },
            { note: 'C5', time: 0.055, duration: 0.055, velocity: 0.2 },
          ])
          triggerChordSequence(poly.synth, [
            { notes: ['G4', 'B4'], time: 0.02, duration: 0.07, velocity: 0.14 },
            { notes: ['A4', 'C5'], time: 0.07, duration: 0.075, velocity: 0.16 },
          ])
          bell.synth.triggerAttackRelease('E5', 0.08, 0.115, 0.08)
          warm.synth.triggerAttackRelease('G3', 0.14, 0.018, 0.14)
          break
        case 'tttStart':
          addAirPulse(0, master.input, master.space, master.gloss, { amount: 0.032, attack: 0.004, decay: 0.06, hp: 1_250, lp: 5_400, pan: -0.1 })
          addBloom(0.014, master.input, master.space, master.gloss, { amount: 0.02, attack: 0.014, decay: 0.12, lp: 2_900, wet: 0.26, pan: 0.12 })
          pad.synth.triggerAttackRelease(['B3', 'D4', 'F#4', 'A4'], 0.28, 0.008, 0.2)
          triggerSequence(pluck.synth, [
            { note: 'D5', time: 0.01, duration: 0.07, velocity: 0.22 },
            { note: 'F#5', time: 0.045, duration: 0.075, velocity: 0.24 },
            { note: 'A5', time: 0.09, duration: 0.08, velocity: 0.22 },
          ])
          triggerChordSequence(poly.synth, [
            { notes: ['D5', 'F#5', 'A5'], time: 0.016, duration: 0.12, velocity: 0.32 },
            { notes: ['E5', 'A5', 'B5'], time: 0.082, duration: 0.13, velocity: 0.24 },
          ])
          triggerChordSequence(widePoly.synth, [
            { notes: ['F#5', 'B5', 'D6', 'E6'], time: 0.05, duration: 0.18, velocity: 0.24 },
            { notes: ['A5', 'D6', 'F#6'], time: 0.14, duration: 0.16, velocity: 0.16 },
          ])
          triggerSequence(bell.synth, [
            { note: 'D6', time: 0.11, duration: 0.13, velocity: 0.2 },
            { note: 'A6', time: 0.19, duration: 0.11, velocity: 0.12 },
          ])
          sparkleLeft.synth.triggerAttackRelease('B6', 0.08, 0.19, 0.05)
          warm.synth.triggerAttackRelease('B2', 0.24, 0.012, 0.28)
          break
        case 'tttEnd':
          addAirPulse(0, master.input, master.space, master.gloss, { amount: 0.026, attack: 0.004, decay: 0.055, hp: 1_000, lp: 4_500, pan: 0.12 })
          addBloom(0.015, master.input, master.space, master.gloss, { amount: 0.015, attack: 0.012, decay: 0.1, lp: 2_200, wet: 0.22, pan: -0.08 })
          pad.synth.triggerAttackRelease(['G3', 'B3', 'D4', 'A4'], 0.27, 0.012, 0.18)
          triggerSequence(pluck.synth, [
            { note: 'D6', time: 0.01, duration: 0.065, velocity: 0.2 },
            { note: 'B5', time: 0.05, duration: 0.08, velocity: 0.18 },
            { note: 'G5', time: 0.105, duration: 0.085, velocity: 0.2 },
          ])
          triggerChordSequence(poly.synth, [
            { notes: ['B5', 'D6', 'G6'], time: 0.018, duration: 0.12, velocity: 0.26 },
            { notes: ['A5', 'D6', 'G6'], time: 0.092, duration: 0.13, velocity: 0.2 },
          ])
          triggerChordSequence(widePoly.synth, [
            { notes: ['G5', 'B5', 'D6'], time: 0.04, duration: 0.17, velocity: 0.2 },
            { notes: ['F#5', 'A5', 'D6'], time: 0.14, duration: 0.15, velocity: 0.14 },
          ])
          triggerSequence(bell.synth, [
            { note: 'G5', time: 0.13, duration: 0.13, velocity: 0.18 },
            { note: 'D6', time: 0.21, duration: 0.11, velocity: 0.1 },
          ])
          warm.synth.triggerAttackRelease('G2', 0.25, 0.016, 0.26)
          break
        case 'success':
          addAirPulse(0, master.input, master.space, master.gloss, { amount: 0.034, attack: 0.004, decay: 0.055, hp: 1_700, lp: 6_000, pan: -0.05 })
          addBloom(0.01, master.input, master.space, master.gloss, { amount: 0.022, attack: 0.016, decay: 0.13, lp: 3_000, wet: 0.28, glossWet: 0.12, pan: 0.1 })
          pad.synth.triggerAttackRelease(['A3', 'C#4', 'E4', 'B4'], 0.3, 0.008, 0.2)
          triggerSequence(pluck.synth, [
            { note: 'E5', time: 0.014, duration: 0.07, velocity: 0.24 },
            { note: 'G#5', time: 0.055, duration: 0.075, velocity: 0.24 },
            { note: 'C#6', time: 0.102, duration: 0.085, velocity: 0.22 },
          ])
          triggerChordSequence(poly.synth, [
            { notes: ['A4', 'C#5', 'E5'], time: 0.016, duration: 0.13, velocity: 0.32 },
            { notes: ['B4', 'E5', 'G#5'], time: 0.085, duration: 0.13, velocity: 0.26 },
            { notes: ['C#5', 'E5', 'A5'], time: 0.16, duration: 0.12, velocity: 0.2 },
          ])
          triggerChordSequence(widePoly.synth, [
            { notes: ['B4', 'E5', 'G#5', 'C#6'], time: 0.045, duration: 0.2, velocity: 0.24 },
            { notes: ['E5', 'A5', 'C#6'], time: 0.15, duration: 0.18, velocity: 0.18 },
          ])
          triggerSequence(bell.synth, [
            { note: 'C#6', time: 0.12, duration: 0.14, velocity: 0.2 },
            { note: 'G#6', time: 0.195, duration: 0.13, velocity: 0.14 },
            { note: 'B6', time: 0.245, duration: 0.11, velocity: 0.1 },
          ])
          sparkleLeft.synth.triggerAttackRelease('E6', 0.08, 0.22, 0.04)
          sparkleRight.synth.triggerAttackRelease('C#7', 0.08, 0.27, 0.06)
          warm.synth.triggerAttackRelease('A2', 0.24, 0.012, 0.26)
          break
        case 'error':
          addAirPulse(0, master.input, master.space, master.gloss, { amount: 0.024, attack: 0.004, decay: 0.065, hp: 750, lp: 2_800, wet: 0.04, pan: -0.04 })
          addBloom(0.014, master.input, master.space, master.gloss, { amount: 0.01, attack: 0.012, decay: 0.09, lp: 1_700, wet: 0.1, glossWet: 0.03, pan: 0.05 })
          pad.synth.triggerAttackRelease(['F3', 'A3', 'C4', 'G4'], 0.24, 0.02, 0.12)
          triggerSequence(pluck.synth, [
            { note: 'C5', time: 0.025, duration: 0.065, velocity: 0.14 },
            { note: 'A4', time: 0.085, duration: 0.08, velocity: 0.14 },
          ])
          triggerChordSequence(poly.synth, [
            { notes: ['A3', 'C4', 'G4'], time: 0.022, duration: 0.12, velocity: 0.16 },
            { notes: ['F3', 'A3', 'C4'], time: 0.11, duration: 0.13, velocity: 0.14 },
          ])
          triggerSequence(bell.synth, [
            { note: 'C5', time: 0.12, duration: 0.11, velocity: 0.1 },
            { note: 'G4', time: 0.19, duration: 0.1, velocity: 0.07 },
          ])
          warm.synth.triggerAttackRelease('F2', 0.24, 0.004, 0.24)
          break
        default:
          break
      }

      void poly
      void widePoly
      void bell
      void warm
      void pluck
      void pad
      void sparkleLeft
      void sparkleRight
      void master
    }, duration)

    const channels = []
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      channels.push(Array.from(rendered.getChannelData(channel)))
    }

    return {
      name: entry.name,
      fileName: entry.fileName,
      sampleRate: rendered.sampleRate,
      channels,
    }
  }

  const results = []
  for (const entry of entries) {
    results.push(await renderSingle(entry))
  }
  return results
}

app.commandLine.appendSwitch('disable-gpu')
app.on('window-all-closed', (event) => {
  event.preventDefault()
})

const main = async () => {
  await app.whenReady()

  const window = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
      nodeIntegration: true,
      backgroundThrottling: false,
    },
  })

  await window.loadFile(shellHtmlPath)
  const rendered = await window.webContents.executeJavaScript(
    `(${renderInRenderer.toString()})(${JSON.stringify(earconEntries)}, ${JSON.stringify(toneBundleUrl)})`,
    true,
  )

  await mkdir(OUTPUT_DIR, { recursive: true })

  for (const entry of rendered) {
    const channels = shapeEarconChannels(entry.channels.map((channel) => Float32Array.from(channel)), entry.sampleRate)
    const wav = createWavBuffer(channels, entry.sampleRate)
    const outputPath = join(OUTPUT_DIR, entry.fileName)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, wav)
    console.log(`[ui-earcon] ${entry.fileName} -> ${outputPath}`)
  }

  window.destroy()
}

main()
  .then(() => {
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
