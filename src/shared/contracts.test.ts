import { describe, expect, it } from 'vitest'

import { historyEntrySchema, settingsPatchSchema } from './contracts.js'

describe('settingsPatchSchema', () => {
  it('keeps partial updates partial instead of injecting defaults', () => {
    expect(settingsPatchSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' })
    expect(settingsPatchSchema.parse({ launchOnLogin: true })).toEqual({ launchOnLogin: true })
  })
})

describe('historyEntrySchema', () => {
  it('backfills latency breakdown defaults for legacy history entries', () => {
    expect(historyEntrySchema.parse({
      id: 'entry-1',
      createdAt: '2026-03-17T00:00:00.000Z',
      outcome: 'completed',
      appName: 'VS Code',
      windowTitle: 'main.ts',
      activationMode: 'toggle',
      modelId: 'google/gemini-3-flash-preview',
      outputText: 'hello',
      usedContext: false,
      latencyMs: 120,
      insertionStrategy: 'insert-at-cursor',
      requestedMode: 'all-at-once',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: false,
    })).toEqual(expect.objectContaining({
      audioProcessingMs: 0,
      audioSendMs: 0,
      timeToFirstTokenMs: 0,
      timeToCompleteMs: 0,
    }))
  })
})
