import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { withoutSystemFields, type SyncoreClient } from 'syncorejs'

import { api } from '../../../../syncore/_generated/api.js'
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
import { createAppSyncoreRuntime } from '../../../syncore-runtime.js'

const TELEMETRY_LIMIT = 10_000

const persistedSettingsSchema = settingsSchema.omit({ apiKeyPresent: true }).partial()

type PersistedSettings = Omit<Settings, 'apiKeyPresent'>

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

const toStoredSettings = (settings: Settings): PersistedSettings => {
  const { apiKeyPresent, ...persistedSettings } = settings
  void apiKeyPresent
  return persistedSettings
}

const toHistoryInput = (
  entry: HistoryEntry,
  audioPatch: Partial<HistoryEntry['audio']> = {},
) => ({
  externalId: entry.id,
  createdAt: entry.createdAt,
  outcome: entry.outcome,
  appName: entry.appName,
  windowTitle: entry.windowTitle,
  activationMode: entry.activationMode,
  modelId: entry.modelId,
  outputText: entry.outputText,
  errorMessage: entry.errorMessage,
  submittedContext: entry.submittedContext,
  usedContext: entry.usedContext,
  latencyMs: entry.latencyMs,
  audioProcessingMs: entry.audioProcessingMs,
  audioSendMs: entry.audioSendMs,
  timeToFirstTokenMs: entry.timeToFirstTokenMs,
  timeToCompleteMs: entry.timeToCompleteMs,
  insertionStrategy: entry.insertionStrategy,
  requestedMode: entry.requestedMode,
  effectiveMode: entry.effectiveMode,
  insertionMethod: entry.insertionMethod,
  fallbackUsed: entry.fallbackUsed,
  timing: entry.timing,
  durations: entry.durations,
  audio: {
    storageId: null,
    durationMs: entry.audio.durationMs,
    mimeType: entry.audio.mimeType,
    bytes: entry.audio.bytes,
    speechDetected: entry.audio.speechDetected,
    peakAmplitude: entry.audio.peakAmplitude,
    rmsAmplitude: entry.audio.rmsAmplitude,
    languageHint: entry.audio.languageHint,
    stopReason: entry.audio.stopReason,
    maxDurationReached: entry.audio.maxDurationReached,
    ...audioPatch,
  },
  llm: entry.llm,
  insertion: entry.insertion,
  context: entry.context,
  outcomeDetail: entry.outcomeDetail,
  text: entry.text,
})

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
  private ownedRuntime: ReturnType<typeof createAppSyncoreRuntime> | null = null
  private client: SyncoreClient | null

  constructor(client: SyncoreClient | null = null) {
    this.client = client
  }

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await mkdir(this.historyAudioDir, { recursive: true })
    await this.ensureClient()

    // The legacy JSON files are only ever read by this store. If one of them changed after the last import,
    // an older build (still writing JSON) ran against a profile that already had a Syncore database, so the
    // JSON is the newer source of truth: prefer its settings and import it again (the import is idempotent).
    const importStatus = await this.clientOrThrow().query(api.migration.status)
    const legacyChangedAfterImport = importStatus != null
      && await this.legacyFilesChangedSince(Date.parse(importStatus.updatedAt))

    const syncoreSettings = legacyChangedAfterImport ? null : await this.getPersistedSyncoreSettings()
    const settingsCandidate = syncoreSettings
      ?? await readJsonFile(this.settingsFile)
      ?? (legacyChangedAfterImport ? await this.getPersistedSyncoreSettings() : null)
    const persistedSettings = parsePersistedSettings(settingsCandidate) ?? {}
    this.settings = await this.buildCurrentSettings(persistedSettings)

    await this.clientOrThrow().mutation(api.settings.ensureInitialized, toStoredSettings(this.settings))

    if (!importStatus || legacyChangedAfterImport) {
      await this.importLegacyHistory()
      await this.importLegacyTelemetry()
      await this.clientOrThrow().mutation(api.migration.markLegacyImportCompleted, {
        completedAt: new Date().toISOString(),
      })
    }

    await this.reloadHistory()
    await this.pruneHistory()
    await this.reloadHistory()
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

  async shutdown(): Promise<void> {
    await this.flush()
    await this.ownedRuntime?.stop()
    this.ownedRuntime = null
    this.client = null
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
      await this.clientOrThrow().mutation(api.settings.patch, toStoredSettings(this.settings))
      await this.pruneHistory()
      await this.reloadHistory()
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
        await this.clientOrThrow().mutation(api.settings.patch, toStoredSettings(this.settings))
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
      await this.clientOrThrow().mutation(api.settings.patch, toStoredSettings(this.settings))
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
      const audioAsset = await this.readLegacyAudioForEntry(parsedEntry)
      if (audioAsset) {
        await this.clientOrThrow().mutation(api.history.appendWithAudio, {
          entry: toHistoryInput(parsedEntry),
          audioBase64: audioAsset.base64,
          mimeType: audioAsset.mimeType,
        })
      } else {
        await this.clientOrThrow().mutation(api.history.append, toHistoryInput(parsedEntry))
      }
      await this.pruneHistory()
      await this.reloadHistory()
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
      const buffer = Buffer.from(payload.audioBase64, 'base64')
      const parsedEntry = historyEntrySchema.parse({
        ...entry,
        audioFilePath: null,
        audioDurationMs: payload.durationMs,
        audioMimeType: payload.mimeType,
        audioBytes: buffer.byteLength,
        audio: {
          ...entry.audio,
          filePath: null,
          durationMs: payload.durationMs,
          mimeType: payload.mimeType,
          bytes: buffer.byteLength,
          speechDetected: payload.speechDetected ?? false,
          peakAmplitude: payload.peakAmplitude ?? 0,
          rmsAmplitude: payload.rmsAmplitude ?? 0,
          languageHint: payload.languageHint ?? null,
          stopReason: payload.stopReason ?? 'unknown',
          maxDurationReached: payload.maxDurationReached ?? false,
        },
      })

      await this.clientOrThrow().mutation(api.history.appendWithAudio, {
        entry: toHistoryInput(parsedEntry),
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
      })
      await this.pruneHistory()
      await this.reloadHistory()
    })
  }

  async clearHistory(): Promise<void> {
    await this.enqueueMutation(async () => {
      await this.clientOrThrow().mutation(api.history.clear)
      this.history = []
    })
  }

  async deleteHistoryEntry(entryId: string): Promise<void> {
    await this.enqueueMutation(async () => {
      await this.clientOrThrow().mutation(api.history.deleteEntry, { externalId: entryId })
      await this.reloadHistory()
    })
  }

  async getHistoryAudioAsset(entryId: string): Promise<{ mimeType: string; base64: string } | null> {
    return this.clientOrThrow().query(api.history.getAudio, { externalId: entryId })
  }

  async appendTelemetry(record: TelemetryRecord): Promise<void> {
    await this.enqueueMutation(async () => {
      const parsed = telemetryRecordSchema.parse(record)
      await this.clientOrThrow().mutation(api.telemetry.append, {
        externalId: parsed.id,
        timestamp: parsed.timestamp,
        kind: parsed.kind,
        name: parsed.name,
        detail: parsed.detail,
      })
    })
  }

  async readTelemetryTail(limit = 30): Promise<TelemetryRecord[]> {
    const rows = await this.clientOrThrow().query(api.telemetry.tail, { limit })
    return rows.map((row) => telemetryRecordSchema.parse(row))
  }

  private async ensureClient(): Promise<void> {
    if (this.client) {
      return
    }

    this.ownedRuntime = createAppSyncoreRuntime()
    await this.ownedRuntime.start()
    this.client = this.ownedRuntime.createClient()
  }

  private clientOrThrow(): SyncoreClient {
    if (!this.client) {
      throw new Error('Syncore client is not initialized.')
    }
    return this.client
  }

  private async getPersistedSyncoreSettings(): Promise<Partial<Settings> | null> {
    const settingsDoc = await this.clientOrThrow().query(api.settings.get)
    if (!settingsDoc) {
      return null
    }
    const { key, ...settings } = withoutSystemFields(settingsDoc)
    void key
    return settings
  }

  private async buildCurrentSettings(persistedSettings: Partial<Settings>): Promise<Settings> {
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

    return settingsSchema.parse({
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

  private async reloadHistory(): Promise<void> {
    const rows = await this.clientOrThrow().query(api.history.list)
    this.history = parseHistory(rows) ?? []
  }

  private async pruneHistory(): Promise<void> {
    const retentionMs = this.settings.historyRetentionDays * 24 * 60 * 60 * 1000
    const cutoff = Date.now() - retentionMs
    const sorted = [...this.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const keptEntries: HistoryEntry[] = []
    let usedAudioBytes = 0

    for (const entry of sorted) {
      if (new Date(entry.createdAt).getTime() < cutoff) {
        await this.clientOrThrow().mutation(api.history.deleteEntry, { externalId: entry.id })
        continue
      }

      const nextAudioBytes = usedAudioBytes + entry.audioBytes
      if (entry.audioBytes > 0 && nextAudioBytes > this.settings.maxHistoryAudioBytes) {
        await this.clientOrThrow().mutation(api.history.deleteEntry, { externalId: entry.id })
        continue
      }

      keptEntries.push(entry)
      usedAudioBytes = nextAudioBytes
    }

    this.history = keptEntries
  }

  private async legacyFilesChangedSince(importedAtMs: number): Promise<boolean> {
    if (Number.isNaN(importedAtMs)) {
      return false
    }

    for (const file of [this.settingsFile, this.historyFile, this.telemetryFile]) {
      try {
        if ((await stat(file)).mtimeMs > importedAtMs) {
          return true
        }
      } catch {
        // Missing legacy file: nothing newer to import from it.
      }
    }
    return false
  }

  private async importLegacyHistory(): Promise<void> {
    const historyCandidate = await readJsonFile(this.historyFile)
    const entries = parseHistory(historyCandidate) ?? []
    const existingRows = await this.clientOrThrow().query(api.history.list) as Array<{ id: string, audio: { storageId?: string | null } }>
    const idsWithStoredAudio = new Set(existingRows.filter((row) => row.audio.storageId).map((row) => row.id))
    for (const entry of entries) {
      // On a re-import, entries whose audio is already in Syncore keep it (append preserves it) instead of re-uploading.
      const audioAsset = idsWithStoredAudio.has(entry.id) ? null : await this.readLegacyAudioForEntry(entry)
      if (audioAsset) {
        await this.clientOrThrow().mutation(api.history.appendWithAudio, {
          entry: toHistoryInput(entry),
          audioBase64: audioAsset.base64,
          mimeType: audioAsset.mimeType,
        })
      } else {
        await this.clientOrThrow().mutation(api.history.append, toHistoryInput(entry))
      }
    }
  }

  private async importLegacyTelemetry(): Promise<void> {
    let raw = ''
    try {
      raw = await readFile(this.telemetryFile, 'utf8')
    } catch {
      return
    }

    // A crash mid-write can leave a truncated line; skip it rather than failing startup.
    const parseLine = (line: string): unknown => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    }

    const records = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => telemetryRecordSchema.safeParse(parseLine(line)))
      .filter((entry) => entry.success)
      .map((entry) => entry.data)
      .slice(-TELEMETRY_LIMIT)

    await this.clientOrThrow().mutation(api.telemetry.importLegacy, {
      records: records.map((record) => ({
        externalId: record.id,
        timestamp: record.timestamp,
        kind: record.kind,
        name: record.name,
        detail: record.detail,
      })),
    })
  }

  private async readLegacyAudioForEntry(
    entry: HistoryEntry,
  ): Promise<{ mimeType: string; base64: string } | null> {
    const filePath = entry.audioFilePath ?? entry.audio.filePath
    const mimeType = entry.audioMimeType ?? entry.audio.mimeType
    if (!filePath || !mimeType) {
      return null
    }

    try {
      const payload = await readFile(filePath)
      return {
        mimeType,
        base64: payload.toString('base64'),
      }
    } catch {
      return null
    }
  }

}

const migrateRawSettings = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) {
    return raw
  }
  const data = raw as Record<string, unknown>
  if (data.theme === 'dark-glass') {
    return { ...data, theme: 'dark' }
  }
  return data
}

const parsePersistedSettings = (settingsCandidate: unknown): Partial<Settings> | null => {
  const migrated = migrateRawSettings(settingsCandidate)
  const candidate = persistedSettingsSchema.safeParse(migrated)
  if (!candidate.success) {
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
