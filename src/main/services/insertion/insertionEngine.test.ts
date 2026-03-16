import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runShortcut = vi.fn(async () => true)

vi.mock('../context/activeContextService.js', () => ({
  runShortcut,
}))

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

const createWriterSession = () => ({
  warmup: vi.fn(async () => undefined),
  writeProtected: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
})

const createClipboard = () => ({
  readCurrent: vi.fn(async () => ({ text: 'previous clipboard' })),
  writeProtected: vi.fn(async () => undefined),
  writeNormal: vi.fn(async () => undefined),
  restore: vi.fn(async () => undefined),
  createWriterSession: vi.fn(() => createWriterSession()),
})

const createInputWorker = () => ({
  warmup: vi.fn(async () => ({ foregroundWindowHandle: '100' })),
  sendTextUnicode: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  ping: vi.fn(async () => undefined),
})

describe('InsertionEngine', () => {
  beforeEach(() => {
    runShortcut.mockClear()
  })

  afterEach(() => {
    setPlatform('win32')
  })

  it('writes raw model deltas in chunks mode and restores the previous clipboard after success', async () => {
    setPlatform('win32')
    const clipboard = createClipboard()
    const inputWorker = createInputWorker()
    const writerSession = createWriterSession()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, inputWorker as never)
    const session = engine.createProgressiveSession('chunks', null, writerSession as never)

    await session.append('hello ')
    await session.append('world')
    const execution = await session.finalize('hello world')

    expect(clipboard.writeProtected).toHaveBeenNthCalledWith(1, 'hello ', writerSession)
    expect(clipboard.writeProtected).toHaveBeenNthCalledWith(2, 'world', writerSession)
    expect(runShortcut).toHaveBeenCalledTimes(2)
    expect(clipboard.writeNormal).toHaveBeenCalledWith('hello world')
    expect(clipboard.restore).toHaveBeenCalledWith({ text: 'previous clipboard' }, 'protected', writerSession)
    expect(clipboard.restore).toHaveBeenCalledTimes(1)
    expect(execution).toEqual({
      insertionMethod: 'clipboard-protected',
      fallbackUsed: false,
    })
    expect(inputWorker.sendTextUnicode).not.toHaveBeenCalled()
  })

  it('uses SendInput Unicode for letter-by-letter mode on Windows', async () => {
    setPlatform('win32')
    const clipboard = createClipboard()
    const inputWorker = createInputWorker()
    const writerSession = createWriterSession()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, inputWorker as never)
    const session = engine.createProgressiveSession('letter-by-letter', null, writerSession as never)

    await session.warmup()
    await session.append('A👍🏽B')
    const execution = await session.finalize('A👍🏽B')

    expect(inputWorker.warmup).toHaveBeenCalledTimes(1)
    expect(inputWorker.sendTextUnicode.mock.calls).toEqual([
      ['A', '100'],
      ['👍🏽', '100'],
      ['B', '100'],
    ])
    expect(clipboard.writeProtected).not.toHaveBeenCalled()
    expect(clipboard.writeNormal).toHaveBeenCalledWith('A👍🏽B')
    expect(clipboard.restore).toHaveBeenCalledWith({ text: 'previous clipboard' }, 'protected', writerSession)
    expect(execution).toEqual({
      insertionMethod: 'sendinput-unicode',
      fallbackUsed: false,
    })
  })

  it('switches to chunked protected clipboard writes when SendInput returns a generic worker error', async () => {
    setPlatform('win32')
    const clipboard = createClipboard()
    const inputWorker = createInputWorker()
    inputWorker.sendTextUnicode.mockRejectedValueOnce(
      new (await import('../input/inputWorkerClient.js')).InputWorkerError('send failed', 'send_failed'),
    )
    const writerSession = createWriterSession()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, inputWorker as never)
    const session = engine.createProgressiveSession('letter-by-letter', null, writerSession as never)

    await session.warmup()
    await session.append('AB')
    const execution = await session.finalize('AB')

    expect(inputWorker.sendTextUnicode).toHaveBeenCalledTimes(1)
    expect(clipboard.writeProtected.mock.calls).toEqual([['AB', writerSession]])
    expect(runShortcut).toHaveBeenCalledTimes(1)
    expect(execution).toEqual({
      insertionMethod: 'clipboard-protected',
      fallbackUsed: true,
    })
  })

  it('fails explicitly when SendInput reports a foreground focus change', async () => {
    setPlatform('win32')
    const clipboard = createClipboard()
    const inputWorker = createInputWorker()
    inputWorker.sendTextUnicode.mockRejectedValueOnce(
      new (await import('../input/inputWorkerClient.js')).InputWorkerFocusChangedError(),
    )
    const writerSession = createWriterSession()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, inputWorker as never)
    const session = engine.createProgressiveSession('letter-by-letter', null, writerSession as never)

    await session.warmup()
    await session.append('A')

    await expect(session.finalize('A')).rejects.toThrow('Foreground window changed during SendInput.')
    expect(clipboard.writeProtected).not.toHaveBeenCalled()
  })

  it('copies recovery text to the normal clipboard without restoring on failure', async () => {
    const clipboard = createClipboard()
    const inputWorker = createInputWorker()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, inputWorker as never)
    const session = engine.createProgressiveSession('all-at-once')

    await session.recoverToClipboard('failed insertion text')

    expect(clipboard.writeNormal).toHaveBeenCalledWith('failed insertion text')
    expect(clipboard.restore).not.toHaveBeenCalled()
  })
})
