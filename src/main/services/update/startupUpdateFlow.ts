import type { UpdateState } from '../../../shared/contracts.js'

const DEFAULT_UPDATE_FAILURE_NOTICE_MS = 2_000

export type StartupUpdateResult = 'continue' | 'installing'

interface StartupUpdateController {
  getState: () => UpdateState
  subscribe: (listener: (state: UpdateState) => void) => () => void
  checkForUpdates: () => Promise<UpdateState>
  downloadUpdate: () => Promise<void>
  installUpdate: (options?: { silent?: boolean }) => void
}

interface RunStartupUpdateFlowOptions {
  updates: StartupUpdateController
  showNotice: (message: string) => void
  waitMs?: (ms: number) => Promise<void>
  failureNoticeMs?: number
}

const defaultWaitMs = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const runStartupUpdateFlow = async ({
  updates,
  showNotice,
  waitMs = defaultWaitMs,
  failureNoticeMs = DEFAULT_UPDATE_FAILURE_NOTICE_MS,
}: RunStartupUpdateFlowOptions): Promise<StartupUpdateResult> =>
  new Promise((resolve) => {
    let settled = false
    let checkingStarted = false
    let updatingNoticeShown = false
    let downloadTriggered = false

    const finish = (result: StartupUpdateResult): void => {
      if (settled) {
        return
      }

      settled = true
      unsubscribe()
      resolve(result)
    }

    const finishAfterFailure = async (): Promise<void> => {
      if (settled) {
        return
      }

      showNotice('notices.updateFailed')
      await waitMs(failureNoticeMs)
      finish('continue')
    }

    const ensureUpdatingNotice = (): void => {
      if (updatingNoticeShown) {
        return
      }

      updatingNoticeShown = true
      showNotice('notices.updating')
    }

    const handleState = (state: UpdateState): void => {
      if (settled) {
        return
      }

      switch (state.status) {
        case 'disabled':
        case 'unsupported':
          finish('continue')
          return
        case 'idle':
          if (checkingStarted) {
            finish('continue')
          }
          return
        case 'available':
          ensureUpdatingNotice()
          if (!downloadTriggered) {
            downloadTriggered = true
            void updates.downloadUpdate().catch(() => undefined)
          }
          return
        case 'downloading':
          ensureUpdatingNotice()
          return
        case 'downloaded':
          ensureUpdatingNotice()
          updates.installUpdate({ silent: true })
          finish('installing')
          return
        case 'installing':
          ensureUpdatingNotice()
          finish('installing')
          return
        case 'error':
          void finishAfterFailure()
          return
        case 'checking':
        default:
          return
      }
    }

    const unsubscribe = updates.subscribe((state) => {
      handleState(state)
    })

    checkingStarted = true
    void updates
      .checkForUpdates()
      .then((state) => {
        handleState(state)
      })
      .catch(() => {
        void finishAfterFailure()
      })
  })
