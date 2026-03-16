import { describe, expect, it, vi } from 'vitest'

import {
  clearNativeAddonOutput,
  isLockError,
  syncNativeAddonOutput,
} from './build-native-automation.mjs'

describe('build-native-automation helpers', () => {
  it('recognizes file lock errors', () => {
    expect(isLockError({ code: 'EPERM' })).toBe(true)
    expect(isLockError({ code: 'ENOENT' })).toBe(false)
  })

  it('fails clearly when a locked addon cannot be cleared', () => {
    const removeFile = vi.fn(() => {
      throw Object.assign(new Error('locked'), { code: 'EPERM' })
    })

    expect(() =>
      clearNativeAddonOutput({
        destinationFilePath: 'C:\\locked-addon.node',
        removeFile,
      }),
    ).toThrow(/still holding the native addon/)
  })

  it('fails clearly when a locked addon cannot be replaced', () => {
    const removeFile = vi.fn()
    const copyFile = vi.fn(() => {
      throw Object.assign(new Error('locked'), { code: 'EPERM' })
    })

    expect(() =>
      syncNativeAddonOutput({
        artifactFilePath: 'C:\\artifact.node',
        destinationFilePath: 'C:\\locked-addon.node',
        removeFile,
        copyFile,
      }),
    ).toThrow(/still holding the native addon/)
  })
})
