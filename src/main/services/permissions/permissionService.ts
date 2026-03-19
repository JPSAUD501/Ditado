import { shell, systemPreferences } from 'electron'

import type { PermissionState } from '../../../shared/contracts.js'

export class PermissionService {
  private static readonly MAC_MICROPHONE_SETTINGS_URL =
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'

  async getState(): Promise<PermissionState> {
    return {
      microphone: this.getMicrophoneState(),
      accessibility: this.getAccessibilityState(),
    }
  }

  async requestMicrophoneAccess(): Promise<PermissionState> {
    if (process.platform === 'darwin') {
      const currentState = this.getMicrophoneState()

      if (currentState === 'not-determined' && typeof systemPreferences.askForMediaAccess === 'function') {
        await systemPreferences.askForMediaAccess('microphone')
      } else if ((currentState === 'denied' || currentState === 'restricted')) {
        await shell.openExternal(PermissionService.MAC_MICROPHONE_SETTINGS_URL).catch(() => undefined)
      }
    }

    return this.getState()
  }

  private getMicrophoneState(): PermissionState['microphone'] {
    try {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status === 'granted' || status === 'denied' || status === 'not-determined' || status === 'restricted') {
        return status
      }
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private getAccessibilityState(): PermissionState['accessibility'] {
    if (process.platform === 'darwin' && typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
      return systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'
    }

    if (process.platform === 'win32') {
      return 'granted'
    }

    return 'unknown'
  }
}
