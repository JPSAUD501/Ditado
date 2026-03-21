import type { DictationSession } from '@shared/contracts'
import type { UiSoundName } from '@shared/uiSounds'

const isShortPressNotice = (session: DictationSession | null): boolean =>
  session?.status === 'notice' && (
    session.noticeMessage?.startsWith('notices.holdToDictate::') === true ||
    session.noticeMessage === 'notices.doubleTapToToggle'
  )

const isNewShortPressNotice = (previous: DictationSession | null, next: DictationSession): boolean =>
  isShortPressNotice(next)
  && (
    previous?.id !== next.id
    || previous?.status !== next.status
    || previous?.noticeMessage !== next.noticeMessage
  )

const isStartTransition = (previous: DictationSession | null, next: DictationSession): boolean =>
  next.captureIntent === 'start'
  && (
    // Push-to-talk: fire as soon as capture starts arming. The shortcut layer
    // now delays startCapture long enough to distinguish a real hold from a
    // double tap, so arming is the first reliable "start" signal again.
    (next.activationMode === 'push-to-talk' && ['arming', 'listening'].includes(next.status))
    // Toggle: fire on arming (the user intentionally started toggle mode)
    || (next.activationMode === 'toggle' && ['arming', 'listening'].includes(next.status))
  )
  && (previous?.id !== next.id || previous.captureIntent !== 'start')

const isStopTransition = (previous: DictationSession | null, next: DictationSession): boolean =>
  previous?.id === next.id
  && previous.captureIntent !== 'stop'
  && next.captureIntent === 'stop'
  && next.status === 'processing'

export const getUiSoundForSessionTransition = (
  previous: DictationSession | null,
  next: DictationSession | null,
): UiSoundName | null => {
  if (!next) {
    return null
  }

  if (isNewShortPressNotice(previous, next)) {
    return 'pttTooShort'
  }

  if (isStartTransition(previous, next)) {
    // Suppress pttStart on the second tap of a double-tap gesture (previous was the short-press hint)
    if (next.activationMode === 'push-to-talk' && isShortPressNotice(previous)) {
      return null
    }
    return next.activationMode === 'push-to-talk' ? 'pttStart' : 'tttStart'
  }

  if (isStopTransition(previous, next)) {
    return next.activationMode === 'push-to-talk' ? 'pttEnd' : 'tttEnd'
  }

  if (next.status === 'completed' && previous?.status !== 'completed') {
    return 'success'
  }

  if (
    ['error', 'permission-required'].includes(next.status)
    && !['error', 'permission-required'].includes(previous?.status ?? '')
  ) {
    return 'error'
  }

  return null
}
