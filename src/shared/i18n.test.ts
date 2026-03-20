import { describe, expect, it } from 'vitest'

import { resolveLanguage, translate } from './i18n.js'

describe('shared i18n', () => {
  it('resolves explicit supported languages', () => {
    expect(resolveLanguage('pt-BR', 'en-US')).toBe('pt-BR')
    expect(resolveLanguage('es', 'en-US')).toBe('es')
    expect(resolveLanguage('en', 'pt-BR')).toBe('en')
  })

  it('resolves system language from locale', () => {
    expect(resolveLanguage('system', 'pt-PT')).toBe('pt-BR')
    expect(resolveLanguage('system', 'es-MX')).toBe('es')
    expect(resolveLanguage('system', 'fr-FR')).toBe('en')
  })

  it('translates tray labels with fallback to english', () => {
    expect(translate('pt-BR', 'en-US', 'tray.openSettings')).toBe('Abrir Configurações')
    expect(translate('system', 'es-ES', 'tray.version')).toBe('Versión')
    expect(translate('system', 'fr-FR', 'tray.quit')).toBe('Quit')
  })
})
