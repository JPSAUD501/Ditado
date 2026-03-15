import { clipboard } from 'electron'

import type { ContextSnapshot, InsertionPlan, InsertionStreamingMode } from '../../../shared/contracts.js'
import { chunkText, wait } from '../../../shared/utils.js'
import { runShortcut } from '../context/activeContextService.js'

const pasteChunk = async (chunk: string): Promise<void> => {
  const previousClipboard = clipboard.readText()
  clipboard.writeText(chunk)

  try {
    const pasted = await runShortcut('paste')
    if (!pasted) {
      throw new Error('Clipboard paste shortcut unavailable')
    }

    await wait(60)
  } finally {
    clipboard.writeText(previousClipboard)
  }
}

class ProgressiveInsertionSession {
  private chain = Promise.resolve()
  private completed = false
  private bufferedText = ''

  constructor(private readonly mode: InsertionStreamingMode) {}

  private getSegments(text: string): string[] {
    if (this.mode === 'letter-by-letter') {
      return Array.from(text)
    }

    if (this.mode === 'all-at-once') {
      return []
    }

    return chunkText(text, 44)
  }

  async append(text: string): Promise<void> {
    if (this.completed || !text) {
      return
    }

    if (this.mode === 'all-at-once') {
      this.bufferedText += text
      return
    }

    for (const segment of this.getSegments(text)) {
      this.chain = this.chain.then(() => pasteChunk(segment))
    }

    await this.chain
  }

  async finalize(finalText: string): Promise<void> {
    this.completed = true

    if (this.mode === 'all-at-once' && finalText.trim()) {
      this.chain = this.chain.then(() => pasteChunk(finalText))
    }

    await this.chain
  }

  async recoverToClipboard(text: string): Promise<void> {
    this.completed = true
    clipboard.writeText(text)
  }
}

export class InsertionEngine {
  createPlan(context: ContextSnapshot): InsertionPlan {
    return {
      strategy: context.selectedText ? 'replace-selection' : 'insert-at-cursor',
      targetApp: context.appName,
      capability: 'clipboard',
    }
  }

  createProgressiveSession(mode: InsertionStreamingMode): ProgressiveInsertionSession {
    return new ProgressiveInsertionSession(mode)
  }
}
