import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clipboardState = {
  text: '',
}

const spawn = vi.fn()

vi.mock('electron', () => ({
  clipboard: {
    readText: vi.fn(() => clipboardState.text),
    writeText: vi.fn((value: string) => {
      clipboardState.text = value
    }),
  },
}))

vi.mock('node:child_process', () => ({
  spawn,
  default: {
    spawn,
  },
}))

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

const createSpawnedWriter = () => {
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
          type: 'writeProtected' | 'shutdown'
          textBase64?: string
        }
        if (payload.type === 'writeProtected') {
          clipboardState.text = Buffer.from(payload.textBase64 ?? '', 'base64').toString('utf8')
          stdout.emit('data', `${JSON.stringify({ id: payload.id, ok: true })}\n`)
        } else {
          stdout.emit('data', `${JSON.stringify({ id: payload.id, ok: true, type: 'shutdown' })}\n`)
        }
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

describe('ClipboardService', () => {
  beforeEach(() => {
    clipboardState.text = 'original'
    spawn.mockReset()
    spawn.mockImplementation(() => createSpawnedWriter())
  })

  it('starts one PowerShell writer session and accepts multiple protected writes over stdin on Windows', async () => {
    setPlatform('win32')
    const { ClipboardService } = await import('./clipboardService.js')
    const service = new ClipboardService()
    const session = service.createWriterSession()

    await session.warmup()
    await session.writeProtected('primeiro texto')
    await session.writeProtected('segundo texto')
    await session.dispose()

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(clipboardState.text).toBe('segundo texto')
    const args = spawn.mock.calls[0]?.[1] as string[]
    const encodedCommand = args[args.indexOf('-EncodedCommand') + 1]
    const decodedCommand = Buffer.from(encodedCommand, 'base64').toString('utf16le')
    expect(decodedCommand).toContain('[Console]::In.ReadLine()')
    expect(decodedCommand).toContain('FromBase64String')
  })

  it('throws when the writer returns an explicit error', async () => {
    setPlatform('win32')
    spawn.mockImplementation(() => {
      const child = createSpawnedWriter()
      child.stdin.write = vi.fn((chunk: string, _encoding: BufferEncoding, callback?: (error?: Error | null) => void) => {
        const lines = chunk.split(/\r?\n/).filter(Boolean)
        for (const line of lines) {
          const payload = JSON.parse(line) as { id: string; type: string }
          if (payload.type === 'shutdown') {
            child.stdout.emit('data', `${JSON.stringify({ id: payload.id, ok: true, type: 'shutdown' })}\n`)
          } else {
            child.stdout.emit(
              'data',
              `${JSON.stringify({ id: payload.id, ok: false, error: 'writer failed' })}\n`,
            )
          }
        }
        callback?.(null)
        return true
      })
      return child
    })

    const { ClipboardService, ProtectedClipboardUnavailableError } = await import('./clipboardService.js')
    const service = new ClipboardService()
    const session = service.createWriterSession()

    await session.warmup()
    await expect(session.writeProtected('streamed text')).rejects.toBeInstanceOf(ProtectedClipboardUnavailableError)
  })

  it('restores snapshots with the requested mode', async () => {
    setPlatform('win32')
    const { ClipboardService } = await import('./clipboardService.js')
    const service = new ClipboardService()

    await service.restore({ text: 'restored' }, 'normal')

    expect(clipboardState.text).toBe('restored')
  })
})
