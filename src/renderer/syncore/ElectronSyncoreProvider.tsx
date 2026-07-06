import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { SyncoreClient } from 'syncorejs'
import { createRendererSyncoreWindowClient } from 'syncorejs/node/ipc'
import { SyncoreProvider } from 'syncorejs/react'

type DisposableSyncoreClient = SyncoreClient & {
  dispose?: () => void
}

let rendererClient: DisposableSyncoreClient | null = null
let unloadListenerRegistered = false

const getRendererClient = (): DisposableSyncoreClient => {
  if (!rendererClient) {
    rendererClient = createRendererSyncoreWindowClient(window) as DisposableSyncoreClient
  }

  if (!unloadListenerRegistered) {
    window.addEventListener('beforeunload', () => {
      rendererClient?.dispose?.()
      rendererClient = null
      unloadListenerRegistered = false
    }, { once: true })
    unloadListenerRegistered = true
  }

  return rendererClient
}

export const ElectronSyncoreProvider = ({ children }: { children: ReactNode }) => {
  const client = useMemo(() => getRendererClient(), [])

  return (
    <SyncoreProvider client={client}>
      {children}
    </SyncoreProvider>
  )
}
