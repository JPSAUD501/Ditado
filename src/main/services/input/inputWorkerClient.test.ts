import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.fn()
const existsSync = vi.fn(() => true)

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => 'C:\\Users\\joao.cardoso\\GitHub\\Ditado',
  },
}))

vi.mock('node:fs', () => ({
  existsSync,
  default: {
    existsSync,
  },
}))

vi.mock('node:child_process', () => ({
  spawn,
  default: {
    spawn,
  },
}))

const createSpawnedWorker = () => {
  const stdout = new EventEmitter() as EventEmitter & { setEncoding: (encoding: string) => void }
  const stderr = new EventEmitter() as EventEmitter & { setEncoding: (encoding: string) => void }
  stdout.setEncoding = vi.fn()
  stderr.setEncoding = vi.fn()

  const stdin = {
    destroyed: false,
    setDefaultEncoding: vi.fn(),
    write: vi.fn((chunk: string, _encoding: BufferEncoding, callback?: (error?: Error | null) => void) => {
      const lines = chunk.split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        const payload = JSON.parse(line) as {
          id: string
          type: 'warmup' | 'sendTextUnicode' | 'ping' | 'shutdown'
          text?: string
          expectedWindowHandle?: string
        }

        if (payload.type === 'warmup') {
          stdout.emit(
            'data',
            `${JSON.stringify({ id: payload.id, ok: true, foregroundWindowHandle: '100' })}\n`,
          )
          continue
        }

        if (payload.type === 'sendTextUnicode') {
          if (payload.expectedWindowHandle === 'focus-changed') {
            stdout.emit(
              'data',
              `${JSON.stringify({ id: payload.id, ok: false, error: 'Focus changed.', errorCode: 'focus_changed' })}\n`,
            )
          } else {
            stdout.emit('data', `${JSON.stringify({ id: payload.id, ok: true })}\n`)
          }
          continue
        }

        stdout.emit('data', `${JSON.stringify({ id: payload.id, ok: true, type: payload.type })}\n`)
      }

      callback?.(null)
      return true
    }),
  }

  const child = new EventEmitter() as EventEmitter & {
    stdin: typeof stdin
    stdout: typeof stdout
    stderr: typeof stderr
    exitCode: number | null
    killed: boolean
    kill: () => boolean
  }

  child.stdin = stdin
  child.stdout = stdout
  child.stderr = stderr
  child.exitCode = null
  child.killed = false
  child.kill = vi.fn(() => {
    child.killed = true
    child.exitCode = 0
    return true
  })

  queueMicrotask(() => {
    stdout.emit('data', `${JSON.stringify({ type: 'ready', ok: true })}\n`)
  })

  return child
}

describe('InputWorkerClient', () => {
  beforeEach(() => {
    spawn.mockReset()
    existsSync.mockReset()
    existsSync.mockReturnValue(true)
    spawn.mockImplementation(() => createSpawnedWorker())
  })

  it('starts one helper process and reuses it for warmup and unicode sends', async () => {
    const { InputWorkerClient } = await import('./inputWorkerClient.js')
    const client = new InputWorkerClient('C:\\worker\\Ditado.InputWorker.exe')

    const warmup = await client.warmup()
    await client.sendTextUnicode('á', warmup.foregroundWindowHandle)
    await client.sendTextUnicode('👍🏽', warmup.foregroundWindowHandle)
    await client.dispose()

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(warmup.foregroundWindowHandle).toBe('100')
  })

  it('maps focus_changed responses to InputWorkerFocusChangedError', async () => {
    const { InputWorkerClient, InputWorkerFocusChangedError } = await import('./inputWorkerClient.js')
    const client = new InputWorkerClient('C:\\worker\\Ditado.InputWorker.exe')

    await client.warmup()

    await expect(client.sendTextUnicode('a', 'focus-changed')).rejects.toBeInstanceOf(
      InputWorkerFocusChangedError,
    )
  })

  it('fails clearly when the helper executable is missing', async () => {
    existsSync.mockReturnValue(false)
    const { InputWorkerClient, InputWorkerError } = await import('./inputWorkerClient.js')
    const client = new InputWorkerClient('C:\\worker\\missing.exe')

    await expect(client.warmup()).rejects.toBeInstanceOf(InputWorkerError)
  })
})
