import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = {
  keydown: new Set<(event: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }) => void>(),
  keyup: new Set<(event: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }) => void>(),
}

const registerShortcut = vi.fn(() => true)
const unregisterShortcut = vi.fn(() => undefined)

vi.mock('electron', () => ({
  globalShortcut: {
    register: registerShortcut,
    unregister: unregisterShortcut,
  },
}))

vi.mock('uiohook-napi', () => ({
  UiohookKey: {
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
  registerShortcut.mockClear()
  unregisterShortcut.mockClear()
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

  it('falls back to uiohook for key-based toggle when the low-level event arrives first', async () => {
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
})
