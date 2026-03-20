import en from '../renderer/i18n/locales/en.json' with { type: 'json' }
import es from '../renderer/i18n/locales/es.json' with { type: 'json' }
import ptBR from '../renderer/i18n/locales/pt-BR.json' with { type: 'json' }

const resources = {
  en,
  'pt-BR': ptBR,
  es,
} as const

type SupportedLanguage = keyof typeof resources

type TranslationParams = Record<string, string | number>

const getByPath = (source: unknown, path: string): string | null => {
  const value = path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }

    return null
  }, source)

  return typeof value === 'string' ? value : null
}

export const resolveLanguage = (language: string, systemLocale: string): SupportedLanguage => {
  const candidate = language === 'system' ? systemLocale : language

  if (candidate.startsWith('pt')) return 'pt-BR'
  if (candidate.startsWith('es')) return 'es'
  return 'en'
}

export const translate = (
  language: string,
  systemLocale: string,
  key: string,
  params?: TranslationParams,
): string => {
  const resolvedLanguage = resolveLanguage(language, systemLocale)
  const template = getByPath(resources[resolvedLanguage], key) ?? getByPath(resources.en, key) ?? key

  if (!params) {
    return template
  }

  return Object.entries(params).reduce(
    (result, [token, value]) => result.replaceAll(`{{${token}}}`, String(value)),
    template,
  )
}
