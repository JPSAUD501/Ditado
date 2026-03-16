import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = {
  keydown: new Set<(event: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }) => void>(),
  keyup: new Set<(event: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }) => void>(),
}

const registerShortcut = vi.fn<(accelerator: string, callback: () => void) => boolean>(() => true)
const unregisterShortcut = vi.fn<(accelerator: string) => void>(() => undefined)

vi.mock('electron', () => ({
  globalShortcut: {
    register: registerShortcut,
    unregister: unregisterShortcut,
  },
}))

vi.mock('uiohook-napi', () => ({
  UiohookKey: {
    Escape: 1,
    Alt: 56,
    AltRight: 3640,
    Ctrl: 29,
    CtrlRight: 3613,
    D: 32,
    F: 33,
    Meta: 3675,
    MetaRight: 3676,
    Shift: 42,
    ShiftRight: 54,
  },
  uIOhook: {
    on: vi.fn((event: 'keydown' | 'keyup', listener: (payload: never) => void) => {
      listeners[event].add(listener as never)
    }),
    start: vi.fn(),
  },
}))

const emit = (
  eventName: 'keydown' | 'keyup',
  event: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean },
) => {
  for (const listener of listeners[eventName]) {
    listener(event)
  }
}

beforeEach(() => {
  listeners.keydown.clear()
  listeners.keyup.clear()
  registerShortcut.mockReset()
  registerShortcut.mockImplementation(() => true)
  unregisterShortcut.mockReset()
  unregisterShortcut.mockImplementation(() => undefined)
  vi.resetModules()
})

describe('registerShortcuts', () => {
  it('starts toggle from a modifier-only shortcut through uiohook', async () => {
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const orchestrator = {
      startCapture: vi.fn(async () => undefined),
      toggleCapture: vi.fn(async () => undefined),
      requestStop: vi.fn(),
      showShortPressHint: vi.fn(async () => undefined),
      getSession: vi.fn(() => null),
    }
    const store = {
      getSettings: () => ({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Shift+Alt',
      }),
    }

    registerShortcuts(store as never, orchestrator as never, () => false)

    expect(registerShortcut).not.toHaveBeenCalled()

    emit('keydown', { keycode: 42, ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })
    emit('keydown', { keycode: 56, ctrlKey: false, altKey: true, shiftKey: true, metaKey: false })

    expect(orchestrator.toggleCapture).toHaveBeenCalledTimes(1)
  })

  it('starts and stops push-to-talk when Ctrl+Alt is held and released', async () => {
    vi.useFakeTimers()
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const orchestrator = {
      startCapture: vi.fn(async () => undefined),
      toggleCapture: vi.fn(async () => undefined),
      requestStop: vi.fn(),
      showShortPressHint: vi.fn(async () => undefined),
      getSession: vi
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValue({
          status: 'listening',
          activationMode: 'push-to-talk',
        }),
    }
    const store = {
      getSettings: () => ({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Shift+Alt',
      }),
    }

    registerShortcuts(store as never, orchestrator as never, () => false)

    emit('keydown', { keycode: 29, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })
    emit('keydown', { keycode: 56, ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })
    vi.advanceTimersByTime(650)

    expect(orchestrator.startCapture).toHaveBeenCalledWith('push-to-talk')

    emit('keyup', { keycode: 56, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })

    expect(orchestrator.requestStop).toHaveBeenCalledWith('push-to-talk')
    vi.useRealTimers()
  })

  it('shows a short-press hint instead of submitting when push-to-talk is tapped', async () => {
    vi.useFakeTimers()
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const orchestrator = {
      startCapture: vi.fn(async () => undefined),
      toggleCapture: vi.fn(async () => undefined),
      requestStop: vi.fn(),
      showShortPressHint: vi.fn(async () => undefined),
      getSession: vi.fn(() => null),
    }
    const store = {
      getSettings: () => ({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Shift+Alt',
      }),
    }

    registerShortcuts(store as never, orchestrator as never, () => false)

    emit('keydown', { keycode: 29, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })
    emit('keydown', { keycode: 56, ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })
    vi.advanceTimersByTime(200)
    emit('keyup', { keycode: 56, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })

    expect(orchestrator.requestStop).not.toHaveBeenCalled()
    expect(orchestrator.showShortPressHint).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('registers accelerators only for shortcuts with a main key', async () => {
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const settings = {
      pushToTalkHotkey: 'Ctrl+Alt',
      toggleHotkey: 'Shift+Alt',
    }
    const store = {
      getSettings: () => settings,
    }

    const refreshShortcuts = registerShortcuts(
      store as never,
      {
        startCapture: vi.fn(async () => undefined),
        toggleCapture: vi.fn(async () => undefined),
        requestStop: vi.fn(),
        showShortPressHint: vi.fn(async () => undefined),
        getSession: vi.fn(() => null),
      } as never,
      () => false,
    )

    expect(registerShortcut).not.toHaveBeenCalled()

    settings.toggleHotkey = 'Ctrl+F'
    refreshShortcuts()

    expect(registerShortcut).toHaveBeenCalledWith('CommandOrControl+F', expect.any(Function))
  })

  it('stops push-to-talk on the second shortcut press when using a key-based accelerator', async () => {
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const orchestrator = {
      startCapture: vi.fn(async () => undefined),
      toggleCapture: vi.fn(async () => undefined),
      requestStop: vi.fn(),
      showShortPressHint: vi.fn(async () => undefined),
      getSession: vi.fn(() => ({
        status: 'listening',
        activationMode: 'push-to-talk',
      })),
    }
    const store = {
      getSettings: () => ({
        pushToTalkHotkey: 'Alt+D',
        toggleHotkey: 'Shift+Alt',
      }),
    }

    registerShortcuts(store as never, orchestrator as never, () => false)

    const pushCall = (registerShortcut.mock.calls as Array<unknown[]>).find((call) => call[0] === 'Alt+D')
    const pushCallback = pushCall?.[1]
    if (typeof pushCallback !== 'function') {
      throw new Error('Expected push callback to be registered')
    }

    await pushCallback()

    expect(orchestrator.requestStop).toHaveBeenCalledWith('push-to-talk')
  })

  it('does not double-trigger push-to-talk when a key-based accelerator also emits a hook event', async () => {
    vi.useFakeTimers()
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const orchestrator = {
      startCapture: vi.fn(async () => undefined),
      toggleCapture: vi.fn(async () => undefined),
      requestStop: vi.fn(),
      showShortPressHint: vi.fn(async () => undefined),
      getSession: vi
        .fn()
        .mockReturnValueOnce({
          status: 'arming',
          activationMode: 'push-to-talk',
        })
        .mockReturnValue({
          status: 'listening',
          activationMode: 'push-to-talk',
        }),
    }
    const store = {
      getSettings: () => ({
        pushToTalkHotkey: 'Alt+D',
        toggleHotkey: 'Shift+Alt',
      }),
    }

    registerShortcuts(store as never, orchestrator as never, () => false)

    const pushCall = (registerShortcut.mock.calls as Array<unknown[]>).find((call) => call[0] === 'Alt+D')
    const pushCallback = pushCall?.[1]
    if (typeof pushCallback !== 'function') {
      throw new Error('Expected push callback to be registered')
    }

    await pushCallback()
    emit('keydown', { keycode: 56, ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })
    emit('keydown', { keycode: 32, ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })
    vi.advanceTimersByTime(650)
    emit('keyup', { keycode: 32, ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })

    expect(orchestrator.startCapture).toHaveBeenCalledTimes(1)
    expect(orchestrator.requestStop).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('falls back to uiohook for key-based toggle when the global accelerator cannot be registered', async () => {
    registerShortcut.mockImplementation((accelerator: string) => accelerator !== 'CommandOrControl+D')
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const orchestrator = {
      startCapture: vi.fn(async () => undefined),
      toggleCapture: vi.fn(async () => undefined),
      requestStop: vi.fn(),
      showShortPressHint: vi.fn(async () => undefined),
      getSession: vi.fn(() => null),
    }
    const store = {
      getSettings: () => ({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Ctrl+D',
      }),
    }

    registerShortcuts(store as never, orchestrator as never, () => false)

    emit('keydown', { keycode: 29, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })
    emit('keydown', { keycode: 32, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })

    expect(orchestrator.toggleCapture).toHaveBeenCalledTimes(1)
  })

  it('cancels the active session when Escape is pressed', async () => {
    const { registerShortcuts } = await import('./registerShortcuts.js')
    const orchestrator = {
      startCapture: vi.fn(async () => undefined),
      toggleCapture: vi.fn(async () => undefined),
      requestStop: vi.fn(),
      showShortPressHint: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      getSession: vi.fn(() => ({
        status: 'streaming',
        activationMode: 'toggle',
      })),
    }
    const store = {
      getSettings: () => ({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Shift+Alt',
      }),
    }

    registerShortcuts(store as never, orchestrator as never, () => false)

    emit('keydown', { keycode: 1, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })

    expect(orchestrator.cancel).toHaveBeenCalledTimes(1)
    expect(orchestrator.toggleCapture).not.toHaveBeenCalled()
    expect(orchestrator.requestStop).not.toHaveBeenCalled()
  })
})
