import type { InsertionBenchmarkRequest, InsertionBenchmarkResult } from '../../../shared/contracts.js'
import type { ActiveContextService } from '../context/activeContextService.js'
import type { InsertionEngine, InsertionExecutionReport } from './insertionEngine.js'

export class InsertionBenchmarkService {
  constructor(
    private readonly insertionEngine: InsertionEngine,
    private readonly contextService: ActiveContextService,
  ) {}

  async run(request: InsertionBenchmarkRequest): Promise<InsertionBenchmarkResult> {
    const context = await this.contextService.capture(false, false)
    const session = this.insertionEngine.createProgressiveSession(request.mode)
    const sampleText = request.text
    const startedAt = performance.now()
    let execution: InsertionExecutionReport = {
      insertionMethod:
        request.mode === 'letter-by-letter'
          ? 'enigo-letter'
          : 'clipboard-all-at-once',
      requestedMode: request.mode,
      effectiveMode: request.mode,
      fallbackUsed: false,
    }

    await session.warmup()
    await session.append(sampleText)
    execution = await session.finalize(sampleText)

    const durationMs = Math.max(1, performance.now() - startedAt)
    const graphemeCount = Array.from(sampleText).length

    return {
      mode: request.mode,
      effectiveMode: execution.effectiveMode,
      targetApp: context.appName,
      graphemeCount,
      durationMs,
      charactersPerSecond: Number(((graphemeCount / durationMs) * 1000).toFixed(1)),
      sampleText,
      insertionMethod: execution.insertionMethod,
      fallbackUsed: execution.fallbackUsed,
    }
  }
}
