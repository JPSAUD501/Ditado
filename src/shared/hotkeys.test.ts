import { describe, expect, it } from 'vitest'

import { hotkeyFromKeyboardEvent, isSupportedHotkey, normalizeHotkey } from './hotkeys.js'

describe('hotkey helpers', () => {
  it('normalizes legacy shortcuts', () => {
    expect(normalizeHotkey('Alt+Space')).toBe('Alt+Space')
    expect(normalizeHotkey('commandorcontrol+shift+space')).toMatch(/^(Ctrl|Meta)\+Shift\+Space$/)
  })

  it('builds modifier-only combos from keyboard events', () => {
    expect(
      hotkeyFromKeyboardEvent({
        key: 'Alt',
        altKey: true,
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe('Ctrl+Alt')
  })

  it('requires at least one modifier', () => {
    expect(isSupportedHotkey('F8')).toBe(false)
    expect(isSupportedHotkey('Shift+Alt')).toBe(true)
    expect(isSupportedHotkey('Alt+D')).toBe(true)
    expect(isSupportedHotkey('Ctrl+Alt')).toBe(true)
  })
})
