import { describe, expect, it, vi } from 'vitest'

import { syncLoginItemSettings } from './loginItem.js'

const createAppApi = (overrides?: Partial<Parameters<typeof syncLoginItemSettings>[0]>) => ({
  isPackaged: true,
  getPath: vi.fn(() => '/Applications/Ditado.app/Contents/MacOS/Ditado'),
  getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
  setLoginItemSettings: vi.fn(),
  ...overrides,
})

describe('syncLoginItemSettings', () => {
  it('skips updating when the value is already in sync', () => {
    const appApi = createAppApi({
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: true })),
    })

    const result = syncLoginItemSettings(appApi, true)

    expect(result).toBe(true)
    expect(appApi.setLoginItemSettings).not.toHaveBeenCalled()
  })

  it('does not try to enable login item for unpackaged macOS apps', () => {
    const appApi = createAppApi({
      isPackaged: false,
      getPath: vi.fn(() => '/Users/test/dev/Ditado'),
    })
    const logger = { warn: vi.fn() }

    const result = syncLoginItemSettings(appApi, true, logger, 'darwin')

    expect(result).toBe(false)
    expect(appApi.setLoginItemSettings).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('updates the login item when supported', () => {
    const appApi = createAppApi()

    const result = syncLoginItemSettings(appApi, true, { warn: vi.fn() }, 'darwin')

    expect(result).toBe(true)
    expect(appApi.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  })

  it('swallows platform errors and reports a warning', () => {
    const appApi = createAppApi({
      setLoginItemSettings: vi.fn(() => { throw new Error('Operation not permitted') }),
    })
    const logger = { warn: vi.fn() }

    const result = syncLoginItemSettings(appApi, true, logger, 'darwin')

    expect(result).toBe(false)
    expect(logger.warn).toHaveBeenCalledOnce()
  })
})
