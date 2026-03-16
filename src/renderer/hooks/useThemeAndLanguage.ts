import { useEffect } from 'react'

import { changeLanguage } from '@renderer/i18n'
import type { Settings } from '@shared/contracts'

const getColorSchemeMedia = (): MediaQueryList | null => {
  if (typeof window.matchMedia !== 'function') {
    return null
  }
  return window.matchMedia('(prefers-color-scheme: dark)')
}

const applyTheme = (theme: Settings['theme']): void => {
  if (theme === 'system') {
    const prefersDark = getColorSchemeMedia()?.matches ?? true
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light'
  } else {
    document.documentElement.dataset.theme = theme
  }
}

export const useThemeAndLanguage = (settings: Pick<Settings, 'theme' | 'language'>): void => {
  useEffect(() => {
    applyTheme(settings.theme)

    if (settings.theme === 'system') {
      const mq = getColorSchemeMedia()
      if (!mq) {
        return
      }
      const handler = (): void => applyTheme('system')
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
      }
      mq.addListener(handler)
      return () => mq.removeListener(handler)
    }
  }, [settings.theme])

  useEffect(() => {
    changeLanguage(settings.language)
  }, [settings.language])
}
