import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let appPath = ''

vi.mock('electron', () => ({
  app: {
    getAppPath: () => appPath,
    isPackaged: false,
  },
}))

describe('AutomationService', () => {
  beforeEach(async () => {
    vi.resetModules()
    appPath = await mkdtemp(join(tmpdir(), 'ditado-automation-'))
  })

  it('loads the JS fallback module when the native addon is unavailable', async () => {
    const nativeDir = join(appPath, 'dist-electron', 'native')
    await mkdir(nativeDir, { recursive: true })
    await writeFile(
      join(nativeDir, 'ditado_native_automation.cjs'),
      `'use strict'
exports.warmup = () => ({ platform: 'win32', sessionType: null, supportsLetterByLetter: false, reason: 'native_addon_unavailable' })
exports.getEnvironment = exports.warmup
exports.typeGrapheme = () => { throw new Error('unavailable') }
exports.typeText = () => { throw new Error('unavailable') }
`,
      'utf8',
    )

    const { AutomationService } = await import('./automationService.js')
    const service = new AutomationService()

    expect(service.warmup()).toEqual({
      platform: 'win32',
      sessionType: null,
      supportsLetterByLetter: false,
      reason: 'native_addon_unavailable',
    })
  })

  it('throws a structured error when neither native nor fallback automation modules exist', async () => {
    const { AutomationService, AutomationServiceError } = await import('./automationService.js')
    const service = new AutomationService()

    expect(() => service.warmup()).toThrow(AutomationServiceError)
    expect(() => service.warmup()).toThrow('Native automation addon not found')
  })
})
