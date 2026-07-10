import { describe, expect, it } from 'vitest'

import { shouldShowMicrophoneGrantButton } from './microphonePermissions'

describe('shouldShowMicrophoneGrantButton', () => {
  it.each(['not-determined', 'denied', 'restricted'] as const)(
    'shows an actionable button for %s permission',
    (permission) => {
      expect(shouldShowMicrophoneGrantButton(permission, 1)).toBe(true)
    },
  )

  it('hides the button when access is granted or a device is already visible', () => {
    expect(shouldShowMicrophoneGrantButton('granted', 0)).toBe(false)
    expect(shouldShowMicrophoneGrantButton('unknown', 1)).toBe(false)
  })

  it('shows the button for unknown permission only when no device is visible', () => {
    expect(shouldShowMicrophoneGrantButton('unknown', 0)).toBe(true)
  })
})
