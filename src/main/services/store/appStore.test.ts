import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let userDataDir = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir,
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}))

const loadStore = async () => {
  const module = await import('./appStore.js')
  return module.AppStore
}

beforeEach(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'ditado-store-'))
  vi.resetModules()
})

describe('AppStore', () => {
  it('migrates legacy shortcuts during initialization without clobbering the rest of settings', async () => {
    const settingsFile = join(userDataDir, 'data', 'settings.json')
    await mkdir(join(userDataDir, 'data'), { recursive: true })
    await writeFile(
      settingsFile,
      JSON.stringify({
        modelId: 'google/gemini-3-flash-preview',
        sendContextAutomatically: false,
        pushToTalkHotkey: 'Alt+Space',
        toggleHotkey: 'CommandOrControl+Shift+Space',
      }),
      'utf8',
    )

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    expect(store.getSettings().pushToTalkHotkey).toBe('Ctrl+Alt')
    expect(store.getSettings().toggleHotkey).toBe('Shift+Alt')
    expect(store.getSettings().sendContextAutomatically).toBe(false)
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
  })

  it('persists the API key across store instances and exposes apiKeyPresent on initialize', async () => {
    const AppStore = await loadStore()
    const firstStore = new AppStore()
    await firstStore.initialize()

    await firstStore.setApiKey('sk-or-v1-secret')
    expect(await firstStore.getApiKey()).toBe('sk-or-v1-secret')

    const secondStore = new AppStore()
    await secondStore.initialize()

    expect(secondStore.getSettings().apiKeyPresent).toBe(true)
    expect(await secondStore.getApiKey()).toBe('sk-or-v1-secret')

    const secretFile = join(userDataDir, 'data', 'openrouter.bin')
    expect((await readFile(secretFile)).toString('utf8')).toBe('sk-or-v1-secret')
  })

  it('falls back to plain storage when encryption throws but still persists the API key', async () => {
    vi.doMock('electron', () => ({
      app: {
        getPath: () => userDataDir,
      },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: () => {
          throw new Error('encrypt failed')
        },
        decryptString: (value: Buffer) => value.toString('utf8'),
      },
    }))

    const AppStore = await loadStore()
    const store = new AppStore()
    await store.initialize()

    await store.setApiKey('sk-or-v1-fallback')
    expect(await store.getApiKey()).toBe('sk-or-v1-fallback')
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
      appName: 'VS Code',
      windowTitle: 'prompt.ts',
      activationMode: 'toggle',
      modelId: 'google/gemini-3-flash-preview',
      outputText: 'primeiro texto',
      ...audioMeta,
      submittedContext: null,
      usedContext: true,
      latencyMs: 180,
      insertionStrategy: 'replace-selection',
    })

    await store.appendHistory({
      id: 'session-1',
      createdAt: new Date().toISOString(),
      appName: 'VS Code',
      windowTitle: 'prompt.ts',
      activationMode: 'toggle',
      modelId: 'google/gemini-3-flash-preview',
      outputText: 'texto final',
      ...audioMeta,
      submittedContext: null,
      usedContext: true,
      latencyMs: 180,
      insertionStrategy: 'replace-selection',
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
