import type {
  ContextSnapshot,
  InsertionMethod,
  InsertionPlan,
  InsertionStreamingMode,
} from '../../../shared/contracts.js'
import { runShortcut } from '../context/activeContextService.js'
import type { ClipboardService } from '../clipboard/clipboardService.js'
import type { AutomationService } from '../automation/automationService.js'
import { AutomationServiceError } from '../automation/automationService.js'

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

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}

const normalizeInsertionText = (text: string): string => {
  if (!text) {
    return ''
  }

  return text.replace(/[ \t\f\v]*\r?\n+[ \t\f\v]*/g, ' ')
}

const getCharStepMultiplier = (char: string): number => {
  if (char === ' ' || char === '\t') {
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

export interface InsertionExecutionReport {
  requestedMode: InsertionStreamingMode
  effectiveMode: InsertionStreamingMode
  insertionMethod: InsertionMethod
  fallbackUsed: boolean
}

class ProgressiveInsertionSession {
  private bufferedText = ''
  private completed = false
  private aborted = false
  private fallbackUsed = false
  private effectiveMode: InsertionStreamingMode
  private insertionMethod: InsertionMethod
  private writtenGraphemeCount = 0
  private pendingChars: string[] = []
  private flushWaiters: Array<() => void> = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private scheduledAt = 0
  private unexpectedError: Error | null = null
  private lastChunkTs = 0
  private arrivalRateEwma = 0
  private interArrivalMsEwma = 120
  private jitterMsEwma = 18
  private chunkSizeEwma = 8
  private currentIntervalMs = 24
  private nextRevealAt = 0
  private renderRateEwma = 0
  private lastPumpTs = 0

  constructor(
    private readonly requestedMode: InsertionStreamingMode,
    private readonly clipboardService: ClipboardService,
    private readonly automationService: AutomationService,
  ) {
    this.effectiveMode = requestedMode
    this.insertionMethod =
      requestedMode === 'letter-by-letter' ? 'enigo-letter' : 'clipboard-all-at-once'
  }

  async warmup(): Promise<void> {
    if (this.requestedMode !== 'letter-by-letter') {
      return
    }

    try {
      const environment = this.automationService.warmup()
      if (!environment.supportsLetterByLetter) {
        this.switchToAllAtOnce()
      }
    } catch (error) {
      if (error instanceof AutomationServiceError) {
        this.switchToAllAtOnce()
        return
      }

      throw error
    }
  }

  async append(text: string): Promise<void> {
    if (this.completed || this.aborted || !text) {
      return
    }

    const normalizedText = normalizeInsertionText(text)
    if (!normalizedText) {
      return
    }

    this.bufferedText += normalizedText

    if (this.requestedMode !== 'letter-by-letter' || this.effectiveMode !== 'letter-by-letter') {
      return
    }

    const chars = splitGraphemes(normalizedText)
    if (chars.length === 0) {
      return
    }

    const now = performance.now()
    const wasEmpty = this.pendingChars.length === 0
    this.observeArrival(chars.length, now)
    this.pendingChars.push(...chars)

    if (wasEmpty) {
      const wakeDelay = Math.min(10, this.currentIntervalMs * 0.2)
      this.nextRevealAt = this.nextRevealAt > 0 ? Math.min(this.nextRevealAt, now + wakeDelay) : now + wakeDelay
    }

    this.schedulePump(Math.max(0, this.nextRevealAt - now))
    this.throwUnexpectedErrorIfNeeded()
  }

  async finalize(finalText: string): Promise<InsertionExecutionReport> {
    this.completed = true
    const normalizedFinalText = normalizeInsertionText(finalText)
    const fullText = normalizedFinalText.trim() ? normalizedFinalText : this.bufferedText

    if (this.effectiveMode === 'letter-by-letter' && this.pendingChars.length > 0) {
      if (this.nextRevealAt === 0) {
        this.nextRevealAt = performance.now()
      }

      this.schedulePump(0)
    }

    await this.waitForPendingInsertion()
    this.throwUnexpectedErrorIfNeeded()

    if (this.aborted || !fullText.trim()) {
      return this.getExecutionReport()
    }

    if (this.effectiveMode === 'all-at-once') {
      await this.pasteRemainingText(fullText)
    }

    await this.clipboardService.writeNormal(fullText)
    return this.getExecutionReport()
  }

  cancel(): void {
    this.aborted = true
    this.completed = true
    this.clearTimer()
    this.resolveFlushWaiters()
  }

  async recoverToClipboard(text: string): Promise<void> {
    this.completed = true
    await this.clipboardService.writeNormal(text)
  }

  getExecutionReport(): InsertionExecutionReport {
    return {
      requestedMode: this.requestedMode,
      effectiveMode: this.effectiveMode,
      insertionMethod: this.insertionMethod,
      fallbackUsed: this.fallbackUsed,
    }
  }

  private switchToAllAtOnce(): void {
    this.effectiveMode = 'all-at-once'
    this.insertionMethod = 'clipboard-all-at-once'
    this.fallbackUsed = true
    this.clearTimer()
    this.resolveFlushWaiters()
  }

  private async pasteRemainingText(fullText: string): Promise<void> {
    const fullGraphemes = splitGraphemes(fullText)
    const remainingText =
      this.requestedMode === 'letter-by-letter'
        ? fullGraphemes.slice(this.writtenGraphemeCount).join('')
        : fullText

    if (!remainingText) {
      return
    }

    await this.clipboardService.writeNormal(remainingText)
    const pasted = await runShortcut('paste')
    if (!pasted) {
      throw new Error('Clipboard paste shortcut unavailable')
    }
  }

  private observeArrival(chunkLen: number, now: number): void {
    if (this.lastChunkTs > 0) {
      const dtMs = Math.max(now - this.lastChunkTs, 16)
      const dtSec = dtMs / 1000
      const instantRate = chunkLen / dtSec
      const cappedInstantRate =
        this.arrivalRateEwma > 0
          ? Math.min(instantRate, this.arrivalRateEwma * 2.2 + chunkLen * 16 + 110)
          : instantRate

      const rateAlpha = dtMs < 120 ? 0.14 : 0.08
      this.arrivalRateEwma += (cappedInstantRate - this.arrivalRateEwma) * rateAlpha

      const prevGap = this.interArrivalMsEwma
      this.interArrivalMsEwma += (dtMs - prevGap) * 0.12
      const deviation = Math.abs(dtMs - this.interArrivalMsEwma)
      this.jitterMsEwma += (deviation - this.jitterMsEwma) * 0.11
      this.chunkSizeEwma += (chunkLen - this.chunkSizeEwma) * 0.16
    } else {
      this.arrivalRateEwma = Math.max(55, chunkLen / 0.1)
      this.interArrivalMsEwma = 120
      this.jitterMsEwma = 18
      this.chunkSizeEwma = chunkLen
    }

    this.lastChunkTs = now
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
    const remaining = Math.max(1, this.pendingChars.length)
    const intervalCps = this.currentIntervalMs > 0 ? 1000 / this.currentIntervalMs : 0
    const recentVisualCps = Math.max(this.renderRateEwma * 0.92, intervalCps, 1)
    const recentSourceCps = Math.max(this.getPredictedIncomingRate(now) * 0.85, this.arrivalRateEwma * 0.8, 0)
    const anchorCps = Math.max(6, recentVisualCps * 0.78 + recentSourceCps * 0.22)
    const structuralChars = Math.max(3, this.chunkSizeEwma)
    const groupsRemaining = remaining / structuralChars
    const pressureBoost = 1 + Math.min(0.34, Math.sqrt(groupsRemaining) * 0.11 + groupsRemaining * 0.018)
    const endSoftening =
      1 - Math.min(0.1, (structuralChars / (remaining + structuralChars * 1.8)) * 0.22)
    const targetCps = anchorCps * pressureBoost * endSoftening
    const floorCps = Math.max(6, anchorCps * 0.96, recentVisualCps * 0.9)
    const ceilCps = Math.max(floorCps + 1, anchorCps * (1.22 + Math.min(0.18, groupsRemaining * 0.035)))
    return clamp(targetCps, floorCps, ceilCps)
  }

  private getTailDrainSeconds(now: number): number {
    const remaining = Math.max(1, this.pendingChars.length)
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
    const backlogError = this.pendingChars.length - targetLagChars

    const speedUpWindow = clamp(0.38 + this.interArrivalMsEwma / 1700 + this.jitterMsEwma / 900, 0.35, 1.35)
    const slowDownWindow = clamp(1.1 + this.interArrivalMsEwma / 900 + this.jitterMsEwma / 480, 1, 3.2)
    const correction =
      backlogError >= 0 ? backlogError / speedUpWindow : backlogError / slowDownWindow

    const bridgeCps = this.pendingChars.length > 0 ? this.pendingChars.length / this.getBridgeWindowSeconds(now) : 0
    let desired = predictedIncoming + correction

    if (this.pendingChars.length > 0) {
      desired = Math.max(
        desired,
        Math.min(Math.max(bridgeCps, 6), this.arrivalRateEwma || bridgeCps || 6),
      )
    }

    if (!this.completed && this.pendingChars.length > 0) {
      const etaSec = this.getExpectedNextChunkEtaMs(now) / 1000
      const survivableChars = Math.max(0.6, this.pendingChars.length - reserveChars * 0.15)
      const preserveCap = survivableChars / clamp(etaSec + 0.18, 0.22, 3.8)
      const lowBufferRatio = this.pendingChars.length / Math.max(reserveChars, 1)

      if (lowBufferRatio < 1.5) {
        desired = Math.min(desired, Math.max(2.8, preserveCap))
      }

      if (lowBufferRatio < 1.05) {
        desired = Math.min(
          desired,
          Math.max(1.8, this.pendingChars.length / clamp(etaSec + 0.35, 0.35, 4.4)),
        )
      }
    }

    if (predictedIncoming < 2.5 && this.pendingChars.length === 0) {
      desired = 0
    }

    if (this.completed && this.pendingChars.length > 0) {
      const tailTargetCps = this.getTailTargetCps(now)
      const tailSeconds = this.getTailDrainSeconds(now)
      const tailCpsRaw = this.pendingChars.length / tailSeconds
      desired = tailCpsRaw * 0.35 + tailTargetCps * 0.65
    }

    return clamp(desired, 0, 900)
  }

  private schedulePump(delayMs: number): void {
    if (this.aborted || this.effectiveMode !== 'letter-by-letter' || this.unexpectedError) {
      return
    }

    const boundedDelay = clamp(delayMs, 0, 150)
    const dueAt = performance.now() + boundedDelay
    if (this.timer && this.scheduledAt <= dueAt) {
      return
    }

    this.clearTimer()
    this.scheduledAt = dueAt
    this.timer = setTimeout(() => {
      this.timer = null
      this.scheduledAt = 0
      this.runPump()
    }, boundedDelay)
  }

  private runPump(): void {
    if (this.aborted || this.effectiveMode !== 'letter-by-letter') {
      this.resolveFlushWaiters()
      return
    }

    if (this.unexpectedError) {
      this.resolveFlushWaiters()
      return
    }

    const now = performance.now()
    if (!this.lastPumpTs) {
      this.lastPumpTs = now
      if (this.nextRevealAt === 0) {
        this.nextRevealAt = now
      }
    }

    const dtMs = clamp(now - this.lastPumpTs, 0, 50)
    this.lastPumpTs = now

    if (this.pendingChars.length === 0) {
      this.resolveFlushWaiters()
      return
    }

    const desiredCps = this.getDesiredCharsPerSecond(now)
    const desiredIntervalMs = desiredCps > 0 ? 1000 / desiredCps : 160
    const speedingUp = desiredIntervalMs < this.currentIntervalMs
    const smoothing = dtMs > 0 ? 1 - Math.exp(-dtMs / (speedingUp ? 110 : 320)) : 1

    this.currentIntervalMs += (desiredIntervalMs - this.currentIntervalMs) * smoothing
    this.currentIntervalMs = clamp(this.currentIntervalMs, this.completed ? 6.5 : 3.5, 150)

    if (this.pendingChars.length > 0 && this.nextRevealAt === 0) {
      this.nextRevealAt = now + Math.min(14, this.currentIntervalMs * 0.24)
    }

    let revealedThisPump = 0
    const reserveChars = this.getReserveChars(now)
    const bufferAhead = Math.max(0, this.pendingChars.length - reserveChars)
    const maxCharsThisPump = this.completed
      ? 2
      : clamp(1 + Math.floor(bufferAhead / Math.max(20, this.chunkSizeEwma * 3.8)), 1, 3)

    while (
      this.pendingChars.length > 0 &&
      now >= this.nextRevealAt &&
      revealedThisPump < maxCharsThisPump &&
      this.effectiveMode === 'letter-by-letter' &&
      !this.unexpectedError
    ) {
      this.typeNextChar(now)
      if (this.effectiveMode !== 'letter-by-letter' || this.unexpectedError) {
        break
      }
      revealedThisPump += 1
    }

    if (this.effectiveMode !== 'letter-by-letter' || this.unexpectedError) {
      this.resolveFlushWaiters()
      return
    }

    if (this.nextRevealAt < now - Math.max(70, this.currentIntervalMs * 2.2)) {
      this.nextRevealAt = now - Math.min(18, this.currentIntervalMs * 0.65)
    }

    if (this.pendingChars.length === 0 && !this.completed) {
      this.nextRevealAt = 0
    }

    const instantaneousRender = this.currentIntervalMs > 0 ? 1000 / this.currentIntervalMs : 0
    const revealRateNow = revealedThisPump > 0 ? instantaneousRender : 0
    const renderAlpha = revealedThisPump > 0 ? 0.14 : 0.04
    this.renderRateEwma += (revealRateNow - this.renderRateEwma) * renderAlpha

    if (this.pendingChars.length === 0) {
      this.resolveFlushWaiters()
      return
    }

    const nextDelay = Math.max(0, this.nextRevealAt - performance.now())
    this.schedulePump(nextDelay)
  }

  private typeNextChar(now: number): void {
    const nextChar = this.pendingChars.shift()
    if (!nextChar) {
      return
    }

    try {
      this.automationService.typeGrapheme(nextChar)
      this.writtenGraphemeCount += 1
    } catch (error) {
      this.pendingChars.unshift(nextChar)

      if (error instanceof AutomationServiceError) {
        this.switchToAllAtOnce()
        return
      }

      this.unexpectedError = error instanceof Error ? error : new Error(String(error))
      this.clearTimer()
      this.resolveFlushWaiters()
      return
    }

    const reserveChars = this.getReserveChars(now)
    const bufferAhead = this.pendingChars.length - reserveChars
    const tailMode = this.completed
    const catchupFactor = tailMode
      ? 1
      : bufferAhead > 0
        ? 1 / (1 + Math.min(bufferAhead / Math.max(18, this.chunkSizeEwma * 5), 0.28))
        : 1.18

    const tailMultiplier = tailMode ? clamp(1 + Math.max(0, 4 - this.pendingChars.length) * 0.01, 1, 1.04) : 1

    const stepMs = Math.max(
      tailMode ? 3.6 : 2.8,
      (this.currentIntervalMs * getCharStepMultiplier(nextChar) * tailMultiplier) / catchupFactor,
    )

    this.nextRevealAt += stepMs
  }

  private waitForPendingInsertion(): Promise<void> {
    if (this.effectiveMode !== 'letter-by-letter' || this.aborted || this.unexpectedError) {
      return Promise.resolve()
    }

    if (this.pendingChars.length === 0 && !this.timer) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.flushWaiters.push(resolve)
    })
  }

  private resolveFlushWaiters(): void {
    if (this.flushWaiters.length === 0) {
      return
    }

    const waiters = this.flushWaiters.splice(0)
    for (const resolve of waiters) {
      resolve()
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.scheduledAt = 0
    }
  }

  private throwUnexpectedErrorIfNeeded(): void {
    if (this.unexpectedError) {
      throw this.unexpectedError
    }
  }
}

export class InsertionEngine {
  constructor(
    private readonly clipboardService: ClipboardService,
    private readonly automationService: AutomationService,
  ) {}

  warmupLetterInput(): void {
    this.automationService.warmup()
  }

  dispose(): void {
    this.automationService.dispose()
  }

  createPlan(context: ContextSnapshot): InsertionPlan {
    return {
      strategy: context.selectedText ? 'replace-selection' : 'insert-at-cursor',
      targetApp: context.appName,
      capability: 'automation',
    }
  }

  createProgressiveSession(mode: InsertionStreamingMode): ProgressiveInsertionSession {
    return new ProgressiveInsertionSession(mode, this.clipboardService, this.automationService)
  }
}
