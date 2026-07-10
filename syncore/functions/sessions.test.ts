import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNodeSyncoreRuntime } from 'syncorejs/node'

import { api } from '../_generated/api.js'
import { components, functions, schema } from '../_generated/runtime.js'
import { defaultInsertionPlan, emptyContextSnapshot } from '../../src/shared/defaults.js'

describe('session functions', () => {
  let directory = ''
  let runtime: ReturnType<typeof createNodeSyncoreRuntime>

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ditado-syncore-session-'))
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

  const startSession = async (sessionId: string) => {
    const client = runtime.createClient()
    return client.mutation(api.sessions.start, {
      sessionId,
      activationMode: 'push-to-talk',
      startedAt: new Date().toISOString(),
      targetApp: 'Foreground app',
      context: emptyContextSnapshot,
      insertionPlan: defaultInsertionPlan,
      modelId: 'google/gemini-3-flash-preview',
      requestedMode: 'letter-by-letter',
    })
  }

  it('stores and queries the active singleton through the boolean index', async () => {
    const created = await startSession('session-active')
    const active = await runtime.createClient().query(api.sessions.active)

    expect(created.isActive).toBe(true)
    expect(active?.sessionId).toBe('session-active')
    expect(active?.status).toBe('arming')
  })

  it('rejects invalid transitions and returns the updated document', async () => {
    const client = runtime.createClient()
    const created = await startSession('session-transitions')

    await expect(client.mutation(api.sessions.complete, {
      sessionId: created.sessionId,
      finishedAt: new Date().toISOString(),
      finalText: 'invalid',
      partialText: 'invalid',
      audit: {
        timing: created.timing,
        audio: created.audio,
        llm: created.llm,
        insertion: created.insertion,
      },
    })).rejects.toThrow('Invalid session transition from arming')

    const listening = await client.mutation(api.sessions.markListening, {
      sessionId: created.sessionId,
    })
    expect(listening.status).toBe('listening')

    const processing = await client.mutation(api.sessions.markProcessing, {
      sessionId: created.sessionId,
      processingStartedAt: new Date().toISOString(),
      targetApp: 'VS Code',
      context: { ...emptyContextSnapshot, appName: 'VS Code' },
      insertionPlan: { ...defaultInsertionPlan, targetApp: 'VS Code' },
    })
    const completed = await client.mutation(api.sessions.complete, {
      sessionId: created.sessionId,
      finishedAt: new Date().toISOString(),
      finalText: 'complete',
      partialText: 'complete',
      audit: {
        timing: processing.timing,
        audio: processing.audio,
        llm: processing.llm,
        insertion: processing.insertion,
      },
    })
    expect(completed.status).toBe('completed')
    expect(completed.finalText).toBe('complete')
  })

  it('finalizes an interrupted active session without attempting to resume it', async () => {
    const client = runtime.createClient()
    const created = await startSession('session-interrupted')

    const finalized = await client.mutation(api.sessions.finalizeInterruptedActive)

    expect(finalized).toEqual(expect.objectContaining({
      sessionId: created.sessionId,
      isActive: false,
      status: 'error',
      historyStatus: 'failed',
    }))
    expect(await client.query(api.sessions.active)).toBeNull()
  })
})
