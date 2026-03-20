import type { Settings } from './contracts.js'

export const isAppReady = (settings: Settings): boolean => (
  settings.onboardingCompleted && settings.apiKeyPresent
)

export const canUseDictation = (settings: Settings): boolean => settings.apiKeyPresent
