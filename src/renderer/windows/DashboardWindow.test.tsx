import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DashboardWindow } from './DashboardWindow'
import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import type { DashboardViewModel, Settings } from '@shared/contracts'

const createState = (settings: Settings = defaultSettings): DashboardViewModel => ({
  session: null,
  settings,
  history: [],
  telemetryTail: [],
  permissions: defaultPermissionState,
  updateState: {
    enabled: true,
    channel: 'stable',
    lastCheckedAt: null,
    status: 'idle',
  },
})

const installDesktopApi = (
  initialSettings: Settings = defaultSettings,
  microphones: Array<{ deviceId: string; label: string; kind: 'audioinput' }> = [],
) => {
  let currentState = createState(initialSettings)
  const dashboardListeners = new Set<(state: DashboardViewModel) => void>()
  const notify = (): void => {
    for (const listener of dashboardListeners) {
      listener(currentState)
    }
  }

  const updateSettings = vi.fn(async (patch: Partial<Settings>) => {
    currentState = createState({ ...currentState.settings, ...patch })
    notify()
    return currentState.settings
  })

  const setApiKey = vi.fn(async (apiKey: string) => {
    currentState = createState({ ...currentState.settings, apiKeyPresent: Boolean(apiKey.trim()) })
    notify()
    return currentState.settings
  })

  const setHotkeyCaptureActive = vi.fn(async () => undefined)
  const listMicrophones = vi.fn(async () => microphones)

  window.ditado = {
    getOverlayState: vi.fn(async () => ({
      session: null,
      settings: currentState.settings,
      permissions: defaultPermissionState,
    })),
    getDashboardState: vi.fn(async () => currentState),
    subscribeOverlayState: vi.fn(() => () => undefined),
    subscribeDashboardState: vi.fn((listener: (state: DashboardViewModel) => void) => {
      dashboardListeners.add(listener)
      listener(currentState)
      return () => dashboardListeners.delete(listener)
    }),
    startPushToTalk: vi.fn(async () => undefined),
    stopPushToTalk: vi.fn(async () => undefined),
    toggleDictation: vi.fn(async () => undefined),
    cancelDictation: vi.fn(async () => undefined),
    notifyRecorderStarted: vi.fn(async () => undefined),
    updateSettings,
    setApiKey,
    setHotkeyCaptureActive,
    listMicrophones,
    requestMicrophoneAccess: vi.fn(async () => defaultPermissionState),
    getPermissions: vi.fn(async () => defaultPermissionState),
    openDashboardTab: vi.fn(async () => undefined),
    clearHistory: vi.fn(async () => undefined),
    getHistoryAudio: vi.fn(async () => null),
    getTelemetryTail: vi.fn(async () => []),
    checkForUpdates: vi.fn(async () => undefined),
  }

  return {
    updateSettings,
    setApiKey,
    setHotkeyCaptureActive,
    listMicrophones,
    publishState: (nextState: DashboardViewModel) => {
      currentState = nextState
      notify()
    },
  }
}

describe('DashboardWindow', () => {
  it('updates toggles immediately and persists the change through the desktop bridge', async () => {
    const { updateSettings } = installDesktopApi()
    render(<DashboardWindow initialTab="settings" />)

    const toggle = await screen.findByRole('button', { name: /send context automatically/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ sendContextAutomatically: false })
    })
  })

  it('captures a modifier-only hotkey, exits capture mode, and persists the normalized combo', async () => {
    const { updateSettings, setHotkeyCaptureActive } = installDesktopApi()
    render(<DashboardWindow initialTab="settings" />)

    const hotkeyButton = await screen.findByRole('button', { name: /toggle hotkey/i })
    await userEvent.click(hotkeyButton)

    fireEvent.keyDown(hotkeyButton, {
      key: 'Alt',
      ctrlKey: true,
      altKey: true,
    })

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ toggleHotkey: 'Ctrl+Alt' })
    })
    expect(setHotkeyCaptureActive).toHaveBeenNthCalledWith(1, true)
    expect(setHotkeyCaptureActive).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('button', { name: /toggle hotkey/i })).toHaveTextContent('Ctrl+Alt')
  })

  it('saves the API key and reflects the persisted state in the settings UI', async () => {
    const { setApiKey } = installDesktopApi()
    render(<DashboardWindow initialTab="settings" />)

    const input = await screen.findByPlaceholderText('sk-or-v1-...')
    await userEvent.type(input, 'sk-or-v1-demo')
    await userEvent.click(screen.getByRole('button', { name: /save key/i }))

    await waitFor(() => {
      expect(setApiKey).toHaveBeenCalledWith('sk-or-v1-demo')
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Saved key')).toHaveValue('')
    })
  })

  it('loads detected microphones into the selector', async () => {
    installDesktopApi(defaultSettings, [
      { deviceId: 'mic-1', label: 'USB Mic', kind: 'audioinput' },
      { deviceId: 'mic-2', label: 'Headset Mic', kind: 'audioinput' },
    ])
    render(<DashboardWindow initialTab="settings" />)

    expect(await screen.findByRole('option', { name: 'USB Mic' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Headset Mic' })).toBeInTheDocument()
  })

  it('persists the insertion reveal mode setting', async () => {
    const { updateSettings } = installDesktopApi()
    render(<DashboardWindow initialTab="settings" />)

    const select = await screen.findByRole('combobox', { name: /insertion reveal/i })
    fireEvent.change(select, { target: { value: 'letter-by-letter' } })

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ insertionStreamingMode: 'letter-by-letter' })
    })
  })

  it('renders the newest history entry immediately when the dashboard state updates', async () => {
    const { publishState } = installDesktopApi()
    render(<DashboardWindow initialTab="history" />)

    expect(await screen.findByText(/no entries yet/i)).toBeInTheDocument()

    await act(async () => {
      publishState({
        ...createState(),
        history: [
          {
            id: 'entry-1',
            createdAt: new Date().toISOString(),
            appName: 'VS Code',
            windowTitle: 'prompt.ts',
            activationMode: 'toggle',
            modelId: 'google/gemini-3-flash-preview',
            outputText: 'most recent output',
            audioFilePath: null,
            audioDurationMs: 0,
            audioMimeType: null,
            audioBytes: 0,
            submittedContext: null,
            usedContext: false,
            latencyMs: 120,
            insertionStrategy: 'insert-at-cursor',
          },
        ],
      })
      await Promise.resolve()
    })

    expect(await screen.findByText('most recent output')).toBeInTheDocument()
    expect(screen.queryByText(/no entries yet/i)).toBeNull()
  })
})
