import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationEnvironment } from '../automation/automationService.js'

const runShortcut = vi.fn(async () => true)

vi.mock('../context/activeContextService.js', () => ({
  runShortcut,
}))

const createClipboard = () => ({
  readCurrent: vi.fn(async () => ({ text: 'previous clipboard' })),
  writeNormal: vi.fn(async () => undefined),
  restore: vi.fn(async () => undefined),
})

const createEnvironment = (
  overrides: Partial<AutomationEnvironment> = {},
): AutomationEnvironment => ({
  platform: process.platform,
  sessionType: null,
  supportsLetterByLetter: true,
  reason: null,
  ...overrides,
})

const createAutomation = () => ({
  warmup: vi.fn(() => ({
    ...createEnvironment(),
  })),
  getEnvironment: vi.fn(() => ({
    ...createEnvironment(),
  })),
  typeGrapheme: vi.fn(() => undefined),
  typeText: vi.fn(() => undefined),
  dispose: vi.fn(() => undefined),
})

describe('InsertionEngine', () => {
  beforeEach(() => {
    runShortcut.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const flushAdaptiveTyping = async () => {
    await vi.advanceTimersByTimeAsync(5_000)
  }

  it('buffers incoming chunks instead of draining them synchronously on append', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboard()
    const automation = createAutomation()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.warmup()
    await session.append('abc')

    expect(automation.typeGrapheme).not.toHaveBeenCalled()

    const executionPromise = session.finalize('abc')
    await flushAdaptiveTyping()
    const execution = await executionPromise

    expect(automation.typeGrapheme.mock.calls).toEqual([['a'], ['b'], ['c']])
    expect(execution.effectiveMode).toBe('letter-by-letter')
  })

  it('types one grapheme at a time with automation in letter-by-letter mode', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboard()
    const automation = createAutomation()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.warmup()
    const text = 'A\u{1F44D}\u{1F3FD}B'
    await session.append(text)
    const executionPromise = session.finalize(text)
    await flushAdaptiveTyping()
    const execution = await executionPromise

    expect(automation.warmup).toHaveBeenCalledTimes(1)
    expect(automation.typeGrapheme.mock.calls).toEqual([['A'], ['\u{1F44D}\u{1F3FD}'], ['B']])
    expect(runShortcut).not.toHaveBeenCalled()
    expect(clipboard.writeNormal).toHaveBeenCalledWith(text)
    expect(execution).toEqual({
      requestedMode: 'letter-by-letter',
      effectiveMode: 'letter-by-letter',
      insertionMethod: 'enigo-letter',
      fallbackUsed: false,
    })
  })

  it('keeps letter-by-letter typing on separate timer ticks instead of burst-writing chunks', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboard()
    const automation = createAutomation()
    const timestamps: number[] = []
    automation.typeGrapheme.mockImplementation(() => {
      timestamps.push(performance.now())
    })

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.warmup()
    const text = 'abcdef'
    await session.append(text)
    const executionPromise = session.finalize(text)
    await flushAdaptiveTyping()
    await executionPromise

    expect(timestamps).toHaveLength(text.length)
    expect(new Set(timestamps).size).toBe(timestamps.length)
    expect(Math.min(...timestamps.slice(1).map((value, index) => value - timestamps[index]))).toBeGreaterThanOrEqual(7)
  })

  it('waits for the last typed grapheme to visually settle before finalizing', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboard()
    const automation = createAutomation()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.warmup()
    await session.append('a')

    let resolved = false
    const executionPromise = session.finalize('a').then((execution) => {
      resolved = true
      return execution
    })

    await vi.advanceTimersByTimeAsync(20)
    expect(automation.typeGrapheme).toHaveBeenCalledTimes(1)
    expect(resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(120)
    const execution = await executionPromise

    expect(resolved).toBe(true)
    expect(execution.effectiveMode).toBe('letter-by-letter')
  })

  it('falls back from letter-by-letter to all-at-once when automation is unsupported', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboard()
    const automation = createAutomation()
    automation.warmup.mockReturnValue(
      createEnvironment({
        platform: 'linux',
        sessionType: 'wayland',
        supportsLetterByLetter: false,
        reason: 'wayland_unsupported',
      }),
    )

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.warmup()
    await session.append('hello')
    const executionPromise = session.finalize('hello')
    await flushAdaptiveTyping()
    const execution = await executionPromise

    expect(automation.typeGrapheme).not.toHaveBeenCalled()
    expect(clipboard.writeNormal).toHaveBeenNthCalledWith(1, 'hello')
    expect(clipboard.writeNormal).toHaveBeenNthCalledWith(2, 'hello')
    expect(runShortcut).toHaveBeenCalledTimes(1)
    expect(execution).toEqual({
      requestedMode: 'letter-by-letter',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: true,
    })
  })

  it('falls back to all-at-once when a grapheme write fails', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboard()
    const automation = createAutomation()
    const { AutomationServiceError } = await import('../automation/automationService.js')
    automation.typeGrapheme.mockImplementationOnce(() => {
      throw new AutomationServiceError('no focus', 'focus_lost')
    })

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.warmup()
    await session.append('AB')
    const executionPromise = session.finalize('AB')
    await flushAdaptiveTyping()
    const execution = await executionPromise

    expect(automation.typeGrapheme).toHaveBeenCalledTimes(1)
    expect(runShortcut).toHaveBeenCalledTimes(1)
    expect(clipboard.writeNormal).toHaveBeenNthCalledWith(1, 'AB')
    expect(clipboard.writeNormal).toHaveBeenNthCalledWith(2, 'AB')
    expect(execution).toEqual({
      requestedMode: 'letter-by-letter',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: true,
    })
  })

  it('replaces line breaks with spaces before inserting text', async () => {
    vi.useFakeTimers()
    const clipboard = createClipboard()
    const automation = createAutomation()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('letter-by-letter')

    await session.warmup()
    await session.append('oi\n')
    await session.append('mundo')
    const executionPromise = session.finalize('oi\nmundo')
    await flushAdaptiveTyping()
    const execution = await executionPromise

    expect(automation.typeGrapheme.mock.calls).toEqual([
      ['o'],
      ['i'],
      [' '],
      ['m'],
      ['u'],
      ['n'],
      ['d'],
      ['o'],
    ])
    expect(clipboard.writeNormal).toHaveBeenCalledWith('oi mundo')
    expect(execution.effectiveMode).toBe('letter-by-letter')
  })

  it('uses clipboard plus paste for all-at-once mode', async () => {
    const clipboard = createClipboard()
    const automation = createAutomation()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('all-at-once')

    await session.append('hello\n')
    await session.append('world')
    const execution = await session.finalize('hello\nworld')

    expect(automation.typeGrapheme).not.toHaveBeenCalled()
    expect(clipboard.writeNormal).toHaveBeenNthCalledWith(1, 'hello world')
    expect(clipboard.writeNormal).toHaveBeenNthCalledWith(2, 'hello world')
    expect(runShortcut).toHaveBeenCalledTimes(1)
    expect(execution).toEqual({
      requestedMode: 'all-at-once',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: false,
    })
  })

  it('copies recovery text to the clipboard on failure salvage', async () => {
    const clipboard = createClipboard()
    const automation = createAutomation()

    const { InsertionEngine } = await import('./insertionEngine.js')
    const engine = new InsertionEngine(clipboard as never, automation as never)
    const session = engine.createProgressiveSession('all-at-once')

    await session.recoverToClipboard('failed insertion text')

    expect(clipboard.writeNormal).toHaveBeenCalledWith('failed insertion text')
    expect(runShortcut).not.toHaveBeenCalled()
  })
})
