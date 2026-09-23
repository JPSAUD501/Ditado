import { mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../../shared/defaults.js'

let userDataDir = ''
let mockedAppVersion = '0.1.48'
const activeStores: Array<{ shutdown: () => Promise<void> }> = []

const loadStore = async (
  safeStorageOverrides: Partial<{
    isEncryptionAvailable: () => boolean
    encryptString: (value: string) => Buffer
    decryptString: (value: Buffer) => string
  }> = {},
  appVersion = mockedAppVersion,
) => {
  vi.resetModules()
  mockedAppVersion = appVersion
  vi.doMock('electron', () => ({
    app: {
      getPath: () => userDataDir,
      getVersion: () => mockedAppVersion,
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
      decryptString: (value: Buffer) => value.toString('utf8').replace(/^enc:/, ''),
      ...safeStorageOverrides,
    },
  }))

  const module = await import('./appStore.js')
  return class TestAppStore extends module.AppStore {
    constructor(...args: ConstructorParameters<typeof module.AppStore>) {
      super(...args)
      activeStores.push(this)
    }
  }
}

// Each test re-imports the store; transform the module graph once up front so the first test
// isn't charged for the cold load (seconds when the whole suite runs in parallel).
beforeAll(async () => {
  await import('./appStore.js')
}, 30_000)

beforeEach(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'ditado-store-'))
  mockedAppVersion = '0.1.48'
})

afterEach(async () => {
  await Promise.all(activeStores.splice(0).map((store) => store.shutdown().catch(() => undefined)))
})

const legacyEntry = (id: string, createdAt: string, outputText: string) => ({
  id,
  createdAt,
  outcome: 'completed',
  appName: 'VS Code',
  windowTitle: 'notes.md',
  activationMode: 'push-to-talk',
  modelId: 'google/gemini-3-flash-preview',
  outputText,
  errorMessage: null,
  submittedContext: null,
  usedContext: false,
  latencyMs: 300,
  audioProcessingMs: 10,
  audioSendMs: 40,
  insertionStrategy: 'insert-at-cursor',
  requestedMode: 'all-at-once',
  effectiveMode: 'all-at-once',
  insertionMethod: 'clipboard-all-at-once',
  fallbackUsed: false,
  timeToFirstTokenMs: 0,
  timeToCompleteMs: 0,
})

const writeLegacyProfile = async (settings: Record<string, unknown>, entries: unknown[]) => {
  await mkdir(join(userDataDir, 'data'), { recursive: true })
  await writeFile(join(userDataDir, 'data', 'settings.json'), JSON.stringify(settings), 'utf8')
  await writeFile(join(userDataDir, 'data', 'history.json'), JSON.stringify(entries), 'utf8')
}

// Pushes the legacy files' mtime clearly past the import marker (coarse filesystem timestamps).
const touchLegacyFilesInFuture = async () => {
  const future = new Date(Date.now() + 60_000)
  for (const name of ['settings.json', 'history.json']) {
    await utimes(join(userDataDir, 'data', name), future, future)
  }
}

describe('AppStore', () => {
  it('starts clean from defaults when the current settings file is invalid', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(settingsFile, '{"pushToTalkHotkey":', 'utf8')

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+Meta')
    expect(store.getSettings().toggleHotkey).toBe('')
    expect(store.getSettings().launchOnLogin).toBe(true)
    expect(store.getSettings().sendContextAutomatically).toBe(true)
    expect(store.getSettings().autoUpdateEnabled).toBe(true)
  })

  it('defaults auto updates to enabled when older settings files omit the field', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Shift+Alt',
      }),
      'utf8',
    )

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().autoUpdateEnabled).toBe(true)
  })

  it('forces auto updates back to enabled when older settings files persisted false', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Shift+Alt',
        autoUpdateEnabled: false,
      }),
      'utf8',
    )

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().autoUpdateEnabled).toBe(true)

    const secondStore = new AppStore()
    await secondStore.initialize()
    expect(secondStore.getSettings().autoUpdateEnabled).toBe(true)
  })

  it('does not create startup update or onboarding notices on first install', async () => {
    const AppStore = await loadStore({}, '0.1.48')
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().lastSeenAppVersion).toBe('0.1.48')
    expect(store.getSettings().pendingStartupUpdatedNoticeVersion).toBeNull()
    expect(store.getSettings().pendingUpgradeOnboardingVersion).toBeNull()
  })

  it('marks any upgrade for the startup updated notice', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        ...defaultSettings,
        lastSeenAppVersion: '0.1.43',
      }),
      'utf8',
    )

    const AppStore = await loadStore({}, '0.1.45')
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().lastSeenAppVersion).toBe('0.1.45')
    expect(store.getSettings().pendingStartupUpdatedNoticeVersion).toBe('0.1.45')
    expect(store.getSettings().pendingUpgradeOnboardingVersion).toBeNull()
  })

  it('marks upgrade onboarding when crossing the shortcut migration version', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        ...defaultSettings,
        lastSeenAppVersion: '0.1.43',
        pushToTalkHotkey: 'Ctrl+F',
        toggleHotkey: 'Ctrl+G',
      }),
      'utf8',
    )

    const AppStore = await loadStore({}, '0.1.48')
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().pendingStartupUpdatedNoticeVersion).toBe('0.1.48')
    expect(store.getSettings().pendingUpgradeOnboardingVersion).toBe('0.1.48')
    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+Meta')
    expect(store.getSettings().toggleHotkey).toBe('')
  })

  it('keeps applying the shortcut migration on future versions until the user has crossed it', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        ...defaultSettings,
        lastSeenAppVersion: '0.1.40',
        pushToTalkHotkey: 'Ctrl+F',
        toggleHotkey: 'Ctrl+G',
      }),
      'utf8',
    )

    const AppStore = await loadStore({}, '0.1.50')
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().pendingStartupUpdatedNoticeVersion).toBe('0.1.50')
    expect(store.getSettings().pendingUpgradeOnboardingVersion).toBe('0.1.50')
    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+Meta')
    expect(store.getSettings().toggleHotkey).toBe('')
  })

  it('does not rerun the shortcut migration after the user has already crossed it', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        ...defaultSettings,
        lastSeenAppVersion: '0.1.48',
        pushToTalkHotkey: 'Ctrl+F',
        toggleHotkey: 'Ctrl+G',
      }),
      'utf8',
    )

    const AppStore = await loadStore({}, '0.1.50')
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().pendingStartupUpdatedNoticeVersion).toBe('0.1.50')
    expect(store.getSettings().pendingUpgradeOnboardingVersion).toBeNull()
    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+F')
    expect(store.getSettings().toggleHotkey).toBe('Ctrl+G')
  })

  it('defaults launch on login to enabled when older settings files omit the field', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        pushToTalkHotkey: 'Ctrl+Alt',
        toggleHotkey: 'Shift+Alt',
      }),
      'utf8',
    )

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().launchOnLogin).toBe(true)
  })

  it('normalizes hotkeys and persists them through updateSettings', async () => {
    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    await store.updateSettings({
      pushToTalkHotkey: 'control+alt',
      toggleHotkey: 'shift+alt',
    })

    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+Alt')
    expect(store.getSettings().toggleHotkey).toBe('Shift+Alt')

    const secondStore = new AppStore()
    await secondStore.initialize()
    expect(secondStore.getSettings().pushToTalkHotkey).toBe('Ctrl+Alt')
    expect(secondStore.getSettings().toggleHotkey).toBe('Shift+Alt')
  })

  it('ignores attempts to disable auto updates through updateSettings', async () => {
    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    await store.updateSettings({
      autoUpdateEnabled: false,
    })

    expect(store.getSettings().autoUpdateEnabled).toBe(true)

    const secondStore = new AppStore()
    await secondStore.initialize()
    expect(secondStore.getSettings().autoUpdateEnabled).toBe(true)
  })

  it('persists the API key across store instances when secure storage is available', async () => {
    const AppStore = await loadStore()
    const firstStore = new AppStore()
    await firstStore.initialize()

    await firstStore.setApiKey('sk-or-v1-secret')
    expect(await firstStore.getApiKey()).toBe('sk-or-v1-secret')

    const secondStore = new AppStore()
    await secondStore.initialize()

    expect(secondStore.getSettings().apiKeyPresent).toBe(true)
    expect(await secondStore.getApiKey()).toBe('sk-or-v1-secret')

    const secretFile = join(userDataDir, 'data', 'openrouter.secure.bin')
    expect((await readFile(secretFile)).toString('utf8')).toBe('enc:sk-or-v1-secret')
  })

  it('serializes concurrent settings writes so the persisted snapshot keeps all fields', async () => {
    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    await Promise.all([
      store.updateSettings({ launchOnLogin: true }),
      store.updateSettings({ toggleHotkey: 'ctrl+f' }),
      store.updateSettings({ preferredMicrophoneId: 'mic-42' }),
    ])
    await store.flush()

    const secondStore = new AppStore()
    await secondStore.initialize()

    expect(secondStore.getSettings().launchOnLogin).toBe(true)
    expect(secondStore.getSettings().toggleHotkey).toBe('Ctrl+F')
    expect(secondStore.getSettings().preferredMicrophoneId).toBe('mic-42')
  })

  it('fails closed when secure storage is unavailable', async () => {
    const AppStore = await loadStore({
      isEncryptionAvailable: () => false,
    })
    const store = new AppStore()
    await store.initialize()

    await expect(store.setApiKey('sk-or-v1-secret')).rejects.toThrow('Secure local storage is unavailable')
    expect(await store.getApiKey()).toBeNull()
    expect(store.getSettings().apiKeyPresent).toBe(false)
  })

  it('persists history audio files, survives restart, deduplicates entries by session id, and removes them on clear', async () => {
    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    await store.appendHistoryWithAudio({
      id: 'session-1',
      createdAt: new Date().toISOString(),
      outcome: 'completed',
      appName: 'VS Code',
      windowTitle: 'prompt.ts',
      activationMode: 'toggle',
      modelId: 'google/gemini-3-flash-preview',
      outputText: 'primeiro texto',
      errorMessage: null,
      submittedContext: null,
      usedContext: true,
      latencyMs: 180,
      audioProcessingMs: 18,
      audioSendMs: 55,
      insertionStrategy: 'replace-selection',
      requestedMode: 'all-at-once',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: false,
      timeToFirstTokenMs: 0,
      timeToCompleteMs: 0,
    }, {
      audioBase64: Buffer.from('wave-audio').toString('base64'),
      mimeType: 'audio/wav',
      languageHint: 'pt-BR',
      durationMs: 1200,
      audioProcessingMs: 18,
      speechDetected: true,
      peakAmplitude: 0.2,
      rmsAmplitude: 0.08,
    })

    const firstEntry = store.getHistory()[0]
    expect(firstEntry?.audioFilePath).toBeNull()

    await store.appendHistory({
      id: 'session-1',
      createdAt: new Date().toISOString(),
      outcome: 'completed',
      appName: 'VS Code',
      windowTitle: 'prompt.ts',
      activationMode: 'toggle',
      modelId: 'google/gemini-3-flash-preview',
      outputText: 'primeiro texto',
      errorMessage: null,
      audioFilePath: firstEntry?.audioFilePath ?? null,
      audioDurationMs: firstEntry?.audioDurationMs ?? 0,
      audioMimeType: firstEntry?.audioMimeType ?? null,
      audioBytes: firstEntry?.audioBytes ?? 0,
      submittedContext: null,
      usedContext: true,
      latencyMs: 180,
      audioProcessingMs: 18,
      audioSendMs: 55,
      insertionStrategy: 'replace-selection',
      requestedMode: 'all-at-once',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: false,
      timeToFirstTokenMs: 0,
      timeToCompleteMs: 0,
    })

    await store.appendHistory({
      id: 'session-1',
      createdAt: new Date().toISOString(),
      outcome: 'completed',
      appName: 'VS Code',
      windowTitle: 'prompt.ts',
      activationMode: 'toggle',
      modelId: 'google/gemini-3-flash-preview',
      outputText: 'texto final',
      errorMessage: null,
      audioFilePath: firstEntry?.audioFilePath ?? null,
      audioDurationMs: firstEntry?.audioDurationMs ?? 0,
      audioMimeType: firstEntry?.audioMimeType ?? null,
      audioBytes: firstEntry?.audioBytes ?? 0,
      submittedContext: null,
      usedContext: true,
      latencyMs: 180,
      audioProcessingMs: 18,
      audioSendMs: 55,
      insertionStrategy: 'replace-selection',
      requestedMode: 'all-at-once',
      effectiveMode: 'all-at-once',
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: false,
      timeToFirstTokenMs: 0,
      timeToCompleteMs: 0,
    })

    await store.flush()

    const secondStore = new AppStore()
    await secondStore.initialize()

    expect(secondStore.getHistory()).toHaveLength(1)
    expect(secondStore.getHistory()[0]?.outputText).toBe('texto final')
    const asset = await store.getHistoryAudioAsset('session-1')
    expect(asset?.mimeType).toBe('audio/wav')
    expect(asset?.base64).toBe(Buffer.from('wave-audio').toString('base64'))

    await secondStore.clearHistory()

    expect(secondStore.getHistory()).toHaveLength(0)
    await expect(secondStore.getHistoryAudioAsset('session-1')).resolves.toBeNull()
  })

  it('rotates telemetry.ndjson to keep only the most recent 10000 records', async () => {
    const telemetryFile = join(userDataDir, 'data', 'telemetry.ndjson')
    await mkdir(join(userDataDir, 'data'), { recursive: true })

    const existingRecords = Array.from({ length: 10_000 }, (_, index) =>
      JSON.stringify({
        id: `metric-${index}`,
        timestamp: new Date(2024, 0, 1, 0, 0, index).toISOString(),
        kind: 'metric',
        name: `metric-${index}`,
        detail: { index: String(index) },
      }),
    ).join('\n')

    await writeFile(telemetryFile, `${existingRecords}\n`, 'utf8')

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()
    await store.appendTelemetry({
      id: 'metric-latest',
      timestamp: new Date().toISOString(),
      kind: 'metric',
      name: 'latest',
      detail: {},
    })

    const persisted = await store.readTelemetryTail(10_000)
    expect(persisted).toHaveLength(10_000)
    expect(persisted[0]?.id).toBe('metric-latest')
    expect(persisted.at(-1)?.id).toBe('metric-1')
  })

  it('persists every user-editable setting through Syncore across restarts', async () => {
    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()
    await store.updateSettings({
      zeroDataRetention: true,
      modelId: 'google/gemini-3.6-flash',
      insertionStreamingMode: 'all-at-once',
      historyRetentionDays: 30,
    })
    await store.shutdown()

    const restarted = new AppStore()
    await restarted.initialize()

    expect(restarted.getSettings()).toMatchObject({
      zeroDataRetention: true,
      modelId: 'google/gemini-3.6-flash',
      insertionStreamingMode: 'all-at-once',
      historyRetentionDays: 30,
    })
  })

  it('re-imports legacy files that changed after a previous Syncore import', async () => {
    await writeLegacyProfile(
      { modelId: 'google/gemini-3-flash-preview', lastSeenAppVersion: '0.1.48', onboardingCompleted: true },
      [legacyEntry('session-a', '2026-05-20T10:00:00.000Z', 'antes')],
    )
    const AppStore = await loadStore()
    const first = new AppStore()
    await first.initialize()
    await first.shutdown()

    // An older build keeps writing JSON after the Syncore database already exists.
    await writeLegacyProfile(
      { modelId: 'google/gemini-3.6-flash', lastSeenAppVersion: '0.1.48', onboardingCompleted: true },
      [
        legacyEntry('session-b', '2026-09-20T10:00:00.000Z', 'depois'),
        legacyEntry('session-a', '2026-05-20T10:00:00.000Z', 'antes'),
      ],
    )
    await touchLegacyFilesInFuture()

    const second = new AppStore()
    await second.initialize()

    expect(second.getSettings().modelId).toBe('google/gemini-3.6-flash')
    expect(second.getHistory().map((entry) => entry.id)).toEqual(['session-b', 'session-a'])
  })

  it('keeps Syncore data when the legacy files are older than the import', async () => {
    await writeLegacyProfile(
      { modelId: 'google/gemini-3-flash-preview', lastSeenAppVersion: '0.1.48', onboardingCompleted: true },
      [legacyEntry('session-a', '2026-05-20T10:00:00.000Z', 'antes')],
    )
    const AppStore = await loadStore()
    const first = new AppStore()
    await first.initialize()
    await first.updateSettings({ modelId: 'google/gemini-3.6-flash' })
    await first.shutdown()

    const second = new AppStore()
    await second.initialize()

    expect(second.getSettings().modelId).toBe('google/gemini-3.6-flash')
    expect(second.getHistory()).toHaveLength(1)
  })

  it('skips corrupted telemetry.ndjson lines instead of failing startup', async () => {
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    const record = (id: string, second: number) => JSON.stringify({
      id,
      timestamp: new Date(2026, 0, 1, 0, 0, second).toISOString(),
      kind: 'metric',
      name: id,
      detail: {},
    })
    await writeFile(
      join(userDataDir, 'data', 'telemetry.ndjson'),
      `${record('metric-1', 1)}
{"id":"metric-trunc
${record('metric-2', 2)}
`,
      'utf8',
    )

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect((await store.readTelemetryTail(10)).map((entry) => entry.id)).toEqual(['metric-2', 'metric-1'])
  })
})
