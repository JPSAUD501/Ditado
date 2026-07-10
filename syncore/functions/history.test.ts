import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNodeSyncoreRuntime } from 'syncorejs/node'

import { api } from '../_generated/api.js'
import { components, functions, schema } from '../_generated/runtime.js'
import { defaultInsertionPlan, emptyContextSnapshot } from '../../src/shared/defaults.js'

describe('history functions', () => {
  let directory = ''
  let runtime: ReturnType<typeof createNodeSyncoreRuntime>

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ditado-syncore-history-'))
    runtime = createNodeSyncoreRuntime({
      databasePath: join(directory, 'syncore.db'),
      storageDirectory: join(directory, 'storage'),
      schema,
      functions,
      components,
      devtools: false,
    })
    await runtime.start()
  })

  afterEach(async () => {
    await runtime.stop()
    await rm(directory, { recursive: true, force: true })
  })

  it('persists, reads, deduplicates, and removes history audio through Syncore storage', async () => {
    const client = runtime.createClient()
    const sessionId = 'history-with-audio'
    const startedAt = new Date().toISOString()
    const started = await client.mutation(api.sessions.start, {
      sessionId,
      activationMode: 'push-to-talk',
      startedAt,
      targetApp: 'VS Code',
      context: { ...emptyContextSnapshot, appName: 'VS Code' },
      insertionPlan: { ...defaultInsertionPlan, targetApp: 'VS Code' },
      modelId: 'google/gemini-3-flash-preview',
      requestedMode: 'letter-by-letter',
    })
    await client.mutation(api.sessions.markListening, { sessionId })
    const processing = await client.mutation(api.sessions.markProcessing, {
      sessionId,
      processingStartedAt: new Date().toISOString(),
      targetApp: 'VS Code',
      context: started.context,
      insertionPlan: started.insertionPlan,
    })
    await client.mutation(api.sessions.complete, {
      sessionId,
      finishedAt: new Date().toISOString(),
      finalText: 'History audio test',
      partialText: 'History audio test',
      audit: {
        timing: processing.timing,
        audio: processing.audio,
        llm: processing.llm,
        insertion: processing.insertion,
      },
    })

    const audioBytes = Buffer.from('RIFF-syncore-audio')
    const args = {
      sessionId,
      audioBase64: audioBytes.toString('base64'),
      mimeType: 'audio/wav',
      durationMs: 840,
    }
    const saved = await client.mutation(api.history.appendWithAudio, args)
    const repeated = await client.mutation(api.history.appendWithAudio, args)
    const page = await client.query(api.history.page, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    const audio = await client.query(api.history.audio, { sessionId })

    expect(saved.entry).toEqual(expect.objectContaining({
      sessionId,
      outputText: 'History audio test',
      audio: expect.objectContaining({ bytes: audioBytes.byteLength }),
    }))
    expect(saved.session.historyStatus).toBe('saved')
    expect(repeated.entry?._id).toBe(saved.entry?._id)
    expect(page.page).toHaveLength(1)
    expect(audio).toEqual({
      mimeType: 'audio/wav',
      base64: audioBytes.toString('base64'),
    })

    await expect(client.mutation(api.history.remove, { sessionId })).resolves.toBe(true)
    await expect(client.query(api.history.audio, { sessionId })).resolves.toBeNull()
    const emptyPage = await client.query(api.history.page, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(emptyPage.page).toEqual([])
  })
})
