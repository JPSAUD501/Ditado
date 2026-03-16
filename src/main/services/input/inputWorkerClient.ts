import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

interface InputWorkerResponse {
  id?: string
  type?: string
  ok?: boolean
  error?: string
  errorCode?: string
  foregroundWindowHandle?: string
}

interface InputWorkerWarmupResult {
  foregroundWindowHandle: string
}

const REQUEST_TIMEOUT_MS = 2_500
const START_TIMEOUT_MS = 4_000

export class InputWorkerError extends Error {
  constructor(message: string, readonly code: string = 'input_worker_error') {
    super(message)
    this.name = 'InputWorkerError'
  }
}

export class InputWorkerFocusChangedError extends InputWorkerError {
  constructor(message = 'Foreground window changed during SendInput.') {
    super(message, 'focus_changed')
    this.name = 'InputWorkerFocusChangedError'
  }
}

const resolveHelperPath = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'helpers', 'Ditado.InputWorker.exe')
  }

  return join(app.getAppPath(), 'dist-electron', 'helpers', 'Ditado.InputWorker.exe')
}

const createWorkerError = (message: string, code?: string): InputWorkerError => {
  if (code === 'focus_changed') {
    return new InputWorkerFocusChangedError(message)
  }

  return new InputWorkerError(message, code ?? 'input_worker_error')
}

export class InputWorkerClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private readyPromise: Promise<void> | null = null
  private requestChain = Promise.resolve()
  private readonly helperPath: string
  private nextRequestId = 0
  private stdoutBuffer = ''
  private stderrTail = ''
  private pending = new Map<
    string,
    {
      resolve: (response: InputWorkerResponse) => void
      reject: (error: Error) => void
      timeout: NodeJS.Timeout
    }
  >()
  private disposed = false

  constructor(helperPath = resolveHelperPath()) {
    this.helperPath = helperPath
  }

  async warmup(): Promise<InputWorkerWarmupResult> {
    await this.ensureStarted()
    const response = await this.sendMessage({ type: 'warmup' })
    return {
      foregroundWindowHandle: response.foregroundWindowHandle ?? '',
    }
  }

  async ping(): Promise<void> {
    await this.ensureStarted()
    await this.sendMessage({ type: 'ping' })
  }

  async sendTextUnicode(text: string, expectedWindowHandle: string): Promise<void> {
    this.requestChain = this.requestChain.then(async () => {
      await this.ensureStarted()
      await this.sendMessage({
        type: 'sendTextUnicode',
        text,
        expectedWindowHandle,
      })
    })

    return this.requestChain
  }

  async dispose(): Promise<void> {
    this.disposed = true
    try {
      await this.requestChain.catch(() => undefined)
      if (this.child && this.child.exitCode === null && !this.child.killed) {
        await this.sendMessage({ type: 'shutdown' }).catch(() => undefined)
      }
    } finally {
      if (this.child && this.child.exitCode === null && !this.child.killed) {
        this.child.kill()
      }
      this.child = null
      this.readyPromise = null
      this.rejectPending(new InputWorkerError('Input worker disposed.', 'disposed'))
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.disposed) {
      throw new InputWorkerError('Input worker client already disposed.', 'disposed')
    }

    if (this.child && this.child.exitCode === null && this.readyPromise) {
      return this.readyPromise
    }

    if (!existsSync(this.helperPath)) {
      throw new InputWorkerError(`Input worker executable not found at ${this.helperPath}.`, 'missing_worker')
    }

    const child = spawn(this.helperPath, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child = child
    child.stdin.setDefaultEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const startTimeout = setTimeout(() => {
        reject(new InputWorkerError('Timed out while starting input worker.', 'start_timeout'))
      }, START_TIMEOUT_MS)

      const fail = (error: Error): void => {
        clearTimeout(startTimeout)
        reject(error)
      }

      child.stdout.on('data', (chunk: string) => {
        this.stdoutBuffer += chunk
        const lines = this.stdoutBuffer.split(/\r?\n/)
        this.stdoutBuffer = lines.pop() ?? ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) {
            continue
          }

          let response: InputWorkerResponse
          try {
            response = JSON.parse(line) as InputWorkerResponse
          } catch {
            continue
          }

          if (response.type === 'ready' && response.ok) {
            clearTimeout(startTimeout)
            resolve()
            continue
          }

          if (!response.id) {
            continue
          }

          const pending = this.pending.get(response.id)
          if (!pending) {
            continue
          }

          clearTimeout(pending.timeout)
          this.pending.delete(response.id)

          if (response.ok) {
            pending.resolve(response)
            continue
          }

          pending.reject(
            createWorkerError(response.error || 'Input worker returned an error.', response.errorCode),
          )
        }
      })

      child.stderr.on('data', (chunk: string) => {
        this.stderrTail = `${this.stderrTail}${chunk}`.slice(-2_000)
      })

      child.once('error', (error) => {
        fail(
          new InputWorkerError(
            error.message || 'Failed to start input worker.',
            'spawn_failed',
          ),
        )
      })

      child.once('exit', (code, signal) => {
        const error = new InputWorkerError(
          `Input worker exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}). ${this.stderrTail}`.trim(),
          'unexpected_exit',
        )
        this.child = null
        this.readyPromise = null
        this.rejectPending(error)
        fail(error)
      })
    })

    return this.readyPromise
  }

  private async sendMessage(payload: Record<string, string>): Promise<InputWorkerResponse> {
    const child = this.child
    if (!child || child.stdin.destroyed) {
      throw new InputWorkerError('Input worker is unavailable.', 'unavailable')
    }

    const id = `request_${++this.nextRequestId}`

    return new Promise<InputWorkerResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new InputWorkerError('Input worker request timed out.', 'request_timeout'))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, { resolve, reject, timeout })

      child.stdin.write(`${JSON.stringify({ ...payload, id })}\n`, 'utf8', (error) => {
        if (!error) {
          return
        }

        const pending = this.pending.get(id)
        if (!pending) {
          return
        }

        clearTimeout(pending.timeout)
        this.pending.delete(id)
        pending.reject(
          new InputWorkerError(
            error.message || 'Failed to send request to input worker.',
            'write_failed',
          ),
        )
      })
    })
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
      this.pending.delete(id)
    }
  }
}
