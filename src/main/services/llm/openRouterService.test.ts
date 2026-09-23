import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('@openrouter/sdk', () => ({
  OpenRouter: class {
    chat = {
      send: sendMock,
    }
  },
}))

import { OpenRouterService } from './openRouterService.js'

describe('OpenRouterService', () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  it('returns audioSendMs from request start to response headers without affecting total latency', async () => {
    sendMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield {
          choices: [
            {
              delta: { content: 'hello' },
              finishReason: 'stop',
            },
          ],
        }
      },
    })

    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(145)
      .mockReturnValueOnce(220)

    const service = new OpenRouterService({
      getApiKey: vi.fn(async () => 'sk-test'),
    } as never)

    const response = await service.stream({
      audioBase64: 'ZmFrZQ==',
      audioMimeType: 'audio/wav',
      languageHint: 'pt-BR',
      context: {
        appName: 'VS Code',
        windowTitle: 'main.ts',
        selectedText: '',
        permissionsGranted: true,
        confidence: 'high',
        capturedAt: '2026-03-17T00:00:00.000Z',
      },
      modelId: 'google/gemini-3-flash-preview',
      zeroDataRetention: false,
    }, async () => undefined)

    expect(response).toMatchObject({
      text: 'hello',
      latencyMs: 120,
      audioSendMs: 45,
      finishReason: 'stop',
      provider: 'openrouter',
    })
    expect(response.requestStartedAt).toBeTruthy()
    expect(response.responseHeadersAt).toBeTruthy()
    expect(response.completedAt).toBeTruthy()

    nowSpy.mockRestore()
  })

  it.each([
    [false, { allowFallbacks: false }],
    [true, { allowFallbacks: false, zdr: true }],
  ])('routes with zeroDataRetention=%s without requiring sampling params', async (zeroDataRetention, provider) => {
    sendMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'ok' }, finishReason: 'stop' }] }
      },
    })

    const service = new OpenRouterService({
      getApiKey: vi.fn(async () => 'sk-test'),
    } as never)

    await service.stream({
      audioBase64: 'ZmFrZQ==',
      audioMimeType: 'audio/wav',
      languageHint: null,
      context: {
        appName: 'VS Code',
        windowTitle: null,
        selectedText: '',
        permissionsGranted: true,
        confidence: 'high',
        capturedAt: '2026-03-17T00:00:00.000Z',
      },
      modelId: 'google/gemini-3.6-flash',
      zeroDataRetention,
    }, async () => undefined)

    expect(sendMock.mock.calls[0]?.[0].chatGenerationParams.provider).toStrictEqual(provider)
  })
})
