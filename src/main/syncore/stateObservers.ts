import type { SyncoreClient, SyncoreWatch } from 'syncorejs'

import { api } from '../../../syncore/_generated/api.js'
import type {
  DictationSession,
  Settings,
  SettingsDocument,
  StoredSettings,
} from '../../shared/contracts.js'

type SettingsListener = (settings: StoredSettings, previous: StoredSettings) => void
type SessionListener = (session: DictationSession | null) => void

const toStoredSettings = (document: SettingsDocument): StoredSettings => {
  const { _id, _creationTime, key, updatedAt, ...settings } = document
  void _id
  void _creationTime
  void key
  void updatedAt
  return settings
}

export class SyncoreStateObservers {
  private settings: StoredSettings | null = null
  private session: DictationSession | null = null
  private settingsWatch: SyncoreWatch<SettingsDocument | null> | null = null
  private sessionWatch: SyncoreWatch<DictationSession | null> | null = null
  private readonly settingsListeners = new Set<SettingsListener>()
  private readonly sessionListeners = new Set<SessionListener>()

  constructor(private readonly client: SyncoreClient) {}

  async start(): Promise<void> {
    const [settings, session] = await Promise.all([
      this.client.query(api.settings.get),
      this.client.query(api.sessions.active),
    ])
    if (!settings) {
      throw new Error('Syncore settings are not initialized.')
    }
    this.settings = toStoredSettings(settings)
    this.session = session

    this.settingsWatch = this.client.watchQuery(api.settings.get)
    this.settingsWatch.onUpdate(() => {
      const document = this.settingsWatch?.localQueryResult()
      if (!document || !this.settings) {
        return
      }
      const previous = this.settings
      this.settings = toStoredSettings(document)
      for (const listener of this.settingsListeners) {
        listener(this.settings, previous)
      }
    })

    this.sessionWatch = this.client.watchQuery(api.sessions.active)
    this.sessionWatch.onUpdate(() => {
      const next = this.sessionWatch?.localQueryResult()
      if (next === undefined) {
        return
      }
      this.session = next
      for (const listener of this.sessionListeners) {
        listener(next)
      }
    })
  }

  getSettings(apiKeyPresent: boolean): Settings {
    if (!this.settings) {
      throw new Error('Syncore settings observer has not started.')
    }
    return { ...this.settings, apiKeyPresent }
  }

  getSession(): DictationSession | null {
    return this.session
  }

  onSettings(listener: SettingsListener): () => void {
    this.settingsListeners.add(listener)
    return () => this.settingsListeners.delete(listener)
  }

  onSession(listener: SessionListener): () => void {
    this.sessionListeners.add(listener)
    return () => this.sessionListeners.delete(listener)
  }

  dispose(): void {
    this.settingsWatch?.dispose?.()
    this.sessionWatch?.dispose?.()
    this.settingsWatch = null
    this.sessionWatch = null
    this.settingsListeners.clear()
    this.sessionListeners.clear()
  }
}
