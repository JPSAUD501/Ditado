import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.fn()

vi.mock('node:child_process', () => ({
  execFile,
  default: {
    execFile,
  },
}))

vi.mock('active-win', () => ({
  default: vi.fn(async () => ({
    owner: { name: 'VS Code' },
    title: 'prompt.ts',
  })),
}))

describe('ActiveContextService', () => {
  beforeEach(() => {
    execFile.mockReset()
    execFile.mockImplementation(
      (_file: string, _args: string[], callback: (error: Error | null) => void) => {
        callback(null)
      },
    )
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
})
