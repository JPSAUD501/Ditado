import { describe, expect, it, vi } from 'vitest'

import type { UpdateState } from '../../../shared/contracts.js'
import { runStartupUpdateFlow } from './startupUpdateFlow.js'

const createState = (status: UpdateState['status'], enabled = true): UpdateState => ({
  enabled,
  channel: 'stable',
  lastCheckedAt: null,
  status,
  downloadProgress: null,
})

const createUpdates = (initialState: UpdateState = createState('idle')) => {
  let state = initialState
  const listeners = new Set<(state: UpdateState) => void>()

  return {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: (nextState: UpdateState) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
    checkForUpdates: vi.fn(async () => state),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(() => undefined),
    emit(nextState: UpdateState) {
      state = nextState
      for (const listener of listeners) {
        listener(nextState)
      }
    },
  }
}

describe('runStartupUpdateFlow', () => {
  it('continues immediately when updates are unsupported', async () => {
    const updates = createUpdates(createState('unsupported'))
    const showNotice = vi.fn()

    const result = await runStartupUpdateFlow({
      updates,
      showNotice,
    })

    expect(result).toBe('continue')
    expect(showNotice).not.toHaveBeenCalled()
  })

  it('downloads and installs silently when an update becomes available', async () => {
    const updates = createUpdates(createState('checking'))
    updates.checkForUpdates.mockImplementation(async () => {
      updates.emit(createState('available'))
      updates.emit(createState('downloading'))
      updates.emit(createState('downloaded'))
      return updates.getState()
    })
    const showNotice = vi.fn()

    const result = await runStartupUpdateFlow({
      updates,
      showNotice,
    })

    expect(result).toBe('installing')
    expect(showNotice).toHaveBeenCalledWith('notices.updating')
    expect(updates.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(updates.installUpdate).toHaveBeenCalledWith({ silent: true })
  })

  it('shows the failure notice before continuing when the check errors', async () => {
    const updates = createUpdates(createState('checking'))
    updates.checkForUpdates.mockRejectedValue(new Error('boom'))
    const showNotice = vi.fn()
    const waitMs = vi.fn(async () => undefined)

    const result = await runStartupUpdateFlow({
      updates,
      showNotice,
      waitMs,
    })

    expect(result).toBe('continue')
    expect(showNotice).toHaveBeenCalledWith('notices.updateFailed')
    expect(waitMs).toHaveBeenCalledWith(2_000)
  })

  it('shows the failure notice before continuing when download fails', async () => {
    const updates = createUpdates(createState('checking'))
    updates.checkForUpdates.mockImplementation(async () => {
      updates.emit(createState('available'))
      updates.emit(createState('error'))
      return updates.getState()
    })
    const showNotice = vi.fn()
    const waitMs = vi.fn(async () => undefined)

    const result = await runStartupUpdateFlow({
      updates,
      showNotice,
      waitMs,
    })

    expect(result).toBe('continue')
    expect(showNotice).toHaveBeenCalledWith('notices.updating')
    expect(showNotice).toHaveBeenCalledWith('notices.updateFailed')
    expect(updates.installUpdate).not.toHaveBeenCalled()
  })
})
