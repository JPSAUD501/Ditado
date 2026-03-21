import { app, safeStorage } from 'electron'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  defaultPushToTalkHotkey,
  defaultSettings,
  defaultToggleHotkey,
} from '../../../shared/defaults.js'
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
import { requiresUpgradeOnboarding } from '../../../shared/versioning.js'

const TELEMETRY_LIMIT = 10_000

const persistedSettingsSchema = settingsSchema.omit({ apiKeyPresent: true }).partial()

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

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const isRetryableRenameError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }

  const code = 'code' in error ? error.code : undefined
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
}

const audioExtensionFromMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('mpeg') || normalized.includes('mp3')) {
    return 'mp3'
  }
  if (normalized.includes('wav')) {
    return 'wav'
  }
  if (normalized.includes('ogg')) {
    return 'ogg'
  }
  if (normalized.includes('aac')) {
    return 'aac'
  }
  if (normalized.includes('mp4') || normalized.includes('m4a')) {
    return 'm4a'
  }

  return 'audio'
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

  // On Windows, fs.rename atomically replaces the destination if it exists
  // (uses MoveFileExW with MOVEFILE_REPLACE_EXISTING). The prior rm() call is
  // unnecessary and can throw EPERM/EBUSY under AV scanning, so it's removed.
  // In practice scanners and file watchers can still race the replacement, so
  // we retry a few times before surfacing the failure.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(tempPath, filePath)
      return
    } catch (error) {
      if (!isRetryableRenameError(error) || attempt === 4) {
        throw error
      }

      await sleep(25 * (attempt + 1))
    }
  }
}

export class AppStore {
  private readonly rootDir = join(app.getPath('userData'), 'data')
  private readonly settingsFile = join(this.rootDir, 'settings.json')
  private readonly historyFile = join(this.rootDir, 'history.json')
  private readonly historyAudioDir = join(this.rootDir, 'history-audio')
  private readonly secretFile = join(this.rootDir, 'openrouter.secure.bin')
  private readonly telemetryFile = join(this.rootDir, 'telemetry.ndjson')

  private settings: Settings = defaultSettings
  private history: HistoryEntry[] = []
  private writeQueue: Promise<void> = Promise.resolve()

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await mkdir(this.historyAudioDir, { recursive: true })

    const settingsCandidate = await readJsonFile(this.settingsFile)
    const persistedSettings = parsePersistedSettings(settingsCandidate) ?? {}
    const isFirstRun = persistedSettings.lastSeenAppVersion == null
    const isUpgrade =
      persistedSettings.lastSeenAppVersion != null
      && persistedSettings.lastSeenAppVersion !== app.getVersion()
    const shouldRunUpgradeOnboarding = requiresUpgradeOnboarding(
      app.getVersion(),
      persistedSettings.lastSeenAppVersion,
    )
    const pendingStartupUpdatedNoticeVersion = isUpgrade
      ? app.getVersion()
      : persistedSettings.pendingStartupUpdatedNoticeVersion ?? null
    const pendingUpgradeOnboardingVersion = isUpgrade
      ? (shouldRunUpgradeOnboarding ? app.getVersion() : null)
      : persistedSettings.pendingUpgradeOnboardingVersion ?? null
    const shouldResetHotkeysForUpgrade = isUpgrade && shouldRunUpgradeOnboarding

    this.settings = settingsSchema.parse({
      ...defaultSettings,
      ...persistedSettings,
      autoUpdateEnabled: true,
      pushToTalkHotkey:
        shouldResetHotkeysForUpgrade
          ? defaultPushToTalkHotkey
          : normalizeHotkey(persistedSettings.pushToTalkHotkey ?? defaultSettings.pushToTalkHotkey)
            ?? defaultSettings.pushToTalkHotkey,
      toggleHotkey:
        shouldResetHotkeysForUpgrade
          ? defaultToggleHotkey
          : normalizeHotkey(persistedSettings.toggleHotkey ?? defaultSettings.toggleHotkey)
            ?? defaultSettings.toggleHotkey,
      apiKeyPresent: await this.hasStoredApiKey(),
      lastSeenAppVersion: app.getVersion(),
      pendingStartupUpdatedNoticeVersion: isFirstRun ? null : pendingStartupUpdatedNoticeVersion,
      pendingUpgradeOnboardingVersion: isFirstRun ? null : pendingUpgradeOnboardingVersion,
    })

    const historyCandidate = await readJsonFile(this.historyFile)
    this.history = parseHistory(historyCandidate) ?? []
    await this.pruneHistory()
    await this.persistSettings()
    await this.persistHistory()
  }

  getSettings(): Settings {
    return this.settings
  }

  getHistory(): HistoryEntry[] {
    return [...this.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async flush(): Promise<void> {
    await this.writeQueue
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return this.enqueueMutation(async () => {
      const normalizedPatch = { ...patch }
      delete normalizedPatch.autoUpdateEnabled
      if (typeof normalizedPatch.pushToTalkHotkey === 'string') {
        normalizedPatch.pushToTalkHotkey =
          normalizeHotkey(normalizedPatch.pushToTalkHotkey) ?? this.settings.pushToTalkHotkey
      }
      if (typeof normalizedPatch.toggleHotkey === 'string') {
        normalizedPatch.toggleHotkey =
          normalizeHotkey(normalizedPatch.toggleHotkey) ?? this.settings.toggleHotkey
      }

      this.settings = settingsSchema.parse({
        ...this.settings,
        ...normalizedPatch,
        autoUpdateEnabled: true,
        apiKeyPresent: await this.hasStoredApiKey(),
      })
      await this.pruneHistory()
      await this.persistSettings()
      await this.persistHistory()
      return this.settings
    })
  }

  async setApiKey(apiKey: string): Promise<Settings> {
    return this.enqueueMutation(async () => {
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
    })
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

  async appendHistory(entry: unknown): Promise<void> {
    await this.enqueueMutation(async () => {
      const parsedEntry = historyEntrySchema.parse(entry)
      this.history = this.history.filter((historyEntry) => historyEntry.id !== parsedEntry.id)
      this.history.unshift(parsedEntry)
      await this.pruneHistory()
      await this.persistHistory()
    })
  }

  async appendHistoryWithAudio(
    entry: Record<string, unknown> & {
      id: string
      audio?: Record<string, unknown>
    },
    payload: DictationAudioPayload,
  ): Promise<void> {
    await this.enqueueMutation(async () => {
      const audioMeta = await this.writeHistoryAudio(entry.id, payload)
      const parsedEntry = historyEntrySchema.parse({
        ...entry,
        ...audioMeta,
        audio: {
          ...entry.audio,
          filePath: audioMeta.audioFilePath,
          durationMs: audioMeta.audioDurationMs,
          mimeType: audioMeta.audioMimeType,
          bytes: audioMeta.audioBytes,
        },
      })
      this.history = this.history.filter((historyEntry) => historyEntry.id !== parsedEntry.id)
      this.history.unshift(parsedEntry)
      await this.pruneHistory()
      await this.persistHistory()
    })
  }

  async clearHistory(): Promise<void> {
    await this.enqueueMutation(async () => {
      const audioPaths = this.history
        .map((entry) => entry.audioFilePath)
        .filter((path): path is string => Boolean(path))

      this.history = []
      await Promise.all(audioPaths.map((audioPath) => rm(audioPath, { force: true })))
      await rm(this.historyAudioDir, { recursive: true, force: true })
      await mkdir(this.historyAudioDir, { recursive: true })
      await this.persistHistory()
    })
  }

  async deleteHistoryEntry(entryId: string): Promise<void> {
    await this.enqueueMutation(async () => {
      const entry = this.history.find((h) => h.id === entryId)
      if (!entry) return
      if (entry.audioFilePath) {
        await rm(entry.audioFilePath, { force: true })
      }
      this.history = this.history.filter((h) => h.id !== entryId)
      await this.persistHistory()
    })
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
    await this.enqueueMutation(async () => {
      const parsed = telemetryRecordSchema.parse(record)
      await ensureParentDir(this.telemetryFile)
      const existing = await this.readTelemetryTail(TELEMETRY_LIMIT)
      const nextEntries = [parsed, ...existing].slice(0, TELEMETRY_LIMIT)
      const serialized = nextEntries.map((entry) => JSON.stringify(entry)).join('\n')
      await writeFile(this.telemetryFile, serialized ? `${serialized}\n` : '', 'utf8')
    })
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

  private persistSettings(): Promise<void> {
    const { apiKeyPresent, ...persistedSettings } = this.settings
    void apiKeyPresent
    return writeAtomicJson(this.settingsFile, persistedSettings)
  }

  private persistHistory(): Promise<void> {
    return writeAtomicJson(this.historyFile, this.history)
  }

  private async hasStoredApiKey(): Promise<boolean> {
    const apiKey = await this.getApiKey()
    return Boolean(apiKey)
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation)
    this.writeQueue = nextOperation.then(() => undefined, () => undefined)
    return nextOperation
  }

  private async writeHistoryAudio(
    entryId: string,
    payload: DictationAudioPayload,
  ): Promise<Pick<HistoryEntry, 'audioFilePath' | 'audioDurationMs' | 'audioMimeType' | 'audioBytes'>> {
    const extension = audioExtensionFromMimeType(payload.mimeType)
    const filePath = join(this.historyAudioDir, `${entryId}.${extension}`)
    await mkdir(this.historyAudioDir, { recursive: true })
    const buffer = Buffer.from(payload.audioBase64, 'base64')
    await writeFile(filePath, buffer)

    return {
      audioFilePath: filePath,
      audioDurationMs: payload.durationMs,
      audioMimeType: payload.mimeType,
      audioBytes: buffer.byteLength,
    }
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

const migrateRawSettings = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) {
    return raw
  }
  const data = raw as Record<string, unknown>
  // Migrate legacy theme value from before the light/dark/system enum was introduced.
  if (data.theme === 'dark-glass') {
    return { ...data, theme: 'dark' }
  }
  return data
}

const parsePersistedSettings = (settingsCandidate: unknown): Partial<Settings> | null => {
  const migrated = migrateRawSettings(settingsCandidate)
  const candidate = persistedSettingsSchema.safeParse(migrated)
  if (!candidate.success) {
    // If the whole object fails, try to salvage individual valid fields so
    // a single bad field does not wipe all user preferences.
    if (typeof migrated !== 'object' || migrated === null) {
      return null
    }
    const salvaged: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(migrated as Record<string, unknown>)) {
      const shape = persistedSettingsSchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>
      if (key in shape) {
        const result = shape[key].safeParse(value)
        if (result.success) {
          salvaged[key] = result.data
        }
      }
    }
    const salvagedCandidate = persistedSettingsSchema.safeParse(salvaged)
    return salvagedCandidate.success ? salvagedCandidate.data : null
  }

  return candidate.data
}

const parseHistory = (historyCandidate: unknown): HistoryEntry[] | null => {
  if (!Array.isArray(historyCandidate)) {
    return null
  }

  return historyCandidate
    .map((entry) => historyEntrySchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => entry.data)
}
