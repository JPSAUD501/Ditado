class DitadoRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._frameCount = 0
    // Send RMS every ~6 frames (~80ms at 128 samples/frame at 48kHz)
    this._rmsInterval = 6
  }

  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]

    if (channel && channel.length) {
      const copy = new Float32Array(channel.length)
      copy.set(channel)
      this.port.postMessage(copy, [copy.buffer])

      // Compute and send RMS level periodically
      this._frameCount++
      if (this._frameCount >= this._rmsInterval) {
        this._frameCount = 0
        let sum = 0
        for (let i = 0; i < channel.length; i++) {
          sum += channel[i] * channel[i]
        }
        const rms = Math.sqrt(sum / channel.length)
        this.port.postMessage({ type: 'rms', value: rms })
      }
    }

    return true
  }
}

registerProcessor('ditado-recorder-worklet', DitadoRecorderProcessor)
