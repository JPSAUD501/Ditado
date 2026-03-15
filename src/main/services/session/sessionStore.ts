import type { DictationSession } from '../../../shared/contracts.js'

type SessionListener = (session: DictationSession | null) => void

export class SessionStore {
  private listeners = new Set<SessionListener>()
  private currentSession: DictationSession | null = null

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener)
    listener(this.currentSession)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get(): DictationSession | null {
    return this.currentSession
  }

  set(session: DictationSession | null): void {
    this.currentSession = session
    for (const listener of this.listeners) {
      listener(this.currentSession)
    }
  }
}
