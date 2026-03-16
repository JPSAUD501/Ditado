import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import type { UpdateState } from '../../../shared/contracts.js'

class MockUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = false
  channel = 'latest'
  checkForUpdates = vi.fn(async () => undefined)
}

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '0.1.0',
  },
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {},
  },
}))

import { UpdateService } from './updateService.js'

const createStore = (enabled = true, channel: UpdateState['channel'] = 'stable') =>
  ({
    getSettings: () => ({
      autoUpdateEnabled: enabled,
      updateChannel: channel,
    }),
  }) as never

describe('UpdateService', () => {
  it('stays unsupported in unpackaged environments', async () => {
    const updater = new MockUpdater()
    const service = new UpdateService(createStore(true), () => undefined, updater as never, false, '0.1.0')

    await service.initialize()

    expect(service.getState().status).toBe('unsupported')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('configures updater behavior from settings', async () => {
    const updater = new MockUpdater()
    const service = new UpdateService(createStore(true, 'beta'), () => undefined, updater as never, true, '0.1.0-beta.1')

    await service.initialize()

    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.allowPrerelease).toBe(true)
    expect(updater.channel).toBe('beta')
    expect(service.getState().channel).toBe('beta')
  })

  it('tracks updater event transitions', async () => {
    const updater = new MockUpdater()
    const onStateChanged = vi.fn()
    const service = new UpdateService(createStore(true), onStateChanged, updater as never, true, '0.1.0')

    await service.initialize()
    await service.checkForUpdates()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)

    updater.emit('checking-for-update')
    expect(service.getState().status).toBe('checking')

    updater.emit('download-progress')
    expect(service.getState().status).toBe('downloading')

    updater.emit('update-downloaded')
    expect(service.getState().status).toBe('downloaded')
    expect(onStateChanged).toHaveBeenCalled()
  })
})
