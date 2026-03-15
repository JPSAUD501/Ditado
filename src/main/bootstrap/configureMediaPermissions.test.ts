import { describe, expect, it, vi } from 'vitest'

import { configureMediaPermissions } from './configureMediaPermissions.js'

describe('configureMediaPermissions', () => {
  it('allows audio media access and rejects unrelated or video media permissions', () => {
    const setPermissionCheckHandler = vi.fn()
    const setPermissionRequestHandler = vi.fn()

    configureMediaPermissions({
      setPermissionCheckHandler,
      setPermissionRequestHandler,
    } as never)

    const checkHandler = setPermissionCheckHandler.mock.calls[0]?.[0] as (
      webContents: null,
      permission: string,
      origin: string,
      details: { mediaTypes?: Array<'audio' | 'video'> },
    ) => boolean
    const requestHandler = setPermissionRequestHandler.mock.calls[0]?.[0] as (
      webContents: null,
      permission: string,
      callback: (granted: boolean) => void,
      details: { mediaTypes?: Array<'audio' | 'video'> },
    ) => void

    expect(checkHandler(null, 'media', 'http://127.0.0.1:5173', { mediaTypes: ['audio'] })).toBe(true)
    expect(checkHandler(null, 'media', 'http://127.0.0.1:5173', { mediaTypes: ['video'] })).toBe(false)
    expect(checkHandler(null, 'notifications', 'http://127.0.0.1:5173', {})).toBe(false)

    const audioCallback = vi.fn()
    requestHandler(null, 'media', audioCallback, { mediaTypes: ['audio'] })
    expect(audioCallback).toHaveBeenCalledWith(true)

    const videoCallback = vi.fn()
    requestHandler(null, 'media', videoCallback, { mediaTypes: ['video'] })
    expect(videoCallback).toHaveBeenCalledWith(false)
  })
})
