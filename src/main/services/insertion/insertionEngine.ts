import type {
  ContextSnapshot,
  InsertionMethod,
  InsertionPlan,
  InsertionStreamingMode,
} from '../../../shared/contracts.js'
import { wait } from '../../../shared/utils.js'
import { runShortcut } from '../context/activeContextService.js'
import {
  type ClipboardService,
  type ClipboardSnapshot,
  type ClipboardWriterSession,
} from '../clipboard/clipboardService.js'
import {
  InputWorkerError,
  InputWorkerFocusChangedError,
  type InputWorkerClient,
} from '../input/inputWorkerClient.js'

const WINDOWS_FINAL_CLIPBOARD_SETTLE_MS = 36
const DEFAULT_PRE_PASTE_SETTLE_MS = 6
const DEFAULT_POST_PASTE_SETTLE_MS = 10
const DEFAULT_FINAL_CLIPBOARD_SETTLE_MS = 12
const LETTER_FALLBACK_CHUNK_SIZE = 24

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })
    : null

const splitGraphemes = (text: string): string[] => {
  if (!text) {
    return []
  }

  if (segmenter) {
    return Array.from(segmenter.segment(text), (part) => part.segment)
  }

  return Array.from(text)
}

export interface InsertionExecutionReport {
  insertionMethod: InsertionMethod
  fallbackUsed: boolean
}

class AdaptiveLetterRevealScheduler {
  private readonly queue: string[] = []
  private running = false
  private streamDone = false
  private stopped = false
  private drainedWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = []
  private failure: Error | null = null
  private lastChunkTs = 0
  private arrivalRateEwma = 0
  private interArrivalMsEwma = 120
  private jitterMsEwma = 18
  private chunkSizeEwma = 8
  private currentIntervalMs = 24
  private nextRevealAt = 0
  private renderRateEwma = 0

  constructor(private readonly commit: (text: string) => Promise<void>) {}

  push(text: string): void {
    const graphemes = splitGraphemes(text)
    if (!graphemes.length) {
      return
    }

    const now = Date.now()
    this.observeArrival(graphemes.length, now)
    this.queue.push(...graphemes)
    this.ensureRunning()
  }

  async finalize(): Promise<void> {
    if (this.failure) {
      throw this.failure
    }

    this.streamDone = true
    this.ensureRunning()

    if (!this.queue.length && !this.running) {
      if (this.failure) {
        throw this.failure
      }
      return
    }

    await new Promise<void>((resolve, reject) => {
      this.drainedWaiters.push({
        resolve,
        reject,
      })
    })
  }

  cancel(): void {
    this.stopped = true
    this.queue.length = 0
    this.resolveDrained()
  }

  private observeArrival(graphemeCount: number, now: number): void {
    if (this.lastChunkTs > 0) {
      const dtMs = Math.max(now - this.lastChunkTs, 16)
      const dtSec = dtMs / 1000
      const instantRate = graphemeCount / dtSec
      const cappedInstantRate =
        this.arrivalRateEwma > 0
          ? Math.min(instantRate, this.arrivalRateEwma * 2.2 + graphemeCount * 16 + 110)
          : instantRate

      const rateAlpha = dtMs < 120 ? 0.14 : 0.08
      this.arrivalRateEwma += (cappedInstantRate - this.arrivalRateEwma) * rateAlpha
      const previousGap = this.interArrivalMsEwma
      this.interArrivalMsEwma += (dtMs - previousGap) * 0.12
      const deviation = Math.abs(dtMs - this.interArrivalMsEwma)
      this.jitterMsEwma += (deviation - this.jitterMsEwma) * 0.11
      this.chunkSizeEwma += (graphemeCount - this.chunkSizeEwma) * 0.16
    } else {
      this.arrivalRateEwma = Math.max(55, graphemeCount / 0.1)
      this.interArrivalMsEwma = 120
      this.jitterMsEwma = 18
      this.chunkSizeEwma = graphemeCount
    }

    this.lastChunkTs = now
    if (this.queue.length === 0) {
      const wakeDelay = Math.min(10, this.currentIntervalMs * 0.2)
      this.nextRevealAt = this.nextRevealAt > 0 ? Math.min(this.nextRevealAt, now + wakeDelay) : now + wakeDelay
    }
  }

  private ensureRunning(): void {
    if (this.running || this.stopped) {
      return
    }

    this.running = true
    void this.run()
  }

  private async run(): Promise<void> {
    let lastFrameTs = 0

    try {
      while (!this.stopped) {
        if (!this.queue.length) {
          if (this.streamDone) {
            break
          }

          this.running = false
          return
        }

        const now = Date.now()
        if (!lastFrameTs) {
          lastFrameTs = now
          if (this.nextRevealAt === 0) {
            this.nextRevealAt = now
          }
        }

        const dtMs = clamp(now - lastFrameTs, 0, 50)
        lastFrameTs = now

        const desiredCharsPerSecond = this.getDesiredCharsPerSecond(now)
        const desiredIntervalMs = desiredCharsPerSecond > 0 ? 1000 / desiredCharsPerSecond : 160
        const speedingUp = desiredIntervalMs < this.currentIntervalMs
        const smoothing = speedingUp ? 1 - Math.exp(-dtMs / 110) : 1 - Math.exp(-dtMs / 320)

        this.currentIntervalMs += (desiredIntervalMs - this.currentIntervalMs) * smoothing
        this.currentIntervalMs = clamp(this.currentIntervalMs, this.streamDone ? 5 : 3, 120)

        if (this.queue.length > 0 && this.nextRevealAt === 0) {
          this.nextRevealAt = now + Math.min(14, this.currentIntervalMs * 0.24)
        }

        if (now < this.nextRevealAt) {
          await wait(Math.max(1, Math.min(8, this.nextRevealAt - now)))
          continue
        }

        const revealed = await this.revealOneChar(now)
        if (!revealed) {
          continue
        }

        if (this.nextRevealAt < now - Math.max(70, this.currentIntervalMs * 2.2)) {
          this.nextRevealAt = now - Math.min(18, this.currentIntervalMs * 0.65)
        }

        if (this.queue.length === 0 && !this.streamDone) {
          this.nextRevealAt = 0
        }
      }
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error('Adaptive letter reveal failed.')
      this.stopped = true
    } finally {
      this.running = false
      if (this.streamDone || this.stopped) {
        this.resolveDrained()
      }
    }
  }

  private async revealOneChar(now: number): Promise<boolean> {
    if (!this.queue.length) {
      return false
    }

    const nextChar = this.queue.shift()
    if (!nextChar) {
      return false
    }

    await this.commit(nextChar)

    const reserveChars = this.getReserveChars(now)
    const bufferAhead = this.queue.length - reserveChars
    const tailMode = this.streamDone
    const catchupFactor = tailMode
      ? 1
      : bufferAhead > 0
        ? 1 / (1 + Math.min(bufferAhead / Math.max(18, this.chunkSizeEwma * 5), 0.28))
        : 1.18

    const tailMultiplier = tailMode ? clamp(1 + Math.max(0, 4 - this.queue.length) * 0.01, 1, 1.04) : 1
    const stepMs = Math.max(
      tailMode ? 3.6 : 2.8,
      (this.currentIntervalMs * this.getCharStepMultiplier(nextChar) * tailMultiplier) / catchupFactor,
    )

    this.nextRevealAt += stepMs
    const instantaneousRender = this.currentIntervalMs > 0 ? 1000 / this.currentIntervalMs : 0
    this.renderRateEwma += (instantaneousRender - this.renderRateEwma) * 0.14
    return true
  }

  private getCharStepMultiplier(char: string): number {
    if (char === ' ' || char === '\n' || char === '\t') {
      return 0.4
    }

    if (',.;:'.includes(char)) {
      return 0.68
    }

    if (')]}!?'.includes(char)) {
      return 0.82
    }

    return 1
  }

  private getPredictedIncomingRate(now: number): number {
    if (!this.lastChunkTs || this.arrivalRateEwma <= 0) {
      return 0
    }

    const idleMs = now - this.lastChunkTs
    const holdMs = clamp(
      this.interArrivalMsEwma * 2.05 + this.jitterMsEwma * 2.8 + this.chunkSizeEwma * 2.3,
      160,
      1100,
    )

    if (idleMs <= holdMs) {
      return this.arrivalRateEwma
    }

    const decayWindowMs = clamp(
      this.interArrivalMsEwma * 6 + this.jitterMsEwma * 8.5 + this.chunkSizeEwma * 18,
      650,
      3400,
    )
    const decay = Math.exp(-(idleMs - holdMs) / decayWindowMs)
    return this.arrivalRateEwma * decay
  }

  private getExpectedNextChunkEtaMs(now: number): number {
    if (!this.lastChunkTs) {
      return clamp(this.interArrivalMsEwma, 120, 1200)
    }

    const elapsedMs = now - this.lastChunkTs
    const baseEtaMs = this.interArrivalMsEwma - elapsedMs
    const cushionMs = this.jitterMsEwma * 1.6 + this.chunkSizeEwma * 7
    return clamp(baseEtaMs + cushionMs, 40, 2200)
  }

  private getAdaptiveLagMs(now: number): number {
    const predictedIncoming = this.getPredictedIncomingRate(now)
    const lowRateBonus = predictedIncoming > 0 ? clamp(1500 / predictedIncoming, 0, 220) : 150
    const etaBonus = this.getExpectedNextChunkEtaMs(now) * 0.5
    return clamp(
      180 +
        lowRateBonus +
        etaBonus +
        this.interArrivalMsEwma * 0.7 +
        this.jitterMsEwma * 2.6 +
        this.chunkSizeEwma * 5,
      220,
      1400,
    )
  }

  private getReserveChars(now: number): number {
    const predictedIncoming = this.getPredictedIncomingRate(now)
    const etaMs = this.getExpectedNextChunkEtaMs(now)
    const rateReserve = predictedIncoming * (etaMs / 1000) * 0.9
    const chunkReserve = this.chunkSizeEwma * clamp(1.05 + this.interArrivalMsEwma / 700, 1.05, 2.4)
    return clamp(Math.max(2, rateReserve, chunkReserve), 2, 80)
  }

  private getTargetLagChars(now: number): number {
    const predictedIncoming = this.getPredictedIncomingRate(now)
    const lagMs = this.getAdaptiveLagMs(now)
    const timeBasedLag = predictedIncoming * (lagMs / 1000)
    const reserveChars = this.getReserveChars(now)
    return Math.max(reserveChars, timeBasedLag + this.chunkSizeEwma * 0.45)
  }

  private getBridgeWindowSeconds(now: number): number {
    const lagMs = this.getAdaptiveLagMs(now)
    const etaMs = this.getExpectedNextChunkEtaMs(now)
    return clamp(lagMs / 1000 + (etaMs / 1000) * 0.7 + (this.jitterMsEwma / 1000) * 0.9, 0.7, 4.2)
  }

  private getTailTargetCps(now: number): number {
    const remaining = Math.max(1, this.queue.length)
    const intervalCps = this.currentIntervalMs > 0 ? 1000 / this.currentIntervalMs : 0
    const recentVisualCps = Math.max(this.renderRateEwma * 0.92, intervalCps, 1)
    const recentSourceCps = Math.max(this.getPredictedIncomingRate(now) * 0.85, this.arrivalRateEwma * 0.8, 0)
    const anchorCps = Math.max(6, recentVisualCps * 0.78 + recentSourceCps * 0.22)
    const structuralChars = Math.max(3, this.chunkSizeEwma)
    const groupsRemaining = remaining / structuralChars
    const pressureBoost = 1 + Math.min(0.34, Math.sqrt(groupsRemaining) * 0.11 + groupsRemaining * 0.018)
    const endSoftening = 1 - Math.min(0.1, (structuralChars / (remaining + structuralChars * 1.8)) * 0.22)
    const targetCps = anchorCps * pressureBoost * endSoftening
    const floorCps = Math.max(6, anchorCps * 0.96, recentVisualCps * 0.9)
    const ceilCps = Math.max(floorCps + 1, anchorCps * (1.22 + Math.min(0.18, groupsRemaining * 0.035)))
    return clamp(targetCps, floorCps, ceilCps)
  }

  private getTailDrainSeconds(now: number): number {
    const remaining = Math.max(1, this.queue.length)
    const structuralChars = Math.max(3, this.chunkSizeEwma)
    const groupsRemaining = remaining / structuralChars
    const targetCps = this.getTailTargetCps(now)
    const baseSeconds = remaining / targetCps
    const cadenceSeconds = (this.interArrivalMsEwma / 1000) * Math.min(0.1, groupsRemaining * 0.02)
    const granularitySeconds = (structuralChars / targetCps) * 0.35
    const smoothSeconds = baseSeconds + cadenceSeconds + granularitySeconds
    return clamp(smoothSeconds, baseSeconds, baseSeconds * 1.22 + granularitySeconds + 0.08)
  }

  private getDesiredCharsPerSecond(now: number): number {
    const predictedIncoming = this.getPredictedIncomingRate(now)
    const targetLagChars = this.getTargetLagChars(now)
    const reserveChars = this.getReserveChars(now)
    const backlogError = this.queue.length - targetLagChars

    const speedUpWindow = clamp(0.38 + this.interArrivalMsEwma / 1700 + this.jitterMsEwma / 900, 0.35, 1.35)
    const slowDownWindow = clamp(1.1 + this.interArrivalMsEwma / 900 + this.jitterMsEwma / 480, 1, 3.2)
    const correction = backlogError >= 0 ? backlogError / speedUpWindow : backlogError / slowDownWindow

    const bridgeCps = this.queue.length > 0 ? this.queue.length / this.getBridgeWindowSeconds(now) : 0
    let desired = predictedIncoming + correction

    if (this.queue.length > 0) {
      desired = Math.max(desired, Math.min(Math.max(bridgeCps, 6), this.arrivalRateEwma || bridgeCps || 6))
    }

    if (!this.streamDone && this.queue.length > 0) {
      const etaSec = this.getExpectedNextChunkEtaMs(now) / 1000
      const survivableChars = Math.max(0.6, this.queue.length - reserveChars * 0.15)
      const preserveCap = survivableChars / clamp(etaSec + 0.18, 0.22, 3.8)
      const lowBufferRatio = this.queue.length / Math.max(reserveChars, 1)

      if (lowBufferRatio < 1.5) {
        desired = Math.min(desired, Math.max(2.8, preserveCap))
      }

      if (lowBufferRatio < 1.05) {
        desired = Math.min(desired, Math.max(1.8, this.queue.length / clamp(etaSec + 0.35, 0.35, 4.4)))
      }
    }

    if (predictedIncoming < 2.5 && this.queue.length === 0) {
      desired = 0
    }

    if (this.streamDone && this.queue.length > 0) {
      const tailTargetCps = this.getTailTargetCps(now)
      const tailSeconds = this.getTailDrainSeconds(now)
      const tailCpsRaw = this.queue.length / tailSeconds
      desired = tailCpsRaw * 0.35 + tailTargetCps * 0.65
    }

    return clamp(desired, 0, 900)
  }

  private resolveDrained(): void {
    const waiters = this.drainedWaiters.splice(0)
    for (const waiter of waiters) {
      if (this.failure) {
        waiter.reject(this.failure)
        continue
      }

      waiter.resolve()
    }
  }
}

class ProgressiveInsertionSession {
  private chain = Promise.resolve()
  private completed = false
  private aborted = false
  private bufferedText = ''
  private effectiveMode: InsertionStreamingMode
  private chunkFallbackBuffer: string[] = []
  private operationalSnapshot: ClipboardSnapshot | null
  private readonly letterScheduler: AdaptiveLetterRevealScheduler | null
  private insertionMethod: InsertionMethod
  private fallbackUsed = false
  private expectedWindowHandle: string | null = null

  constructor(
    private readonly mode: InsertionStreamingMode,
    private readonly clipboardService: ClipboardService,
    private readonly inputWorker: InputWorkerClient,
    private readonly writerSession: ClipboardWriterSession,
    initialSnapshot: ClipboardSnapshot | null = null,
  ) {
    this.effectiveMode = mode
    this.operationalSnapshot = initialSnapshot
    this.insertionMethod =
      mode === 'all-at-once'
        ? 'clipboard-normal'
        : mode === 'letter-by-letter' && process.platform === 'win32'
          ? 'sendinput-unicode'
          : process.platform === 'win32'
            ? 'clipboard-protected'
            : 'clipboard-normal'

    this.letterScheduler =
      mode === 'letter-by-letter'
        ? new AdaptiveLetterRevealScheduler(async (grapheme) => {
            await this.commitLetter(grapheme)
          })
        : null
  }

  async warmup(): Promise<void> {
    if (this.insertionMethod !== 'sendinput-unicode') {
      return
    }

    try {
      const result = await this.inputWorker.warmup()
      this.expectedWindowHandle = result.foregroundWindowHandle
    } catch (error) {
      if (error instanceof InputWorkerError) {
        this.insertionMethod = process.platform === 'win32' ? 'clipboard-protected' : 'clipboard-normal'
        this.fallbackUsed = true
        this.expectedWindowHandle = null
        return
      }

      throw error
    }
  }

  getExecutionReport(): InsertionExecutionReport {
    return {
      insertionMethod: this.insertionMethod,
      fallbackUsed: this.fallbackUsed,
    }
  }

  private async ensureOperationalSnapshot(): Promise<ClipboardSnapshot> {
    if (!this.operationalSnapshot) {
      this.operationalSnapshot = await this.clipboardService.readCurrent()
    }

    return this.operationalSnapshot
  }

  private async pasteChunk(chunk: string, clipboardMode: 'normal' | 'protected'): Promise<void> {
    await this.ensureOperationalSnapshot()
    if (clipboardMode === 'protected') {
      await this.clipboardService.writeProtected(chunk, this.writerSession)
    } else {
      await this.clipboardService.writeNormal(chunk)
    }
    await wait(process.platform === 'win32' ? 2 : DEFAULT_PRE_PASTE_SETTLE_MS)

    const pasted = await runShortcut('paste')
    if (!pasted) {
      throw new Error('Clipboard paste shortcut unavailable')
    }

    await wait(process.platform === 'win32' ? 4 : DEFAULT_POST_PASTE_SETTLE_MS)
  }

  private enqueuePaste(text: string, clipboardMode: 'normal' | 'protected'): Promise<void> {
    this.chain = this.chain.then(async () => {
      if (this.aborted || !text) {
        return
      }

      await this.pasteChunk(text, clipboardMode)
    })

    return this.chain
  }

  private async commitLetter(grapheme: string): Promise<void> {
    if (this.insertionMethod === 'sendinput-unicode') {
      try {
        if (!this.expectedWindowHandle) {
          await this.warmup()
        }

        await this.inputWorker.sendTextUnicode(grapheme, this.expectedWindowHandle ?? '')
        return
      } catch (error) {
        if (error instanceof InputWorkerFocusChangedError) {
          throw error
        }

        if (error instanceof InputWorkerError) {
          this.effectiveMode = 'chunks'
          this.insertionMethod = process.platform === 'win32' ? 'clipboard-protected' : 'clipboard-normal'
          this.fallbackUsed = true
          this.queueChunkFallbackGrapheme(grapheme)
          return
        }

        throw error
      }
    }

    if (this.effectiveMode === 'chunks') {
      this.queueChunkFallbackGrapheme(grapheme)
      return
    }

    await this.enqueuePaste(grapheme, process.platform === 'win32' ? 'protected' : 'normal')
  }

  async append(text: string): Promise<void> {
    if (this.completed || this.aborted || !text) {
      return
    }

    this.bufferedText += text

    if (this.effectiveMode === 'all-at-once') {
      return
    }

    if (this.mode === 'chunks') {
      void this.enqueuePaste(text, process.platform === 'win32' ? 'protected' : 'normal')
      return
    }

    this.letterScheduler?.push(text)
  }

  async finalize(finalText: string): Promise<InsertionExecutionReport> {
    if (this.aborted) {
      this.completed = true
      return this.getExecutionReport()
    }

    this.completed = true
    const fullText = finalText.trim() ? finalText : this.bufferedText

    if (this.mode === 'letter-by-letter') {
      await this.letterScheduler?.finalize()
    }

    this.flushChunkFallbackBuffer()

    await this.chain

    if (!fullText.trim()) {
      return this.getExecutionReport()
    }

    if (this.mode === 'all-at-once' && !this.aborted) {
      await this.pasteChunk(fullText, 'normal')
    }

    if (!this.aborted) {
      const snapshot = await this.ensureOperationalSnapshot()
      await this.clipboardService.writeNormal(fullText)
      await wait(
        process.platform === 'win32'
          ? WINDOWS_FINAL_CLIPBOARD_SETTLE_MS
          : DEFAULT_FINAL_CLIPBOARD_SETTLE_MS,
      )
      await this.clipboardService.restore(snapshot, 'protected', this.writerSession)
    }

    return this.getExecutionReport()
  }

  cancel(): void {
    this.aborted = true
    this.completed = true
    this.letterScheduler?.cancel()
  }

  async recoverToClipboard(text: string): Promise<void> {
    this.completed = true
    await this.clipboardService.writeNormal(text)
  }

  private queueChunkFallbackGrapheme(grapheme: string): void {
    this.chunkFallbackBuffer.push(grapheme)
    if (this.chunkFallbackBuffer.length < LETTER_FALLBACK_CHUNK_SIZE) {
      return
    }

    this.flushChunkFallbackBuffer(LETTER_FALLBACK_CHUNK_SIZE)
  }

  private flushChunkFallbackBuffer(limit = this.chunkFallbackBuffer.length): void {
    if (limit <= 0) {
      return
    }

    const chunk = this.chunkFallbackBuffer.splice(0, limit).join('')
    if (!chunk) {
      return
    }

    void this.enqueuePaste(chunk, process.platform === 'win32' ? 'protected' : 'normal')
  }
}

export class InsertionEngine {
  constructor(
    private readonly clipboardService: ClipboardService,
    private readonly inputWorker: InputWorkerClient,
  ) {}

  async warmupLetterInput(): Promise<void> {
    if (process.platform !== 'win32') {
      return
    }

    await this.inputWorker.warmup()
  }

  async dispose(): Promise<void> {
    await this.inputWorker.dispose().catch(() => undefined)
  }

  createWriterSession(): ClipboardWriterSession {
    return this.clipboardService.createWriterSession()
  }

  async captureClipboardSnapshot(): Promise<ClipboardSnapshot> {
    return this.clipboardService.readCurrent()
  }

  createPlan(context: ContextSnapshot): InsertionPlan {
    return {
      strategy: context.selectedText ? 'replace-selection' : 'insert-at-cursor',
      targetApp: context.appName,
      capability: 'clipboard',
    }
  }

  createProgressiveSession(
    mode: InsertionStreamingMode,
    initialSnapshot: ClipboardSnapshot | null = null,
    writerSession?: ClipboardWriterSession,
  ): ProgressiveInsertionSession {
    return new ProgressiveInsertionSession(
      mode,
      this.clipboardService,
      this.inputWorker,
      writerSession ?? this.clipboardService.createWriterSession(),
      initialSnapshot,
    )
  }
}
