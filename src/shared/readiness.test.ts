import { describe, expect, it } from 'vitest'

import { defaultSettings } from './defaults.js'
import { canUseDictation, isAppReady } from './readiness.js'

describe('readiness helpers', () => {
  it('requires onboarding and api key for the app to be fully ready', () => {
    expect(isAppReady(defaultSettings)).toBe(false)
    expect(isAppReady({
      ...defaultSettings,
      apiKeyPresent: true,
      onboardingCompleted: false,
    })).toBe(false)
    expect(isAppReady({
      ...defaultSettings,
      apiKeyPresent: true,
      onboardingCompleted: true,
    })).toBe(true)
  })

  it('allows dictation as soon as the api key is configured', () => {
    expect(canUseDictation(defaultSettings)).toBe(false)
    expect(canUseDictation({
      ...defaultSettings,
      apiKeyPresent: true,
      onboardingCompleted: false,
    })).toBe(true)
  })
})
