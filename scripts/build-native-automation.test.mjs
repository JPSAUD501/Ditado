import { describe, expect, it, vi } from 'vitest'

import {
  clearNativeAddonOutput,
  getNativeArtifactFileNames,
  hasAvailableWslDistro,
  isLockError,
  resolveExistingArtifactPath,
  syncNativeAddonOutput,
} from './build-native-automation.mjs'

describe('build-native-automation helpers', () => {
  it('uses the correct platform artifact names', () => {
    expect(getNativeArtifactFileNames('linux')).toEqual([
      'libditado_native_automation.so',
      'ditado_native_automation.so',
    ])
    expect(getNativeArtifactFileNames('darwin')).toEqual([
      'libditado_native_automation.dylib',
      'ditado_native_automation.dylib',
    ])
    expect(getNativeArtifactFileNames('win32')).toEqual(['ditado_native_automation.dll'])
  })

  it('picks the first artifact that exists', () => {
    expect(
      resolveExistingArtifactPath({
        candidatePaths: ['/tmp/missing.node', '/tmp/fallback.node'],
        fileExists: (candidatePath) => candidatePath === '/tmp/fallback.node',
      }),
    ).toBe('/tmp/fallback.node')
  })

  it('recognizes file lock errors', () => {
    expect(isLockError({ code: 'EPERM' })).toBe(true)
    expect(isLockError({ code: 'ENOENT' })).toBe(false)
  })

  it('checks for a configured WSL distro without surfacing wsl errors', () => {
    expect(
      hasAvailableWslDistro({
        platform: 'win32',
        execFile: vi.fn(() => 'Ubuntu\r\n'),
      }),
    ).toBe(true)

    expect(
      hasAvailableWslDistro({
        platform: 'win32',
        execFile: vi.fn(() => {
          throw new Error('WSL_E_DEFAULT_DISTRO_NOT_FOUND')
        }),
      }),
    ).toBe(false)

    expect(
      hasAvailableWslDistro({
        platform: 'linux',
        execFile: vi.fn(() => 'Ubuntu\r\n'),
      }),
    ).toBe(false)
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
