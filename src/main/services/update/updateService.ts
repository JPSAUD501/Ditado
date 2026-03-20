import { app } from 'electron'
import electronUpdater, { type AppUpdater } from 'electron-updater'

import type { UpdateState } from '../../../shared/contracts.js'
import { defaultUpdateState } from '../../../shared/defaults.js'
import type { AppStore } from '../store/appStore.js'

const getTargetChannel = (channel: UpdateState['channel']): string => (channel === 'beta' ? 'beta' : 'latest')

const isPrereleaseVersion = (version: string): boolean => version.includes('-')

type StateListener = (state: UpdateState) => void

const getDefaultUpdater = (): AppUpdater => electronUpdater.autoUpdater

export class UpdateService {
  private state: UpdateState = defaultUpdateState
  private initialized = false
  private installingUpdate = false
  private readonly listeners = new Set<StateListener>()

  constructor(
    private readonly store: AppStore,
    private readonly onStateChanged: StateListener = () => undefined,
    private readonly updater: AppUpdater = getDefaultUpdater(),
    private readonly isPackaged: boolean = app.isPackaged,
    private readonly appVersion: string = app.getVersion(),
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.initialized = true
    this.bindUpdaterEvents()
    this.syncFromSettings()
  }

  syncFromSettings(): void {
    const settings = this.store.getSettings()
    const enabled = settings.autoUpdateEnabled
    const channel = settings.updateChannel

    this.updater.autoDownload = enabled
    this.updater.autoInstallOnAppQuit = true
    this.updater.allowPrerelease = channel === 'beta' || isPrereleaseVersion(this.appVersion)
    ;(this.updater as AppUpdater & { channel?: string }).channel = getTargetChannel(channel)

    this.setState({
      enabled,
      channel,
      status: enabled ? (this.isPackaged ? 'idle' : 'unsupported') : 'disabled',
    })
  }

  getState(): UpdateState {
    return this.state
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  isInstallingUpdate(): boolean {
    return this.installingUpdate
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!this.state.enabled) {
      this.setState({ status: 'disabled' })
      return this.state
    }

    if (!this.isPackaged) {
      this.setState({ status: 'unsupported' })
      return this.state
    }

    if (this.state.status === 'checking' || this.state.status === 'downloading') {
      return this.state
    }

    try {
      await this.updater.checkForUpdates()
    } catch {
      this.setState({
        status: 'error',
        lastCheckedAt: new Date().toISOString(),
      })
    }

    return this.state
  }

  async downloadUpdate(): Promise<void> {
    if (!this.isPackaged) return
    if (this.state.status !== 'available') return
    try {
      await this.updater.downloadUpdate()
    } catch {
      this.setState({
        status: 'error',
        lastCheckedAt: new Date().toISOString(),
      })
    }
  }

  installUpdate(options?: { silent?: boolean }): void {
    if (!this.isPackaged || this.state.status !== 'downloaded' || this.installingUpdate) {
      return
    }

    const silent = options?.silent ?? false
    this.installingUpdate = true
    this.setState({
      status: 'installing',
      downloadProgress: null,
    })

    setTimeout(() => {
      this.updater.quitAndInstall(silent, true)
    }, 120)
  }

  private bindUpdaterEvents(): void {
    this.updater.on('checking-for-update', () => {
      this.setState({
        status: 'checking',
        lastCheckedAt: new Date().toISOString(),
      })
    })

    this.updater.on('update-available', () => {
      this.setState({
        status: 'available',
        lastCheckedAt: new Date().toISOString(),
        downloadProgress: null,
      })
    })

    this.updater.on('update-not-available', () => {
      this.setState({
        status: 'idle',
        lastCheckedAt: new Date().toISOString(),
        downloadProgress: null,
      })
    })

    this.updater.on('download-progress', (info) => {
      this.setState({
        status: 'downloading',
        downloadProgress: info?.percent != null ? Math.round(info.percent) : null,
      })
    })

    this.updater.on('update-downloaded', () => {
      this.setState({
        status: 'downloaded',
        lastCheckedAt: new Date().toISOString(),
        downloadProgress: null,
      })
    })

    this.updater.on('error', () => {
      this.installingUpdate = false
      this.setState({
        status: 'error',
        lastCheckedAt: new Date().toISOString(),
        downloadProgress: null,
      })
    })
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = {
      ...this.state,
      ...patch,
    }
    for (const listener of this.listeners) {
      listener(this.state)
    }
    this.onStateChanged(this.state)
  }
}
