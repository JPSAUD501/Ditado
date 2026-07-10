import { describe, expect, it } from 'vitest'

import { deriveHistoryDurations, type HistorySessionTiming } from './contracts.js'

const emptyTiming = (): HistorySessionTiming => ({
  sessionStartedMs: null,
  contextPreviewStartedMs: null,
  contextPreviewCompletedMs: null,
  contextRefreshStartedMs: null,
  contextRefreshCompletedMs: null,
  submissionStartedMs: null,
  stopRequestedMs: null,
  microphoneRequestStartedMs: null,
  microphoneRequestCompletedMs: null,
  recordingStartedMs: null,
  recordingEndedMs: null,
  recorderStopStartedMs: null,
  mediaRecorderStopCompletedMs: null,
  audioPreparationStartedMs: null,
  audioPreparationEndedMs: null,
  processingStartedMs: null,
  llmRequestStartedMs: null,
  llmResponseHeadersMs: null,
  firstTokenMs: null,
  llmCompletedMs: null,
  insertionStartedMs: null,
  insertionCompletedMs: null,
  sessionFinishedMs: null,
})

describe('deriveHistoryDurations', () => {
  it('derives audit durations from canonical Syncore timing fields', () => {
    expect(deriveHistoryDurations({
      ...emptyTiming(),
      sessionStartedMs: 100,
      recordingStartedMs: 200,
      recordingEndedMs: 1_200,
      llmRequestStartedMs: 1_300,
      llmResponseHeadersMs: 1_400,
      firstTokenMs: 1_500,
      llmCompletedMs: 1_900,
      sessionFinishedMs: 2_000,
    })).toEqual(expect.objectContaining({
      recordingMs: 1_000,
      networkHandshakeMs: 100,
      modelUntilFirstTokenMs: 100,
      modelStreamingMs: 400,
      llmTotalMs: 600,
      totalSessionMs: 1_900,
    }))
  })
})
