import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import type { UpdateState } from '../../../shared/contracts.js'

class MockUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = false
  channel = 'latest'
  checkForUpdates = vi.fn(async () => undefined)
  quitAndInstall = vi.fn(() => undefined)
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
import { defaultSettings } from '../../../shared/defaults.js'

const createSettingsReader = (channel: UpdateState['channel'] = 'stable') =>
  () => ({ ...defaultSettings, updateChannel: channel })

describe('UpdateService', () => {
  it('stays unsupported in unpackaged environments', async () => {
    const updater = new MockUpdater()
    const service = new UpdateService(createSettingsReader(), () => undefined, updater as never, false, '0.1.0')

    await service.initialize()

    expect(service.getState().status).toBe('unsupported')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('configures updater behavior from settings', async () => {
    const updater = new MockUpdater()
    const service = new UpdateService(createSettingsReader('beta'), () => undefined, updater as never, true, '0.1.0-beta.1')

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
    const service = new UpdateService(createSettingsReader(), onStateChanged, updater as never, true, '0.1.0')

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

  it('marks install as in progress before delegating to quitAndInstall', async () => {
    vi.useFakeTimers()
    const updater = new MockUpdater()
    const onStateChanged = vi.fn()
    const service = new UpdateService(createSettingsReader(), onStateChanged, updater as never, true, '0.1.0')

    await service.initialize()
    updater.emit('update-downloaded')

    service.installUpdate()

    expect(service.getState().status).toBe('installing')
    expect(service.isInstallingUpdate()).toBe(true)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(130)

    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    vi.useRealTimers()
  })
})
