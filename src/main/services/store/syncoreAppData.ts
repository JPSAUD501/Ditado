import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { api } from '../../../../syncore/_generated/api.js'
import type { createAppSyncoreRuntime } from '../../../syncore-runtime.js'
import {
  defaultPushToTalkHotkey,
  defaultSettings,
  defaultToggleHotkey,
} from '../../../shared/defaults.js'
import {
  dictationAudioPayloadSchema,
  historyEntrySchema,
  settingsSchema,
  dictationSessionSchema,
  type DictationAudioPayload,
  type DictationSession,
  type HistoryEntry,
  type Settings,
} from '../../../shared/contracts.js'
import { normalizeHotkey } from '../../../shared/hotkeys.js'
import { requiresUpgradeOnboarding } from '../../../shared/versioning.js'

type SyncoreClient = ReturnType<ReturnType<typeof createAppSyncoreRuntime>['createClient']>

const ensureParentDir = async (filePath: string): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true })
}

const stripGeneratedFields = <T extends Record<string, unknown>>(value: T): Omit<T, '_id' | '_creationTime'> => {
  const { _id, _creationTime, ...rest } = value
  void _id
  void _creationTime
  return rest
}

export class SyncoreAppData {
  private readonly secretFile = join(app.getPath('userData'), 'openrouter.secure.bin')
  private settings: Settings = defaultSettings
  private history: HistoryEntry[] = []

  constructor(private readonly client: SyncoreClient) {}

  async initialize(): Promise<void> {
    await this.client.mutation(api.settings.ensure, { appVersion: app.getVersion() })
    await this.client.mutation(api.sessions.finalizeInterruptedActive)
    await this.applyVersionStartupState()
    await this.refreshSettings()
    await this.refreshHistory()
    await this.scheduleMaintenance()
  }

  getSettings(): Settings {
    return this.settings
  }

  getHistory(): HistoryEntry[] {
    return [...this.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getActiveSession(): Promise<DictationSession | null> {
    return this.parseSession(await this.client.query(api.sessions.active))
  }

  async startSession(session: DictationSession): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.start, {
      sessionId: session.id,
      activationMode: session.activationMode,
      startedAt: session.startedAt,
      targetApp: session.targetApp,
      context: session.context,
      insertionPlan: session.insertionPlan,
    })
    return this.getActiveSession()
  }

  async updateSessionContext(sessionId: string, targetApp: string, context: DictationSession['context']): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.updateContext, { sessionId, targetApp, context })
    return this.getActiveSession()
  }

  async markSessionListening(sessionId: string): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.markListening, { sessionId })
    return this.getActiveSession()
  }

  async markSessionRecorderFailed(
    sessionId: string,
    status: 'error' | 'permission-required',
    errorMessage: string,
    finishedAt: string,
  ): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.markRecorderFailed, { sessionId, status, errorMessage, finishedAt })
    return this.getActiveSession()
  }

  async requestSessionStop(sessionId: string, processingStartedAt: string): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.requestStop, { sessionId, processingStartedAt })
    return this.getActiveSession()
  }

  async markSessionProcessing(
    sessionId: string,
    processingStartedAt: string,
    targetApp: string,
    context: DictationSession['context'],
    insertionPlan: DictationSession['insertionPlan'],
  ): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.markProcessing, {
      sessionId,
      processingStartedAt,
      targetApp,
      context,
      insertionPlan,
    })
    return this.getActiveSession()
  }

  async appendSessionPartial(sessionId: string, partialText: string): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.appendPartial, { sessionId, partialText })
    return this.getActiveSession()
  }

  async completeSession(
    sessionId: string,
    finishedAt: string,
    finalText: string,
    partialText: string,
  ): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.complete, { sessionId, finishedAt, finalText, partialText })
    return this.getActiveSession()
  }

  async failSession(
    sessionId: string,
    finishedAt: string,
    errorMessage: string,
    partialText: string,
  ): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.fail, { sessionId, finishedAt, errorMessage, partialText })
    return this.getActiveSession()
  }

  async showSessionNotice(session: DictationSession): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.notice, {
      sessionId: session.id,
      activationMode: session.activationMode,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt ?? session.startedAt,
      targetApp: session.targetApp,
      context: session.context,
      insertionPlan: session.insertionPlan,
      noticeMessage: session.noticeMessage ?? '',
    })
    return this.getActiveSession()
  }

  async cancelSession(sessionId: string, finishedAt: string): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.cancel, { sessionId, finishedAt })
    return this.getActiveSession()
  }

  async dismissCurrentSession(): Promise<DictationSession | null> {
    await this.client.mutation(api.sessions.dismissCurrent)
    return this.getActiveSession()
  }

  async flush(): Promise<void> {
    return undefined
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const previousRetentionDays = this.settings.historyRetentionDays
    const previousMaxHistoryAudioBytes = this.settings.maxHistoryAudioBytes
    const normalizedPatch: Partial<Settings> = { ...patch }
    delete normalizedPatch.apiKeyPresent
    delete normalizedPatch.autoUpdateEnabled

    if (typeof normalizedPatch.pushToTalkHotkey === 'string') {
      normalizedPatch.pushToTalkHotkey =
        normalizeHotkey(normalizedPatch.pushToTalkHotkey) ?? this.settings.pushToTalkHotkey
    }
    if (typeof normalizedPatch.toggleHotkey === 'string') {
      normalizedPatch.toggleHotkey =
        normalizeHotkey(normalizedPatch.toggleHotkey) ?? this.settings.toggleHotkey
    }

    await this.client.mutation(api.settings.update, {
      patch: {
        ...normalizedPatch,
        autoUpdateEnabled: true,
      },
    })
    await this.refreshSettings()
    if (
      this.settings.historyRetentionDays !== previousRetentionDays ||
      this.settings.maxHistoryAudioBytes !== previousMaxHistoryAudioBytes
    ) {
      await this.scheduleMaintenance()
    }
    return this.settings
  }

  async setApiKey(apiKey: string): Promise<Settings> {
    if (!apiKey.trim()) {
      await rm(this.secretFile, { force: true })
      await this.refreshSettings()
      return this.settings
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure local storage is unavailable on this system.')
    }

    await ensureParentDir(this.secretFile)
    await writeFile(this.secretFile, safeStorage.encryptString(apiKey.trim()))
    await this.refreshSettings()
    return this.settings
  }

  async getApiKey(): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) {
      return null
    }

    try {
      const payload = await readFile(this.secretFile)
      return payload.length ? safeStorage.decryptString(payload) : null
    } catch {
      return null
    }
  }

  async appendHistoryWithAudio(
    entry: Record<string, unknown> & { id: string; audio?: Record<string, unknown> },
    payload: DictationAudioPayload,
  ): Promise<void> {
    const parsedPayload = dictationAudioPayloadSchema.parse(payload)
    const parsedEntry = historyEntrySchema.parse({
      ...entry,
      audioFilePath: null,
      audioDurationMs: parsedPayload.durationMs,
      audioMimeType: parsedPayload.mimeType,
      audioBytes: Buffer.from(parsedPayload.audioBase64, 'base64').byteLength,
      audio: {
        ...entry.audio,
        filePath: null,
        durationMs: parsedPayload.durationMs,
        mimeType: parsedPayload.mimeType,
        bytes: Buffer.from(parsedPayload.audioBase64, 'base64').byteLength,
      },
    })
    await this.client.mutation(api.history.appendWithAudio, {
      entry: parsedEntry,
      audio: {
        audioBase64: parsedPayload.audioBase64,
        mimeType: parsedPayload.mimeType,
        durationMs: parsedPayload.durationMs,
      },
    })
    await this.refreshHistory()
  }

  async clearHistory(): Promise<void> {
    await this.client.mutation(api.history.clear)
    await this.refreshHistory()
  }

  async deleteHistoryEntry(entryId: string): Promise<void> {
    await this.client.mutation(api.history.remove, { sessionId: entryId })
    await this.refreshHistory()
  }

  private async refreshSettings(): Promise<void> {
    const stored = await this.client.query(api.settings.get)
    if (!stored) {
      throw new Error('Syncore settings are not initialized.')
    }
    const data = stripGeneratedFields(stored as unknown as Record<string, unknown>)
    this.settings = settingsSchema.parse({
      ...defaultSettings,
      ...data,
      autoUpdateEnabled: true,
      apiKeyPresent: Boolean(await this.getApiKey()),
    })
  }

  private async refreshHistory(): Promise<void> {
    const entries = await this.client.query(api.history.list) as unknown as Array<Record<string, unknown>>
    this.history = entries.map((entry: Record<string, unknown>) => {
      const data = stripGeneratedFields(entry)
      const { sessionId, createdAtMs, searchText, ...historyEntry } = data
      void sessionId
      void createdAtMs
      void searchText
      const audio = historyEntry.audio as { filePath: string | null; durationMs: number; mimeType: string | null; bytes: number }
      return historyEntrySchema.parse({
        ...historyEntry,
        id: data.sessionId,
        audioFilePath: audio.filePath,
        audioDurationMs: audio.durationMs,
        audioMimeType: audio.mimeType,
        audioBytes: audio.bytes,
      })
    })
  }

  private parseSession(value: unknown): DictationSession | null {
    if (!value) {
      return null
    }
    return dictationSessionSchema.parse(value)
  }

  private async applyVersionStartupState(): Promise<void> {
    const stored = await this.client.query(api.settings.get)
    if (!stored) {
      return
    }
    const lastSeenAppVersion = stored.lastSeenAppVersion
    const isFirstRun = lastSeenAppVersion == null
    const isUpgrade = lastSeenAppVersion != null && lastSeenAppVersion !== app.getVersion()
    if (!isUpgrade) {
      return
    }

    const shouldRunUpgradeOnboarding = requiresUpgradeOnboarding(app.getVersion(), lastSeenAppVersion)
    await this.client.mutation(api.settings.update, {
      patch: {
        lastSeenAppVersion: app.getVersion(),
        pendingStartupUpdatedNoticeVersion: isFirstRun ? null : app.getVersion(),
        pendingUpgradeOnboardingVersion: shouldRunUpgradeOnboarding ? app.getVersion() : null,
        pushToTalkHotkey: shouldRunUpgradeOnboarding ? defaultPushToTalkHotkey : stored.pushToTalkHotkey,
        toggleHotkey: shouldRunUpgradeOnboarding ? defaultToggleHotkey : stored.toggleHotkey,
      },
    })
  }

  private async scheduleMaintenance(): Promise<void> {
    await this.client.mutation(api.maintenance.schedulePrune, {
      retentionDays: this.settings.historyRetentionDays,
      maxAudioBytes: this.settings.maxHistoryAudioBytes,
      delayMs: 0,
    })
  }
}
