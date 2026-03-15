import { OpenRouter } from '@openrouter/sdk'

import { llmResponseSchema, type LlmRequest, type LlmResponse } from '../../../shared/contracts.js'
import { buildSystemPrompt, buildUserPrompt } from '../../../shared/prompt.js'
import type { AppStore } from '../store/appStore.js'

const OPENROUTER_TIMEOUT_MS = 60_000
const OPENROUTER_RETRY_CODES = ['408', '429', '500', '502', '503', '504']

export class OpenRouterService {
  constructor(private readonly store: AppStore) {}

  async stream(
    request: LlmRequest,
    onDelta: (delta: string) => Promise<void>,
  ): Promise<LlmResponse> {
    const apiKey = await this.store.getApiKey()
    if (!apiKey) {
      throw new Error('OpenRouter API key missing or secure storage unavailable')
    }

    const client = new OpenRouter({
      apiKey,
      httpReferer: 'https://ditado.app',
      xTitle: 'Ditado',
      timeoutMs: OPENROUTER_TIMEOUT_MS,
    })

    const startedAt = performance.now()
    let finalText = ''
    let finishReason: string | null = null

    const stream = await client.chat.send(
      {
        chatGenerationParams: {
          model: request.modelId,
          stream: true,
          temperature: 0.2,
          topP: 0.9,
          provider: {
            allowFallbacks: false,
            requireParameters: true,
            zdr: true,
          },
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(),
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: buildUserPrompt(request.context, request.languageHint),
                },
                {
                  type: 'input_audio',
                  inputAudio: {
                    data: request.audioBase64,
                    format: request.audioMimeType.includes('wav') ? 'wav' : 'mp3',
                  },
                },
              ],
            },
          ],
        },
      },
      {
        timeoutMs: OPENROUTER_TIMEOUT_MS,
        retries: {
          strategy: 'backoff',
          backoff: {
            initialInterval: 250,
            maxInterval: 2_000,
            exponent: 2,
            maxElapsedTime: 8_000,
          },
          retryConnectionErrors: true,
        },
        retryCodes: OPENROUTER_RETRY_CODES,
      },
    )

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) {
        continue
      }

      finishReason = choice.finishReason ? String(choice.finishReason) : finishReason
      const fragment = choice.delta?.content ?? ''
      if (!fragment) {
        continue
      }

      finalText += fragment
      await onDelta(fragment)
    }

    return llmResponseSchema.parse({
      text: finalText.trim(),
      latencyMs: Math.round(performance.now() - startedAt),
      finishReason,
    })
  }
}
