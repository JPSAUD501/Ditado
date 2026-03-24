import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { emptyContextSnapshot } from '../../../shared/defaults.js'
import type { ContextSnapshot } from '../../../shared/contracts.js'
import { createId, wait } from '../../../shared/utils.js'
import type { ClipboardService } from '../clipboard/clipboardService.js'

const execFileAsync = promisify(execFile)
let xdotoolAvailablePromise: Promise<boolean> | null = null

interface ActiveWindowResult {
  owner?: { name?: string }
  title?: string
}

type ShortcutAction = 'copy' | 'paste'

interface ShortcutCommand {
  file: string
  args: string[]
}

interface ShortcutUnavailableReason {
  code: 'unsupported_platform' | 'unsupported_session' | 'missing_dependency'
  message: string
}

const getLinuxSessionType = (): string | null => {
  const reportedSession = process.env.XDG_SESSION_TYPE?.trim().toLowerCase()
  if (reportedSession) {
    return reportedSession
  }

  if (process.env.WAYLAND_DISPLAY) {
    return 'wayland'
  }

  if (process.env.DISPLAY) {
    return 'x11'
  }

  return null
}

const hasXdotool = async (): Promise<boolean> => {
  if (!xdotoolAvailablePromise) {
    xdotoolAvailablePromise = execFileAsync('xdotool', ['--version'])
      .then(() => true)
      .catch(() => false)
  }

  return xdotoolAvailablePromise
}

const getLinuxShortcutUnsupportedReason = async (): Promise<ShortcutUnavailableReason | null> => {
  const sessionType = getLinuxSessionType()
  if (sessionType === 'wayland') {
    return {
      code: 'unsupported_session',
      message:
        'Ditado cannot send text into other apps on Linux Wayland. Use an X11 session (Ubuntu on Xorg) to enable external text insertion.',
    }
  }

  if (!(await hasXdotool())) {
    return {
      code: 'missing_dependency',
      message:
        'Ditado requires xdotool on Linux/X11 to copy or paste text into other apps. Install it with: sudo apt install xdotool',
    }
  }

  return null
}

const shortcutCommand = async (
  action: ShortcutAction,
): Promise<ShortcutCommand | ShortcutUnavailableReason> => {
  if (process.platform === 'win32') {
    const key = action === 'copy' ? '^c' : '^v'
    return {
      file: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `$wshell = New-Object -ComObject wscript.shell; Start-Sleep -Milliseconds 40; $wshell.SendKeys('${key}')`,
      ],
    }
  }

  if (process.platform === 'darwin') {
    const key = action === 'copy' ? 'c' : 'v'
    return {
      file: 'osascript',
      args: ['-e', `tell application "System Events" to keystroke "${key}" using command down`],
    }
  }

  if (process.platform === 'linux') {
    const unsupportedReason = await getLinuxShortcutUnsupportedReason()
    if (unsupportedReason) {
      return unsupportedReason
    }

    const key = action === 'copy' ? 'ctrl+c' : 'ctrl+v'
    return {
      file: 'xdotool',
      args: ['key', '--clearmodifiers', key],
    }
  }

  return {
    code: 'unsupported_platform',
    message: `Ditado does not support synthetic ${action} shortcuts on ${process.platform}.`,
  }
}

const isShortcutUnavailableReason = (
  value: ShortcutCommand | ShortcutUnavailableReason,
): value is ShortcutUnavailableReason => (
  'code' in value && 'message' in value
)

const getExecErrorDetail = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : null
  }

  if ('stderr' in error) {
    if (typeof error.stderr === 'string' && error.stderr.trim()) {
      return error.stderr.trim()
    }

    if (Buffer.isBuffer(error.stderr) && error.stderr.length > 0) {
      return error.stderr.toString('utf8').trim()
    }
  }

  return error instanceof Error ? error.message : null
}

const formatShortcutExecutionError = (action: ShortcutAction, error: unknown): string => {
  const actionLabel = action === 'copy' ? 'copy the current selection' : 'paste the clipboard contents'
  const detail = getExecErrorDetail(error)

  if (process.platform === 'linux') {
    const detailSuffix = detail ? ` Details: ${detail}` : ''
    return `Ditado failed to ${actionLabel} on Linux/X11 via xdotool. This usually means xdotool could not access the active display.${detailSuffix}`
  }

  if (detail) {
    return `Failed to ${actionLabel}. ${detail}`
  }

  return `Failed to ${actionLabel}.`
}

export const runShortcutOrThrow = async (action: ShortcutAction): Promise<void> => {
  const resolved = await shortcutCommand(action)
  if (isShortcutUnavailableReason(resolved)) {
    throw new Error(resolved.message)
  }

  try {
    await execFileAsync(resolved.file, resolved.args)
  } catch (error) {
    throw new Error(formatShortcutExecutionError(action, error))
  }
}

export const runShortcut = async (action: ShortcutAction): Promise<boolean> => {
  try {
    await runShortcutOrThrow(action)
    return true
  } catch {
    return false
  }
}

const loadActiveWindow = async (): Promise<ActiveWindowResult | null> => {
  try {
    const activeWin = (await import('active-win')) as {
      activeWindow?: () => Promise<unknown>
      default?: () => Promise<unknown>
    }
    const loadWindow =
      typeof activeWin.activeWindow === 'function'
        ? activeWin.activeWindow
        : typeof activeWin.default === 'function'
          ? activeWin.default
          : null

    if (!loadWindow) {
      return null
    }

    const info = await loadWindow()
    return (info as ActiveWindowResult | null) ?? null
  } catch {
    return null
  }
}

export class ActiveContextService {
  constructor(private readonly clipboardService: ClipboardService) {}

  async warmup(): Promise<void> {
    await loadActiveWindow()
  }

  async capture(sendContextAutomatically: boolean, includeSelection = true): Promise<ContextSnapshot> {
    const activeWindow = await loadActiveWindow()
    const base: ContextSnapshot = {
      ...emptyContextSnapshot,
      appName: activeWindow?.owner?.name || 'App',
      windowTitle: activeWindow?.title || null,
      capturedAt: new Date().toISOString(),
      permissionsGranted: process.platform !== 'darwin' || process.env.CI === 'true',
      confidence: activeWindow ? 'partial' : 'low',
    }

    if (!sendContextAutomatically || !includeSelection) {
      return base
    }

    const selection = await this.captureSelectedText()
    if (!selection) {
      return base
    }

    return {
      ...base,
      selectedText: selection,
      confidence: 'high',
    }
  }

  private async captureSelectedText(): Promise<string> {
    const sentinel = `__ditado_selection_${createId('capture')}__`
    const previousClipboard = await this.clipboardService.readCurrent()
    await this.clipboardService.writeNormal(sentinel)

    try {
      const copied = await runShortcut('copy')
      if (!copied) {
        return ''
      }

      await wait(140)
      const selectionSnapshot = await this.clipboardService.readCurrent()
      const selection = selectionSnapshot.text

      if (!selection || selection === sentinel || !selection.trim()) {
        return ''
      }

      return selection
    } finally {
      await this.clipboardService.restore(previousClipboard)
    }
  }
}
