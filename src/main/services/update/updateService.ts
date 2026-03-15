import type { UpdateState } from '../../../shared/contracts.js'
import { defaultUpdateState } from '../../../shared/defaults.js'
import type { AppStore } from '../store/appStore.js'

export class UpdateService {
  private state: UpdateState = defaultUpdateState

  constructor(private readonly store: AppStore) {
    this.syncFromSettings()
  }

  syncFromSettings(): void {
    const settings = this.store.getSettings()
    this.state = {
      ...this.state,
      enabled: settings.autoUpdateEnabled,
      channel: settings.updateChannel,
      status: settings.autoUpdateEnabled ? 'idle' : 'disabled',
    }
  }

  getState(): UpdateState {
    return this.state
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!this.state.enabled) {
      this.state = { ...this.state, status: 'disabled' }
      return this.state
    }

    this.state = { ...this.state, status: 'checking' }
    this.state = {
      ...this.state,
      status: 'ready',
      lastCheckedAt: new Date().toISOString(),
    }
    return this.state
  }
}
