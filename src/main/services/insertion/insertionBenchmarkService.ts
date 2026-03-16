import type { InsertionBenchmarkRequest, InsertionBenchmarkResult } from '../../../shared/contracts.js'
import type { ActiveContextService } from '../context/activeContextService.js'
import type { InsertionEngine, InsertionExecutionReport } from './insertionEngine.js'

const chunkSampleText = (text: string): string[] => {
  const chunkSizes = [5, 3, 9, 4, 7, 6, 8, 5]
  const chunks: string[] = []
  let cursor = 0
  let index = 0

  while (cursor < text.length) {
    const size = chunkSizes[index % chunkSizes.length]
    chunks.push(text.slice(cursor, cursor + size))
    cursor += size
    index += 1
  }

  return chunks
}

export class InsertionBenchmarkService {
  constructor(
    private readonly insertionEngine: InsertionEngine,
    private readonly contextService: ActiveContextService,
  ) {}

  async run(request: InsertionBenchmarkRequest): Promise<InsertionBenchmarkResult> {
    const context = await this.contextService.capture(false, false)
    const snapshot = await this.insertionEngine.captureClipboardSnapshot()
    const writerSession = this.insertionEngine.createWriterSession()
    const session = this.insertionEngine.createProgressiveSession(request.mode, snapshot, writerSession)
    const sampleText = request.text
    const sampleChunks = request.mode === 'chunks' ? chunkSampleText(sampleText) : [sampleText]
    const startedAt = performance.now()
    let execution: InsertionExecutionReport = {
      insertionMethod:
        request.mode === 'letter-by-letter'
          ? 'sendinput-unicode'
          : request.mode === 'all-at-once'
            ? 'clipboard-normal'
            : 'clipboard-protected',
      fallbackUsed: false,
    }

    try {
      await writerSession.warmup()
      await session.warmup()
      for (const chunk of sampleChunks) {
        await session.append(chunk)
      }
      execution = await session.finalize(sampleText)
    } finally {
      await writerSession.dispose()
    }

    const durationMs = Math.max(1, performance.now() - startedAt)
    const graphemeCount = Array.from(sampleText).length

    return {
      mode: request.mode,
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
