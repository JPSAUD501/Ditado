import { beforeEach, describe, expect, it, vi } from 'vitest'

const clipboardState = {
  text: '',
}

vi.mock('electron', () => ({
  clipboard: {
    readText: vi.fn(() => clipboardState.text),
    writeText: vi.fn((value: string) => {
      clipboardState.text = value
    }),
  },
}))

describe('ClipboardService', () => {
  beforeEach(() => {
    clipboardState.text = 'original'
  })

  it('reads the current clipboard content', async () => {
    const { ClipboardService } = await import('./clipboardService.js')
    const service = new ClipboardService()

    await expect(service.readCurrent()).resolves.toEqual({ text: 'original' })
  })

  it('writes text to the clipboard normally', async () => {
    const { ClipboardService } = await import('./clipboardService.js')
    const service = new ClipboardService()

    await service.writeNormal('final text')

    expect(clipboardState.text).toBe('final text')
  })

  it('restores a previous snapshot', async () => {
    const { ClipboardService } = await import('./clipboardService.js')
    const service = new ClipboardService()

    await service.restore({ text: 'restored text' })

    expect(clipboardState.text).toBe('restored text')
  })
})
