import { clipboard } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { wait } from '../../../shared/utils.js'

export type ClipboardMode = 'normal' | 'protected'

export interface ClipboardSnapshot {
  text: string
}

export interface ClipboardWriterSession {
  warmup(): Promise<void>
  writeProtected(text: string): Promise<void>
  dispose(): Promise<void>
}

interface WriterResponse {
  id?: string
  type?: string
  ok?: boolean
  error?: string
}

const WINDOWS_PROTECTED_CLIPBOARD_SETTLE_MS = 6
const WRITER_REQUEST_TIMEOUT_MS = 4_000
const WRITER_DISPOSE_TIMEOUT_MS = 500

export class ProtectedClipboardUnavailableError extends Error {
  constructor(message = 'Protected clipboard unavailable on this system.') {
    super(message)
    this.name = 'ProtectedClipboardUnavailableError'
  }
}

const toEncodedPowerShellCommand = (script: string): string =>
  Buffer.from(script, 'utf16le').toString('base64')

const createWriterScript = (): string => `
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName Windows.ApplicationModel

function Send-Result([object]$payload) {
  $json = $payload | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

Send-Result @{ type = 'ready'; ok = $true }

while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ([string]::IsNullOrWhiteSpace($line)) {
    continue
  }

  try {
    $payload = $line | ConvertFrom-Json

    if ($payload.type -eq 'shutdown') {
      Send-Result @{ id = $payload.id; ok = $true; type = 'shutdown' }
      break
    }

    if ($payload.type -ne 'writeProtected') {
      throw "Unsupported message type: $($payload.type)"
    }

    $bytes = [System.Convert]::FromBase64String([string]$payload.textBase64)
    $text = [System.Text.UTF8Encoding]::new($false).GetString($bytes)
    $dataPackage = [Windows.ApplicationModel.DataTransfer.DataPackage,Windows.ApplicationModel,ContentType=WindowsRuntime]::new()
    $dataPackage.SetText($text)
    $options = [Windows.ApplicationModel.DataTransfer.ClipboardContentOptions,Windows.ApplicationModel,ContentType=WindowsRuntime]::new()
    $options.IsAllowedInHistory = $false
    $options.IsRoamable = $false

    $success = $false
    for ($attempt = 0; $attempt -lt 5 -and -not $success; $attempt++) {
      $success = [Windows.ApplicationModel.DataTransfer.Clipboard,Windows.ApplicationModel,ContentType=WindowsRuntime]::SetContentWithOptions($dataPackage, $options)
      if (-not $success) {
        Start-Sleep -Milliseconds 25
      }
    }

    if (-not $success) {
      throw 'Clipboard.SetContentWithOptions returned false.'
    }

    [Windows.ApplicationModel.DataTransfer.Clipboard,Windows.ApplicationModel,ContentType=WindowsRuntime]::Flush()
    Send-Result @{ id = $payload.id; ok = $true }
  } catch {
    Send-Result @{ id = $payload.id; ok = $false; error = $_.Exception.Message }
  }
}
`

class DirectClipboardWriterSession implements ClipboardWriterSession {
  async warmup(): Promise<void> {
    return undefined
  }

  async writeProtected(text: string): Promise<void> {
    clipboard.writeText(text)
  }

  async dispose(): Promise<void> {
    return undefined
  }
}

class WindowsClipboardWriterSession implements ClipboardWriterSession {
  private child: ChildProcessWithoutNullStreams | null = null
  private readyPromise: Promise<void> | null = null
  private requestChain = Promise.resolve()
  private pending = new Map<
    string,
    {
      resolve: () => void
      reject: (error: Error) => void
      timeout: NodeJS.Timeout
    }
  >()
  private nextRequestId = 0
  private disposed = false
  private stderrTail = ''
  private stdoutBuffer = ''
  private lastFailure: Error | null = null

  async warmup(): Promise<void> {
    await this.ensureStarted()
  }

  async writeProtected(text: string): Promise<void> {
    if (this.disposed) {
      throw new ProtectedClipboardUnavailableError('Protected clipboard writer session already disposed.')
    }

    this.requestChain = this.requestChain.then(async () => {
      await this.ensureStarted()
      await this.sendMessage({
        type: 'writeProtected',
        textBase64: Buffer.from(text, 'utf8').toString('base64'),
      })
      await wait(WINDOWS_PROTECTED_CLIPBOARD_SETTLE_MS)
    })

    return this.requestChain
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true

    try {
      await this.requestChain.catch(() => undefined)
      if (this.child && this.child.exitCode === null && !this.child.killed) {
        await Promise.race([
          this.sendMessage({ type: 'shutdown' }).catch(() => undefined),
          wait(WRITER_DISPOSE_TIMEOUT_MS),
        ])
      }
    } finally {
      if (this.child && this.child.exitCode === null && !this.child.killed) {
        this.child.kill()
      }
      this.child = null
      this.rejectPending(new ProtectedClipboardUnavailableError('Protected clipboard writer session disposed.'))
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.lastFailure) {
      throw this.lastFailure
    }

    if (this.readyPromise) {
      return this.readyPromise
    }

    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-EncodedCommand',
        toEncodedPowerShellCommand(createWriterScript()),
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    this.child = child
    child.stdin.setDefaultEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => {
        this.lastFailure = error
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

          let message: WriterResponse
          try {
            message = JSON.parse(line) as WriterResponse
          } catch {
            continue
          }

          if (message.type === 'ready' && message.ok) {
            resolve()
            continue
          }

          if (!message.id) {
            continue
          }

          const pending = this.pending.get(message.id)
          if (!pending) {
            continue
          }

          clearTimeout(pending.timeout)
          this.pending.delete(message.id)

          if (message.ok) {
            pending.resolve()
            continue
          }

          pending.reject(
            new ProtectedClipboardUnavailableError(
              message.error || 'Protected clipboard writer returned an error.',
            ),
          )
        }
      })

      child.stderr.on('data', (chunk: string) => {
        this.stderrTail = `${this.stderrTail}${chunk}`.slice(-2_000)
      })

      child.once('error', (error) => {
        fail(
          new ProtectedClipboardUnavailableError(
            error.message || 'Failed to start protected clipboard writer.',
          ),
        )
      })

      child.once('exit', (code, signal) => {
        const error = new ProtectedClipboardUnavailableError(
          `Protected clipboard writer exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}). ${this.stderrTail}`.trim(),
        )
        this.lastFailure = error
        this.rejectPending(error)
        if (this.readyPromise) {
          fail(error)
        }
      })
    })

    return this.readyPromise
  }

  private async sendMessage(payload: Record<string, string>): Promise<void> {
    const child = this.child
    if (!child || child.stdin.destroyed) {
      throw this.lastFailure ?? new ProtectedClipboardUnavailableError('Protected clipboard writer is unavailable.')
    }

    const id = `request_${++this.nextRequestId}`

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new ProtectedClipboardUnavailableError('Protected clipboard writer timed out.'))
      }, WRITER_REQUEST_TIMEOUT_MS)

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
          new ProtectedClipboardUnavailableError(
            error.message || 'Failed to send request to protected clipboard writer.',
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

export class ClipboardService {
  createWriterSession(): ClipboardWriterSession {
    if (process.platform !== 'win32') {
      return new DirectClipboardWriterSession()
    }

    return new WindowsClipboardWriterSession()
  }

  async readCurrent(): Promise<ClipboardSnapshot> {
    return {
      text: clipboard.readText(),
    }
  }

  async writeNormal(text: string): Promise<void> {
    clipboard.writeText(text)
  }

  async writeProtected(text: string, writerSession?: ClipboardWriterSession): Promise<void> {
    if (process.platform !== 'win32') {
      await this.writeNormal(text)
      return
    }

    if (writerSession) {
      await writerSession.writeProtected(text)
      return
    }

    const transientWriter = this.createWriterSession()
    try {
      await transientWriter.warmup()
      await transientWriter.writeProtected(text)
    } finally {
      await transientWriter.dispose()
    }
  }

  async restore(
    snapshot: ClipboardSnapshot,
    mode: ClipboardMode,
    writerSession?: ClipboardWriterSession,
  ): Promise<void> {
    if (mode === 'protected') {
      await this.writeProtected(snapshot.text, writerSession)
      return
    }

    await this.writeNormal(snapshot.text)
  }
}
