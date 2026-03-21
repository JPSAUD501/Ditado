import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DashboardWindow } from './DashboardWindow'
import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import { historyEntrySchema, type DashboardViewModel, type Settings } from '@shared/contracts'

const onboardedSettings: Settings = { ...defaultSettings, onboardingCompleted: true }

const createState = (settings: Settings = onboardedSettings): DashboardViewModel => ({
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
    downloadProgress: null,
  },
  appVersion: '0.0.0-test',
})

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const installDesktopApi = (
  initialSettings: Settings = onboardedSettings,
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
    subscribeDashboardTabRequests: vi.fn(() => () => undefined),
    startPushToTalk: vi.fn(async () => undefined),
    stopPushToTalk: vi.fn(async () => undefined),
    toggleDictation: vi.fn(async () => undefined),
    cancelDictation: vi.fn(async () => undefined),
    notifyRecorderStarted: vi.fn(async () => undefined),
    notifyRecorderFailed: vi.fn(async () => undefined),
    notifyRecorderReady: vi.fn(async () => undefined),
    notifyRecorderWarmupFinished: vi.fn(async () => undefined),
    updateSettings,
    setApiKey,
    setHotkeyCaptureActive,
    listMicrophones,
    requestMicrophoneAccess: vi.fn(async () => defaultPermissionState),
    getPermissions: vi.fn(async () => defaultPermissionState),
    openDashboardTab: vi.fn(async () => undefined),
    clearHistory: vi.fn(async () => undefined),
    deleteHistoryEntry: vi.fn(async () => undefined),
    getHistoryAudio: vi.fn(async () => null),
    getTelemetryTail: vi.fn(async () => []),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    openExternalUrl: vi.fn(async () => undefined),
    getShortcutStatus: vi.fn(async () => ({ captureActive: false, uiohookRunning: true })),
    sendAudioLevel: vi.fn(),
    subscribeAudioLevel: vi.fn(() => () => undefined),
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
  it('opens the onboarding wizard when launch requests onboarding and setup is still incomplete', async () => {
    const { updateSettings } = installDesktopApi({
      ...defaultSettings,
      apiKeyPresent: true,
      onboardingCompleted: false,
    })

    render(<DashboardWindow initialTab="onboarding" />)

    expect(await screen.findByText(/meet ditado/i)).toBeInTheDocument()
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('keeps the settings screen available when onboarding is done but the API key is missing', async () => {
    installDesktopApi({
      ...defaultSettings,
      onboardingCompleted: true,
      apiKeyPresent: false,
    })

    render(<DashboardWindow initialTab="settings" />)

    expect(await screen.findByRole('textbox', { name: /model id/i })).toBeInTheDocument()
    expect(screen.queryByText(/connect api/i)).toBeNull()
  })

  it('reopens onboarding when the current version requires upgrade onboarding', async () => {
    installDesktopApi({
      ...defaultSettings,
      onboardingCompleted: true,
      apiKeyPresent: true,
      pendingUpgradeOnboardingVersion: '0.0.0-test',
    })

    render(<DashboardWindow initialTab="overview" />)

    expect(await screen.findByText(/meet ditado/i)).toBeInTheDocument()
    expect(screen.getByText(/default shortcut changed in this version/i)).toBeInTheDocument()
  })

  it('shows the microphone step before the API key step in onboarding', async () => {
    installDesktopApi({
      ...defaultSettings,
      onboardingCompleted: false,
      apiKeyPresent: true,
    })

    const { container } = render(<DashboardWindow initialTab="onboarding" />)

    expect(await screen.findByText(/meet ditado/i)).toBeInTheDocument()

    const clickContinue = async () => {
      const button = container.querySelector('.wizard-actions .button-primary')
      expect(button).not.toBeNull()
      await userEvent.click(button as HTMLButtonElement)
    }

    await clickContinue()
    await clickContinue()
    await clickContinue()

    expect(await screen.findByText(/test your microphone/i)).toBeInTheDocument()
    expect(screen.queryByText(/connect your api/i)).toBeNull()

    await clickContinue()

    expect(await screen.findByText(/connect your api/i)).toBeInTheDocument()
  })

  it('renders the sidebar tabs in overview, history, settings order', async () => {
    installDesktopApi()
    render(<DashboardWindow initialTab="overview" />)

    const navButtons = await screen.findAllByRole('button')
    const sidebarButtons = navButtons.filter((button) => {
      const label = button.getAttribute('aria-label')?.toLowerCase() ?? ''
      return label === 'overview' || label === 'history' || label === 'settings'
    })

    expect(sidebarButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Overview',
      'History',
      'Settings',
    ])
  })

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

  it('switches the update channel to beta from the settings toggle', async () => {
    const { updateSettings } = installDesktopApi()
    render(<DashboardWindow initialTab="settings" />)

    const toggle = await screen.findByRole('button', { name: /beta channel/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ updateChannel: 'beta' })
    })
  })

  it('keeps newer optimistic settings applied while an older save is still resolving', async () => {
    installDesktopApi()
    const firstSave = createDeferred<Settings>()
    const secondSave = createDeferred<Settings>()
    const updateSettings = vi.fn((patch: Partial<Settings>) => {
      if ('sendContextAutomatically' in patch) {
        return firstSave.promise
      }
      if ('launchOnLogin' in patch) {
        return secondSave.promise
      }
      return Promise.resolve(onboardedSettings)
    })
    window.ditado.updateSettings = updateSettings

    render(<DashboardWindow initialTab="settings" />)

    const sendContextToggle = await screen.findByRole('button', { name: /send context automatically/i })
    const launchOnLoginToggle = screen.getByRole('button', { name: /launch on login/i })

    await userEvent.click(sendContextToggle)
    await userEvent.click(launchOnLoginToggle)

    expect(sendContextToggle).toHaveAttribute('aria-pressed', 'false')
    expect(launchOnLoginToggle).toHaveAttribute('aria-pressed', 'false')

    await act(async () => {
      firstSave.resolve({ ...onboardedSettings, sendContextAutomatically: false })
      await firstSave.promise
      await Promise.resolve()
    })

    expect(sendContextToggle).toHaveAttribute('aria-pressed', 'false')
    expect(launchOnLoginToggle).toHaveAttribute('aria-pressed', 'false')

    await act(async () => {
      secondSave.resolve({
        ...onboardedSettings,
        sendContextAutomatically: false,
        launchOnLogin: true,
      })
      await secondSave.promise
      await Promise.resolve()
    })

    expect(updateSettings).toHaveBeenNthCalledWith(1, { sendContextAutomatically: false })
    expect(updateSettings).toHaveBeenNthCalledWith(2, { launchOnLogin: false })
    expect(sendContextToggle).toHaveAttribute('aria-pressed', 'false')
    expect(launchOnLoginToggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('captures a modifier-only hotkey, exits capture mode, and persists the normalized combo', async () => {
    const { updateSettings, setHotkeyCaptureActive } = installDesktopApi()
    render(<DashboardWindow initialTab="settings" />)

    const hotkeyButton = await screen.findByRole('button', { name: /push-to-talk/i })
    await userEvent.click(hotkeyButton)

    fireEvent.keyDown(hotkeyButton, {
      key: 'Alt',
      ctrlKey: true,
      altKey: true,
    })

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ pushToTalkHotkey: 'Ctrl+Alt' })
    })
    expect(setHotkeyCaptureActive).toHaveBeenNthCalledWith(1, true)
    expect(setHotkeyCaptureActive).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('button', { name: /push-to-talk/i })).toHaveTextContent('Ctrl+Alt')
  })

  it('saves the API key and reflects the persisted state in the settings UI', async () => {
    const { setApiKey } = installDesktopApi()
    render(<DashboardWindow initialTab="settings" />)

    const input = await screen.findByPlaceholderText('sk-or-v1-...')
    await userEvent.type(input, 'sk-or-v1-demo')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(setApiKey).toHaveBeenCalledWith('sk-or-v1-demo')
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Key saved')).toHaveValue('')
    })
  })

  it('loads detected microphones into the selector', async () => {
    installDesktopApi(onboardedSettings, [
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
          historyEntrySchema.parse({
            id: 'entry-1',
            createdAt: new Date().toISOString(),
            outcome: 'completed',
            appName: 'VS Code',
            windowTitle: 'prompt.ts',
            activationMode: 'toggle',
            modelId: 'google/gemini-3-flash-preview',
            outputText: 'most recent output',
            errorMessage: null,
            audioFilePath: null,
            audioDurationMs: 0,
            audioMimeType: null,
            audioBytes: 0,
            submittedContext: null,
            usedContext: false,
            latencyMs: 120,
            audioProcessingMs: 28,
            audioSendMs: 64,
            insertionStrategy: 'insert-at-cursor',
            requestedMode: 'all-at-once',
            effectiveMode: 'all-at-once',
            insertionMethod: 'clipboard-all-at-once',
            fallbackUsed: false,
            timeToFirstTokenMs: 0,
            timeToCompleteMs: 0,
          }),
        ],
      })
      await Promise.resolve()
    })

    expect(await screen.findByText('most recent output')).toBeInTheDocument()
    expect(screen.queryByText(/no entries yet/i)).toBeNull()
  })

  it('expands a history entry without changing the existing detail content', async () => {
    const { publishState } = installDesktopApi()
    render(<DashboardWindow initialTab="history" />)
    expect(await screen.findByText(/no entries yet/i)).toBeInTheDocument()

    const createdAt = new Date().toISOString()
    const selectedText = 'selected context for expansion'
    const historyAudio = createDeferred<{ mimeType: string; base64: string } | null>()
    const getHistoryAudio = vi.fn(() => historyAudio.promise)
    window.ditado.getHistoryAudio = getHistoryAudio

    const entry = historyEntrySchema.parse({
      id: 'entry-expand',
      createdAt,
      outcome: 'completed',
      appName: 'VS Code',
      windowTitle: 'prompt.ts',
      activationMode: 'toggle',
      modelId: 'google/gemini-3-flash-preview',
      outputText: 'expanded output',
      errorMessage: null,
      audioFilePath: 'history-audio/entry-expand.wav',
      audioDurationMs: 1400,
      audioMimeType: 'audio/wav',
      audioBytes: 2048,
      submittedContext: {
        appName: 'VS Code',
        windowTitle: 'prompt.ts',
        selectedText,
        permissionsGranted: true,
        confidence: 'high',
        capturedAt: createdAt,
      },
      usedContext: true,
      latencyMs: 120,
      audioProcessingMs: 28,
      audioSendMs: 64,
      insertionStrategy: 'insert-at-cursor',
      requestedMode: 'all-at-once',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: false,
      timeToFirstTokenMs: 0,
      timeToCompleteMs: 0,
    })

    await act(async () => {
      publishState({
        ...createState(),
        history: [entry],
      })
      await Promise.resolve()
    })

    await userEvent.click(await screen.findByRole('button', { name: /expanded output/i }))

    expect(await screen.findByText(selectedText)).toBeInTheDocument()
    expect(await screen.findByText(/loading audio/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(getHistoryAudio).toHaveBeenCalledWith('entry-expand')
    })

    await act(async () => {
      historyAudio.resolve(null)
      await historyAudio.promise
    })
  })
})
