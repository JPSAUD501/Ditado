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
    const settingsFile = join(userDataDir, 'data', 'settings.v2.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(settingsFile, '{"version":2,"pushToTalkHotkey":', 'utf8')

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+Alt')
    expect(store.getSettings().toggleHotkey).toBe('Shift+Alt')
    expect(store.getSettings().sendContextAutomatically).toBe(true)
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

    const persisted = JSON.parse(await readFile(join(userDataDir, 'data', 'settings.v2.json'), 'utf8'))
    expect(persisted.pushToTalkHotkey).toBe('Ctrl+Alt')
    expect(persisted.toggleHotkey).toBe('Shift+Alt')
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

  it('persists history audio files, deduplicates entries by session id, and removes them on clear', async () => {
    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    const audioMeta = await store.persistHistoryAudio('session-1', {
      wavBase64: Buffer.from('wave-audio').toString('base64'),
      mimeType: 'audio/wav',
      languageHint: 'pt-BR',
      durationMs: 1200,
      speechDetected: true,
      peakAmplitude: 0.2,
      rmsAmplitude: 0.08,
    })

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
      ...audioMeta,
      submittedContext: null,
      usedContext: true,
      latencyMs: 180,
      insertionStrategy: 'replace-selection',
      insertionMethod: 'clipboard-protected',
      fallbackUsed: false,
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
      ...audioMeta,
      submittedContext: null,
      usedContext: true,
      latencyMs: 180,
      insertionStrategy: 'replace-selection',
      insertionMethod: 'clipboard-protected',
      fallbackUsed: false,
    })

    expect(store.getHistory()).toHaveLength(1)
    expect(store.getHistory()[0]?.outputText).toBe('texto final')
    expect(await readFile(audioMeta.audioFilePath ?? '', 'utf8')).toBe('wave-audio')
    const asset = await store.getHistoryAudioAsset('session-1')
    expect(asset?.mimeType).toBe('audio/wav')
    expect(asset?.base64).toBe(Buffer.from('wave-audio').toString('base64'))

    await store.clearHistory()

    expect(store.getHistory()).toHaveLength(0)
    await expect(readFile(audioMeta.audioFilePath ?? '', 'utf8')).rejects.toThrow()
  })
})
