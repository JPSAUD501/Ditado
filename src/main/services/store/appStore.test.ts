import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let userDataDir = ''

const loadStore = async (
  safeStorageOverrides: Partial<{
    isEncryptionAvailable: () => boolean
    encryptString: (value: string) => Buffer
    decryptString: (value: Buffer) => string
  }> = {},
) => {
  vi.resetModules()
  vi.doMock('electron', () => ({
    app: {
      getPath: () => userDataDir,
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
      decryptString: (value: Buffer) => value.toString('utf8').replace(/^enc:/, ''),
      ...safeStorageOverrides,
    },
  }))

  const module = await import('./appStore.js')
  return module.AppStore
}

beforeEach(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'ditado-store-'))
})

describe('AppStore', () => {
  it('starts clean from defaults when the current settings file is invalid', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(settingsFile, '{"pushToTalkHotkey":', 'utf8')

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+Alt')
    expect(store.getSettings().toggleHotkey).toBe('Shift+Alt')
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

    const persisted = JSON.parse(await readFile(settingsFile, 'utf8'))
    expect(persisted.autoUpdateEnabled).toBe(true)
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

    const persisted = JSON.parse(await readFile(join(userDataDir, 'data', 'settings.json'), 'utf8'))
    expect(persisted.pushToTalkHotkey).toBe('Ctrl+Alt')
    expect(persisted.toggleHotkey).toBe('Shift+Alt')
  })

  it('ignores attempts to disable auto updates through updateSettings', async () => {
    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    await store.updateSettings({
      autoUpdateEnabled: false,
    })

    expect(store.getSettings().autoUpdateEnabled).toBe(true)

    const persisted = JSON.parse(await readFile(join(userDataDir, 'data', 'settings.json'), 'utf8'))
    expect(persisted.autoUpdateEnabled).toBe(true)
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
    expect(firstEntry?.audioFilePath).toBeTruthy()

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
    expect(await readFile(firstEntry?.audioFilePath ?? '', 'utf8')).toBe('wave-audio')
    const asset = await store.getHistoryAudioAsset('session-1')
    expect(asset?.mimeType).toBe('audio/wav')
    expect(asset?.base64).toBe(Buffer.from('wave-audio').toString('base64'))

    await secondStore.clearHistory()

    expect(secondStore.getHistory()).toHaveLength(0)
    await expect(readFile(firstEntry?.audioFilePath ?? '', 'utf8')).rejects.toThrow()
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

    const persisted = (await readFile(telemetryFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(persisted).toHaveLength(10_000)
    expect(persisted[0]?.id).toBe('metric-latest')
    expect(persisted.at(-1)?.id).toBe('metric-9998')
  })
})
