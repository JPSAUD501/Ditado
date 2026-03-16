class DitadoRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]

    if (channel && channel.length) {
      const copy = new Float32Array(channel.length)
      copy.set(channel)
      this.port.postMessage(copy, [copy.buffer])
    }

    return true
  }
}

registerProcessor('ditado-recorder-worklet', DitadoRecorderProcessor)
