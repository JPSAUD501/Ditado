import type { PermissionState } from '@shared/contracts'

export const shouldShowMicrophoneGrantButton = (
  permission: PermissionState['microphone'],
  deviceCount: number,
): boolean =>
  permission === 'not-determined' ||
  permission === 'denied' ||
  permission === 'restricted' ||
  (permission === 'unknown' && deviceCount === 0)
