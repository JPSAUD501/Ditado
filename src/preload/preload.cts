import { contextBridge, ipcRenderer } from 'electron'
import { installSyncoreWindowBridge } from 'syncorejs/node/ipc'

import type {
  DashboardTab,
  DashboardNativeState,
  DeviceInfo,
  DictationAudioPayload,
  PermissionState,
  RecorderWarmupStatus,
} from '../shared/contracts.js'
import type { HotkeyCapturePayload } from '../shared/hotkeys.js'
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

eval(installSyncoreWindowBridge())

contextBridge.exposeInMainWorld('ditado', {
  getDashboardNativeState: (): Promise<DashboardNativeState> =>
    ipcRenderer.invoke(ipcChannels.dashboard.getNativeState),
  subscribeDashboardNativeState: (listener: (state: DashboardNativeState) => void) =>
    subscribe(ipcChannels.dashboard.nativeState, listener),
  subscribeDashboardTabRequests: (listener: (tab: DashboardTab) => void) =>
    subscribe(ipcChannels.dashboard.openTab, listener),
  startPushToTalk: () => ipcRenderer.invoke(ipcChannels.dictation.startPushToTalk),
  stopPushToTalk: (payload: DictationAudioPayload) => ipcRenderer.invoke(ipcChannels.dictation.stopPushToTalk, payload),
  toggleDictation: (payload?: DictationAudioPayload) => ipcRenderer.invoke(ipcChannels.dictation.toggle, payload),
  cancelDictation: () => ipcRenderer.invoke(ipcChannels.dictation.cancel),
  setOnboardingDictationEnabled: (enabled: boolean) =>
    ipcRenderer.invoke(ipcChannels.dictation.setOnboardingEnabled, enabled),
  notifyRecorderStarted: (sessionId: string) => ipcRenderer.invoke(ipcChannels.dictation.recorderStarted, sessionId),
  notifyRecorderFailed: (sessionId: string, reason: string) =>
    ipcRenderer.invoke(ipcChannels.dictation.recorderFailed, sessionId, reason),
  notifyRecorderReady: () => ipcRenderer.invoke(ipcChannels.startup.recorderReady),
  notifyRecorderWarmupFinished: (status: RecorderWarmupStatus) =>
    ipcRenderer.invoke(ipcChannels.startup.recorderWarmupFinished, status),
  setHotkeyCaptureActive: (active: boolean) => ipcRenderer.invoke(ipcChannels.hotkeys.setCaptureMode, active),
  getShortcutStatus: (): Promise<{ captureActive: boolean; uiohookRunning: boolean }> => ipcRenderer.invoke(ipcChannels.hotkeys.getStatus),
  subscribeHotkeyCapture: (listener: (payload: HotkeyCapturePayload) => void) =>
    subscribe(ipcChannels.hotkeys.captureUpdate, listener),
  listMicrophones: async (): Promise<DeviceInfo[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return []
    }

    const devices = await navigator.mediaDevices.enumerateDevices()

    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || 'System microphone',
        kind: 'audioinput' as const,
      }))
  },
  requestMicrophoneAccess: async (): Promise<PermissionState> => {
    const permissionState = (await ipcRenderer.invoke(ipcChannels.permissions.requestMicrophone)) as PermissionState
    if (permissionState.microphone !== 'granted') {
      return permissionState
    }

    const rendererStatus = await requestRendererMicrophoneAccess()
    return {
      ...permissionState,
      microphone: rendererStatus === 'granted' ? 'granted' : permissionState.microphone,
    }
  },
  getPermissions: (): Promise<PermissionState> => ipcRenderer.invoke(ipcChannels.permissions.get),
  openDashboardTab: (tab: DashboardTab) => ipcRenderer.invoke(ipcChannels.dashboardNavigation.openTab, tab),
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
