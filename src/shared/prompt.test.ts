import { describe, expect, it } from 'vitest'

import { buildSystemPrompt, buildUserPrompt } from './prompt.js'
import type { ContextSnapshot } from './contracts.js'

const context: ContextSnapshot = {
  appName: 'Slack',
  windowTitle: 'Project chat',
  selectedText: 'old copy',
  permissionsGranted: true,
  confidence: 'high',
  capturedAt: new Date().toISOString(),
}

describe('prompt helpers', () => {
  it('builds a system prompt focused on lexical fidelity and empty-speech handling', () => {
    const prompt = buildSystemPrompt()

    expect(prompt).toContain('<output_contract>')
    expect(prompt).toContain('<grounding_rules>')
    expect(prompt).toContain('<verification_loop>')
    expect(prompt).toContain('If the user did not say anything, return an empty string.')
    expect(prompt).toContain('If you are unsure whether any real words were spoken, prefer the empty string.')
    expect(prompt).toContain('Context is never permission to fabricate missing speech.')
    expect(prompt).toContain('Preserve lexical fidelity')
  })

  it('builds a contextual user prompt without before/after cursor content', () => {
    const prompt = buildUserPrompt(context, 'pt-BR')

    expect(prompt).toContain('Active app: Slack')
    expect(prompt).toContain('Selected text: old copy')
    expect(prompt).toContain('Language hint: pt-BR')
    expect(prompt).toContain('output exactly an empty string')
    expect(prompt).not.toContain('Text before cursor')
    expect(prompt).not.toContain('Text after cursor')
  })
})
