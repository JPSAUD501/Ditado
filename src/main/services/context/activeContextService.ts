import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { emptyContextSnapshot } from '../../../shared/defaults.js'
import type { ContextSnapshot } from '../../../shared/contracts.js'
import { createId, wait } from '../../../shared/utils.js'
import type { ClipboardService } from '../clipboard/clipboardService.js'

const execFileAsync = promisify(execFile)

interface ActiveWindowResult {
  owner?: { name?: string }
  title?: string
}

const shortcutCommand = (action: 'copy' | 'paste'): { file: string; args: string[] } | null => {
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
    const key = action === 'copy' ? 'ctrl+c' : 'ctrl+v'
    return {
      file: 'bash',
      args: ['-lc', `command -v xdotool >/dev/null 2>&1 && xdotool key --clearmodifiers ${key}`],
    }
  }

  return null
}

export const runShortcut = async (action: 'copy' | 'paste'): Promise<boolean> => {
  const command = shortcutCommand(action)
  if (!command) {
    return false
  }

  try {
    await execFileAsync(command.file, command.args)
    return true
  } catch {
    return false
  }
}

const loadActiveWindow = async (): Promise<ActiveWindowResult | null> => {
  try {
    const activeWin = await import('active-win')
    const info = await activeWin.default()
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

      if (!selection || selection === sentinel) {
        return ''
      }

      return selection
    } finally {
      await this.clipboardService.restore(previousClipboard)
    }
  }
}
