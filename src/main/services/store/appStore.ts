import { app, safeStorage } from 'electron'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { defaultSettings } from '../../../shared/defaults.js'
import {
  historyEntrySchema,
  settingsSchema,
  telemetryRecordSchema,
  type DictationAudioPayload,
  type HistoryEntry,
  type Settings,
  type TelemetryRecord,
} from '../../../shared/contracts.js'
import { normalizeHotkey } from '../../../shared/hotkeys.js'

const STORE_VERSION = 2
const TELEMETRY_LIMIT = 500

const persistedSettingsSchema = settingsSchema.omit({ apiKeyPresent: true })
const settingsFileSchema = persistedSettingsSchema
  .extend({
    version: settingsSchema.shape.historyRetentionDays.transform(() => STORE_VERSION),
  })
  .transform(({ version: _version, ...data }) => data)

const historyFileSchema = historyEntrySchema
  .array()
  .transform((entries) => ({ version: STORE_VERSION as const, entries }))

const readJsonFile = async (filePath: string): Promise<unknown | null> => {
  try {
    const content = await readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

const ensureParentDir = async (filePath: string): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true })
}

const writeAtomicJson = async (filePath: string, payload: unknown): Promise<void> => {
  await ensureParentDir(filePath)
  const tempPath = `${filePath}.tmp`
  const backupPath = `${filePath}.bak`
  const serialized = JSON.stringify(payload, null, 2)

  await writeFile(tempPath, serialized, 'utf8')

  try {
    await copyFile(filePath, backupPath)
  } catch {
    // No previous file yet.
  }

  await rm(filePath, { force: true })
  await rename(tempPath, filePath)
}

const persistedSettingsFileSchema = persistedSettingsSchema.extend({
  version: settingsSchema.shape.historyRetentionDays.transform(() => STORE_VERSION),
})

const storedHistoryFileSchema = {
  parse(input: unknown): HistoryEntry[] {
    if (!input || typeof input !== 'object' || !('version' in input) || !('entries' in input)) {
      throw new Error('Invalid history store')
    }

    const candidate = input as { version?: unknown; entries?: unknown }
    if (candidate.version !== STORE_VERSION || !Array.isArray(candidate.entries)) {
      throw new Error('Invalid history store version')
    }

    return candidate.entries
      .map((entry) => historyEntrySchema.safeParse(entry))
      .filter((entry) => entry.success)
      .map((entry) => entry.data)
  },
}

export class AppStore {
  private readonly rootDir = join(app.getPath('userData'), 'data')
  private readonly settingsFile = join(this.rootDir, 'settings.v2.json')
  private readonly historyFile = join(this.rootDir, 'history.v2.json')
  private readonly historyAudioDir = join(this.rootDir, 'history-audio')
  private readonly secretFile = join(this.rootDir, 'openrouter.secure.bin')
  private readonly telemetryFile = join(this.rootDir, 'telemetry.ndjson')

  private settings: Settings = defaultSettings
  private history: HistoryEntry[] = []

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await mkdir(this.historyAudioDir, { recursive: true })

    const settingsCandidate = await readJsonFile(this.settingsFile)
    const persistedSettings = persistedSettingsCandidate(settingsCandidate)

    this.settings = settingsSchema.parse({
      ...defaultSettings,
      ...persistedSettings,
      pushToTalkHotkey: normalizeHotkey(persistedSettings.pushToTalkHotkey ?? defaultSettings.pushToTalkHotkey) ?? defaultSettings.pushToTalkHotkey,
      toggleHotkey: normalizeHotkey(persistedSettings.toggleHotkey ?? defaultSettings.toggleHotkey) ?? defaultSettings.toggleHotkey,
      apiKeyPresent: await this.hasStoredApiKey(),
    })

    const historyCandidate = await readJsonFile(this.historyFile)
    this.history = parseHistoryCandidate(historyCandidate)
    await this.pruneHistory()
    await this.persistSettings()
    await this.persistHistory()
  }

  getSettings(): Settings {
    return this.settings
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const normalizedPatch = { ...patch }
    if (typeof normalizedPatch.pushToTalkHotkey === 'string') {
      normalizedPatch.pushToTalkHotkey =
        normalizeHotkey(normalizedPatch.pushToTalkHotkey) ?? this.settings.pushToTalkHotkey
    }
    if (typeof normalizedPatch.toggleHotkey === 'string') {
      normalizedPatch.toggleHotkey = normalizeHotkey(normalizedPatch.toggleHotkey) ?? this.settings.toggleHotkey
    }

    this.settings = settingsSchema.parse({
      ...this.settings,
      ...normalizedPatch,
      apiKeyPresent: await this.hasStoredApiKey(),
    })
    await this.pruneHistory()
    await this.persistSettings()
    await this.persistHistory()
    return this.settings
  }

  async setApiKey(apiKey: string): Promise<Settings> {
    if (!apiKey.trim()) {
      await rm(this.secretFile, { force: true })
      this.settings = settingsSchema.parse({
        ...this.settings,
        apiKeyPresent: false,
      })
      await this.persistSettings()
      return this.settings
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure local storage is unavailable on this system.')
    }

    await ensureParentDir(this.secretFile)
    const payload = safeStorage.encryptString(apiKey.trim())
    await writeFile(this.secretFile, payload)

    this.settings = settingsSchema.parse({
      ...this.settings,
      apiKeyPresent: true,
    })
    await this.persistSettings()
    return this.settings
  }

  async getApiKey(): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) {
      return null
    }

    try {
      const payload = await readFile(this.secretFile)
      if (!payload.length) {
        return null
      }

      return safeStorage.decryptString(payload)
    } catch {
      return null
    }
  }

  getHistory(): HistoryEntry[] {
    return [...this.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async appendHistory(entry: HistoryEntry): Promise<void> {
    const parsedEntry = historyEntrySchema.parse(entry)
    this.history = this.history.filter((historyEntry) => historyEntry.id !== parsedEntry.id)
    this.history.unshift(parsedEntry)
    await this.pruneHistory()
    await this.persistHistory()
  }

  async clearHistory(): Promise<void> {
    const audioPaths = this.history
      .map((entry) => entry.audioFilePath)
      .filter((path): path is string => Boolean(path))

    this.history = []
    await Promise.all(audioPaths.map((audioPath) => rm(audioPath, { force: true })))
    await rm(this.historyAudioDir, { recursive: true, force: true })
    await mkdir(this.historyAudioDir, { recursive: true })
    await this.persistHistory()
  }

  async persistHistoryAudio(
    entryId: string,
    payload: DictationAudioPayload,
  ): Promise<Pick<HistoryEntry, 'audioFilePath' | 'audioDurationMs' | 'audioMimeType' | 'audioBytes'>> {
    const filePath = join(this.historyAudioDir, `${entryId}.wav`)
    await mkdir(this.historyAudioDir, { recursive: true })
    const buffer = Buffer.from(payload.wavBase64, 'base64')
    await writeFile(filePath, buffer)

    return {
      audioFilePath: filePath,
      audioDurationMs: payload.durationMs,
      audioMimeType: payload.mimeType,
      audioBytes: buffer.byteLength,
    }
  }

  async getHistoryAudioAsset(entryId: string): Promise<{ mimeType: string; base64: string } | null> {
    const entry = this.history.find((historyEntry) => historyEntry.id === entryId)
    if (!entry?.audioFilePath || !entry.audioMimeType) {
      return null
    }

    try {
      const payload = await readFile(entry.audioFilePath)
      return {
        mimeType: entry.audioMimeType,
        base64: payload.toString('base64'),
      }
    } catch {
      return null
    }
  }

  async appendTelemetry(record: TelemetryRecord): Promise<void> {
    const parsed = telemetryRecordSchema.parse(record)
    await ensureParentDir(this.telemetryFile)
    const existing = await this.readTelemetryTail(TELEMETRY_LIMIT)
    const nextEntries = [parsed, ...existing].slice(0, TELEMETRY_LIMIT)
    const serialized = nextEntries.map((entry) => JSON.stringify(entry)).join('\n')
    await writeFile(this.telemetryFile, serialized ? `${serialized}\n` : '', 'utf8')
  }

  async readTelemetryTail(limit = 30): Promise<TelemetryRecord[]> {
    try {
      const raw = await readFile(this.telemetryFile, 'utf8')
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => telemetryRecordSchema.safeParse(JSON.parse(line)))
        .filter((entry) => entry.success)
        .map((entry) => entry.data)
        .slice(0, limit)
    } catch {
      return []
    }
  }

  private async persistSettings(): Promise<void> {
    const { apiKeyPresent: _apiKeyPresent, ...persistedSettings } = this.settings
    await writeAtomicJson(this.settingsFile, {
      version: STORE_VERSION,
      ...persistedSettings,
    })
  }

  private async persistHistory(): Promise<void> {
    await writeAtomicJson(this.historyFile, {
      version: STORE_VERSION,
      entries: this.history,
    })
  }

  private async hasStoredApiKey(): Promise<boolean> {
    const apiKey = await this.getApiKey()
    return Boolean(apiKey)
  }

  private async pruneHistory(): Promise<void> {
    const retentionMs = this.settings.historyRetentionDays * 24 * 60 * 60 * 1000
    const cutoff = Date.now() - retentionMs
    const sorted = [...this.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const keptEntries: HistoryEntry[] = []
    const removedAudioPaths = new Set<string>()
    let usedAudioBytes = 0

    for (const entry of sorted) {
      if (new Date(entry.createdAt).getTime() < cutoff) {
        if (entry.audioFilePath) {
          removedAudioPaths.add(entry.audioFilePath)
        }
        continue
      }

      const nextAudioBytes = usedAudioBytes + entry.audioBytes
      if (entry.audioBytes > 0 && nextAudioBytes > this.settings.maxHistoryAudioBytes) {
        if (entry.audioFilePath) {
          removedAudioPaths.add(entry.audioFilePath)
        }
        continue
      }

      keptEntries.push(entry)
      usedAudioBytes = nextAudioBytes
    }

    this.history = keptEntries
    await Promise.all([...removedAudioPaths].map(async (audioPath) => {
      await rm(audioPath, { force: true })
    }))
  }
}

const persistedSettingsCandidate = (settingsCandidate: unknown): Partial<Settings> => {
  if (!settingsCandidate || typeof settingsCandidate !== 'object') {
    return defaultSettings
  }

  const candidate = persistedSettingsFileSchema.safeParse(settingsCandidate)
  if (!candidate.success) {
    return defaultSettings
  }

  return candidate.data
}

const parseHistoryCandidate = (historyCandidate: unknown): HistoryEntry[] => {
  try {
    return storedHistoryFileSchema.parse(historyCandidate)
  } catch {
    return []
  }
}
