import { contextBridge, ipcRenderer } from 'electron'

import type {
  DashboardTab,
  DashboardViewModel,
  DeviceInfo,
  DictationAudioPayload,
  HistoryAudioAsset,
  OverlayViewModel,
  PermissionState,
  Settings,
  TelemetryRecord,
} from '../shared/contracts.js'
import { ipcChannels } from '../shared/ipc.js'

const subscribe = <T,>(channel: string, listener: (payload: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => {
    listener(payload)
  }
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const requestRendererMicrophoneAccess = async (): Promise<'granted' | 'denied'> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'denied'
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    return 'granted'
  } catch {
    return 'denied'
  }
}

contextBridge.exposeInMainWorld('ditado', {
  getOverlayState: () => ipcRenderer.invoke(ipcChannels.overlay.getState),
  getDashboardState: () => ipcRenderer.invoke(ipcChannels.dashboard.getState),
  subscribeOverlayState: (listener: (state: OverlayViewModel) => void) =>
    subscribe(ipcChannels.overlay.state, listener),
  subscribeDashboardState: (listener: (state: DashboardViewModel) => void) =>
    subscribe(ipcChannels.dashboard.state, listener),
  startPushToTalk: () => ipcRenderer.invoke(ipcChannels.dictation.startPushToTalk),
  stopPushToTalk: (payload: DictationAudioPayload) => ipcRenderer.invoke(ipcChannels.dictation.stopPushToTalk, payload),
  toggleDictation: (payload?: DictationAudioPayload) => ipcRenderer.invoke(ipcChannels.dictation.toggle, payload),
  cancelDictation: () => ipcRenderer.invoke(ipcChannels.dictation.cancel),
  notifyRecorderStarted: (sessionId: string) => ipcRenderer.invoke(ipcChannels.dictation.recorderStarted, sessionId),
  notifyRecorderFailed: (sessionId: string, reason: string) =>
    ipcRenderer.invoke(ipcChannels.dictation.recorderFailed, sessionId, reason),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(ipcChannels.settings.update, patch),
  setApiKey: (apiKey: string) => ipcRenderer.invoke(ipcChannels.settings.setApiKey, apiKey),
setHotkeyCaptureActive: (active: boolean) => ipcRenderer.invoke(ipcChannels.hotkeys.setCaptureMode, active),
  getShortcutStatus: (): Promise<{ captureActive: boolean; uiohookRunning: boolean }> => ipcRenderer.invoke(ipcChannels.hotkeys.getStatus),
  listMicrophones: async (): Promise<DeviceInfo[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return []
    }

    let devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter((device) => device.kind === 'audioinput')

    if (!audioInputs.some((device) => device.label)) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        devices = await navigator.mediaDevices.enumerateDevices()
      } catch {
        // Keep best-effort enumeration even when permission is still blocked.
      }
    }

    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || 'System microphone',
        kind: 'audioinput' as const,
      }))
  },
  requestMicrophoneAccess: async (): Promise<PermissionState> => {
    const rendererStatus = await requestRendererMicrophoneAccess()
    const permissionState = (await ipcRenderer.invoke(ipcChannels.permissions.requestMicrophone)) as PermissionState
    return {
      ...permissionState,
      microphone: rendererStatus === 'granted' ? 'granted' : permissionState.microphone,
    }
  },
  getPermissions: (): Promise<PermissionState> => ipcRenderer.invoke(ipcChannels.permissions.get),
  openDashboardTab: (tab: DashboardTab) => ipcRenderer.invoke(ipcChannels.dashboardNavigation.openTab, tab),
  clearHistory: () => ipcRenderer.invoke(ipcChannels.history.clear),
  deleteHistoryEntry: (entryId: string) => ipcRenderer.invoke(ipcChannels.history.deleteEntry, entryId),
  getHistoryAudio: (entryId: string): Promise<HistoryAudioAsset | null> => ipcRenderer.invoke(ipcChannels.history.audio, entryId),
  getTelemetryTail: (): Promise<TelemetryRecord[]> => ipcRenderer.invoke(ipcChannels.telemetry.tail),
  checkForUpdates: () => ipcRenderer.invoke(ipcChannels.updates.check),
  downloadUpdate: () => ipcRenderer.invoke(ipcChannels.updates.download),
  installUpdate: () => ipcRenderer.invoke(ipcChannels.updates.install),
  openExternalUrl: (url: string) => ipcRenderer.invoke(ipcChannels.shell.openExternal, url),
  sendAudioLevel: (level: number) => {
    ipcRenderer.send(ipcChannels.dictation.audioLevel, level)
  },
  subscribeAudioLevel: (listener: (level: number) => void) =>
    subscribe(ipcChannels.dictation.audioLevel, listener),
})
