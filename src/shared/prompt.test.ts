import { describe, expect, it } from 'vitest'

import { buildOpenRouterPayload, buildUserPrompt } from './prompt.js'
import type { ContextSnapshot, LlmRequest } from './contracts.js'

const context: ContextSnapshot = {
  appName: 'Slack',
  windowTitle: 'Project chat',
  selectedText: 'old copy',
  textBefore: 'Yesterday we shipped',
  textAfter: 'Thanks!',
  permissionsGranted: true,
  confidence: 'high',
  capturedAt: new Date().toISOString(),
}

describe('prompt helpers', () => {
  it('builds a GPT-5.4 style system prompt contract', () => {
    const prompt = buildOpenRouterPayload({
      audioBase64: 'ZmFrZQ==',
      audioMimeType: 'audio/wav',
      languageHint: 'pt-BR',
      context,
      modelId: 'google/gemini-3-flash-preview',
    })

    const messages = (prompt.messages as Array<{ role: string; content: unknown }>)
    const systemMessage = messages.find((message) => message.role === 'system')

    expect(systemMessage?.content).toContain('<output_contract>')
    expect(systemMessage?.content).toContain('<verification_loop>')
    expect(systemMessage?.content).toContain('<structured_output_contract>')
    expect(systemMessage?.content).toContain('Preserve lexical fidelity for specific tokens')
    expect(systemMessage?.content).toContain('Keep uncertainty localized to the token')
  })

  it('builds a contextual user prompt', () => {
    const prompt = buildUserPrompt(context, 'pt-BR')

    expect(prompt).toContain('Active app: Slack')
    expect(prompt).toContain('Selected text: old copy')
    expect(prompt).toContain('Language hint: pt-BR')
    expect(prompt).toContain('Definition of done')
    expect(prompt).toContain('preserve specific spoken tokens faithfully')
  })

  it('creates an OpenRouter multimodal payload', () => {
    const request: LlmRequest = {
      audioBase64: 'ZmFrZQ==',
      audioMimeType: 'audio/wav',
      languageHint: 'en-US',
      context,
      modelId: 'google/gemini-3-flash-preview',
    }

    const payload = buildOpenRouterPayload(request)
    expect(payload).toMatchObject({
      model: 'google/gemini-3-flash-preview',
      stream: true,
    })
  })
})
