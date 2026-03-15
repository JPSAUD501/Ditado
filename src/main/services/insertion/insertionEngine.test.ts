import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeText = vi.fn()
const readText = vi.fn(() => '')
const runShortcut = vi.fn(async () => true)

vi.mock('electron', () => ({
  clipboard: {
    readText,
    writeText,
  },
}))

vi.mock('../context/activeContextService.js', () => ({
  runShortcut,
  supportsShortcut: () => true,
}))

describe('InsertionEngine', () => {
  beforeEach(() => {
    writeText.mockClear()
    readText.mockClear()
    runShortcut.mockClear()
    readText.mockReturnValue('')
  })

  it('inserts chunk mode in grouped pieces', async () => {
    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine()
    const session = engine.createProgressiveSession('chunks')

    await session.append('hello world from ditado')
    await session.finalize()

    const pastedValues = writeText.mock.calls
      .map((call) => call[0])
      .filter((value) => value)

    expect(pastedValues.length).toBeGreaterThanOrEqual(1)
    expect(runShortcut).toHaveBeenCalled()
  })

  it('inserts letter-by-letter one character at a time', async () => {
    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine()
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.append('abc')
    await session.finalize()

    const pastedValues = writeText.mock.calls
      .map((call) => call[0])
      .filter((value) => value)

    expect(pastedValues).toEqual(['a', 'b', 'c'])
  })

  it('buffers all-at-once until finalize', async () => {
    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine()
    const session = engine.createProgressiveSession('all-at-once')

    await session.append('hello ')
    await session.append('world')

    expect(writeText.mock.calls.map((call) => call[0]).filter(Boolean)).toEqual([])

    await session.finalize()

    const pastedValues = writeText.mock.calls
      .map((call) => call[0])
      .filter((value) => value)

    expect(pastedValues).toEqual(['hello world'])
  })
})
