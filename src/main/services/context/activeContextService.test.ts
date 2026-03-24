import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.fn()
const originalPlatform = process.platform
const originalDisplay = process.env.DISPLAY
const originalWaylandDisplay = process.env.WAYLAND_DISPLAY
const originalSessionType = process.env.XDG_SESSION_TYPE

const restoreEnv = (
  key: 'DISPLAY' | 'WAYLAND_DISPLAY' | 'XDG_SESSION_TYPE',
  value: string | undefined,
) => {
  if (typeof value === 'string') {
    process.env[key] = value
    return
  }

  delete process.env[key]
}

vi.mock('node:child_process', () => ({
  execFile,
  default: {
    execFile,
  },
}))

vi.mock('active-win', () => ({
  activeWindow: vi.fn(async () => ({
    owner: { name: 'VS Code' },
    title: 'prompt.ts',
  })),
  default: vi.fn(async () => ({
    owner: { name: 'VS Code' },
    title: 'prompt.ts',
  })),
}))

describe('ActiveContextService', () => {
  beforeEach(() => {
    vi.resetModules()
    execFile.mockReset()
    execFile.mockImplementation(
      (_file: string, _args: string[], callback: (error: Error | null) => void) => {
        callback(null)
      },
    )
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    restoreEnv('DISPLAY', originalDisplay)
    restoreEnv('WAYLAND_DISPLAY', originalWaylandDisplay)
    restoreEnv('XDG_SESSION_TYPE', originalSessionType)
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    restoreEnv('DISPLAY', originalDisplay)
    restoreEnv('WAYLAND_DISPLAY', originalWaylandDisplay)
    restoreEnv('XDG_SESSION_TYPE', originalSessionType)
  })

  it('captures selected text and restores the previous clipboard with protected mode when available', async () => {
    const clipboard = {
      readCurrent: vi
        .fn()
        .mockResolvedValueOnce({ text: 'previous clipboard' })
        .mockResolvedValueOnce({ text: 'selected text' }),
      writeNormal: vi.fn(async () => undefined),
      restore: vi.fn(async () => undefined),
    }

    const { ActiveContextService } = await import('./activeContextService.js')
    const service = new ActiveContextService(clipboard as never)
    const context = await service.capture(true, true)

    expect(context.selectedText).toBe('selected text')
    expect(clipboard.writeNormal).toHaveBeenCalled()
    expect(clipboard.restore).toHaveBeenCalledWith({ text: 'previous clipboard' })
  })

  it('treats whitespace-only selection as empty', async () => {
    const clipboard = {
      readCurrent: vi
        .fn()
        .mockResolvedValueOnce({ text: 'previous clipboard' })
        .mockResolvedValueOnce({ text: '   ' }),
      writeNormal: vi.fn(async () => undefined),
      restore: vi.fn(async () => undefined),
    }

    const { ActiveContextService } = await import('./activeContextService.js')
    const service = new ActiveContextService(clipboard as never)
    const context = await service.capture(true, true)

    expect(context.selectedText).toBe('')
    expect(context.confidence).toBe('partial')
    expect(clipboard.restore).toHaveBeenCalledWith({ text: 'previous clipboard' })
  })

  it('throws an actionable error for Wayland paste attempts on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    process.env.XDG_SESSION_TYPE = 'wayland'
    delete process.env.DISPLAY
    delete process.env.WAYLAND_DISPLAY

    const { runShortcutOrThrow } = await import('./activeContextService.js')

    await expect(runShortcutOrThrow('paste')).rejects.toThrow(
      'Ditado cannot send text into other apps on Linux Wayland. Use an X11 session (Ubuntu on Xorg) to enable external text insertion.',
    )
    expect(execFile).not.toHaveBeenCalled()
  })

  it('throws an actionable error when xdotool is missing on Linux/X11', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    process.env.XDG_SESSION_TYPE = 'x11'
    process.env.DISPLAY = ':0'
    delete process.env.WAYLAND_DISPLAY
    execFile.mockImplementationOnce(
      (_file: string, _args: string[], callback: (error: Error | null) => void) => {
        callback(new Error('missing xdotool'))
      },
    )

    const { runShortcutOrThrow } = await import('./activeContextService.js')

    await expect(runShortcutOrThrow('paste')).rejects.toThrow(
      'Ditado requires xdotool on Linux/X11 to copy or paste text into other apps. Install it with: sudo apt install xdotool',
    )
    expect(execFile).toHaveBeenCalledTimes(1)
    expect(execFile).toHaveBeenCalledWith('xdotool', ['--version'], expect.any(Function))
  })

  it('uses xdotool directly for Linux/X11 shortcuts', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    process.env.XDG_SESSION_TYPE = 'x11'
    process.env.DISPLAY = ':0'
    delete process.env.WAYLAND_DISPLAY

    const { runShortcutOrThrow } = await import('./activeContextService.js')

    await expect(runShortcutOrThrow('paste')).resolves.toBeUndefined()
    expect(execFile).toHaveBeenNthCalledWith(1, 'xdotool', ['--version'], expect.any(Function))
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      'xdotool',
      ['key', '--clearmodifiers', 'ctrl+v'],
      expect.any(Function),
    )
  })
})
