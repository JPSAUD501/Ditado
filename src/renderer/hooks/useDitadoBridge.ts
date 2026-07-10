import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { defaultPermissionState, defaultUpdateState } from '@shared/defaults'
import type { DashboardNativeState, DictationSession } from '@shared/contracts'
import { MAX_RECORDING_DURATION_MS, WavRecorder } from '@renderer/lib/wavRecorder'

const initialDashboardState: DashboardNativeState = {
  permissions: defaultPermissionState,
  updateState: defaultUpdateState,
  appVersion: '',
}

export const useDashboardBridge = (): DashboardNativeState => {
  const [state, setState] = useState(initialDashboardState)

  useEffect(() => {
    let mounted = true
    const unsubscribe = window.ditado.subscribeDashboardNativeState((value) => {
      if (mounted) {
        setState(value)
      }
    })
    void window.ditado.getDashboardNativeState().then((value) => {
      if (mounted) {
        setState(value)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return state
}

export const useAudioLevel = (): number => {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    const unsubscribe = window.ditado.subscribeAudioLevel(setLevel)
    return unsubscribe
  }, [])

  return level
}

export const useDictationRecorder = (
  session: DictationSession | null,
  preferredMicrophoneId: string | null,
  startupWarmupEnabled = false,
  enabled = true,
): { isRecording: boolean } => {
  const recorder = useMemo(() => new WavRecorder(), [])
  const warmedMicrophone = useRef<string | null | undefined>(undefined)
  const startupWarmupReported = useRef(false)

  useEffect(() => {
    recorder.setOnAudioLevel((rms) => {
      window.ditado.sendAudioLevel(rms)
    })
    return () => { recorder.setOnAudioLevel(null) }
  }, [recorder])

  useEffect(() => {
    void window.ditado.notifyRecorderReady().catch(() => undefined)
  }, [])

  const [isRecording, setIsRecording] = useState(false)
  const handledIntent = useRef<string | null>(null)
  const stopInFlight = useRef<string | null>(null)
  const activeSession = useRef<DictationSession | null>(session)
  const maxDurationTimer = useRef<number | null>(null)

  const clearMaxDurationTimer = (): void => {
    if (maxDurationTimer.current !== null) {
      window.clearTimeout(maxDurationTimer.current)
      maxDurationTimer.current = null
    }
  }

  useEffect(() => {
    activeSession.current = session
  }, [session])

  const finalizeCapture = useEffectEvent((nextSession: DictationSession): void => {
    if (!recorder.isRecording() || stopInFlight.current === nextSession.sessionId) {
      return
    }

    stopInFlight.current = nextSession.sessionId
    clearMaxDurationTimer()
    void recorder
      .stop(navigator.language)
      .then((payload) => {
        setIsRecording(false)
        if (nextSession.activationMode === 'push-to-talk') {
          return window.ditado.stopPushToTalk(payload)
        }
        return window.ditado.toggleDictation(payload)
      })
      .catch(() => {
        setIsRecording(false)
        void window.ditado.cancelDictation()
      })
      .finally(() => {
        if (stopInFlight.current === nextSession.sessionId) {
          stopInFlight.current = null
        }
      })
  })

  useEffect(() => {
    return () => {
      clearMaxDurationTimer()
      void recorder.cancel()
    }
  }, [recorder])

  useEffect(() => {
    const warmupKey = preferredMicrophoneId ?? '__default__'
    if (!enabled) {
      return
    }
    if (warmedMicrophone.current === warmupKey) {
      return
    }

    warmedMicrophone.current = warmupKey
    void recorder
      .warmup(preferredMicrophoneId)
      .then((status) => {
        if (!startupWarmupEnabled || startupWarmupReported.current) {
          return
        }

        startupWarmupReported.current = true
        void window.ditado.notifyRecorderWarmupFinished(status)
      })
      .catch(() => {
        if (!startupWarmupEnabled || startupWarmupReported.current) {
          return
        }

        startupWarmupReported.current = true
        void window.ditado.notifyRecorderWarmupFinished('failed')
      })
  }, [enabled, preferredMicrophoneId, recorder, startupWarmupEnabled])

  useEffect(() => {
    if (!enabled) {
      handledIntent.current = null
      clearMaxDurationTimer()
      if (recorder.isRecording()) {
        void recorder.cancel().finally(() => setIsRecording(false))
      }
      return
    }

    if (!session) {
      handledIntent.current = null
      clearMaxDurationTimer()
      if (recorder.isRecording()) {
        void recorder.cancel().finally(() => setIsRecording(false))
      }
      return
    }

    const intentKey = `${session.sessionId}:${session.captureIntent}`
    if (handledIntent.current === intentKey) {
      return
    }

    if (session.captureIntent === 'start') {
      handledIntent.current = intentKey
      void recorder
        .start(preferredMicrophoneId)
        .then(() => {
          const latestSession = activeSession.current
          if (
            !latestSession ||
            latestSession.sessionId !== session.sessionId ||
            !['arming', 'listening'].includes(latestSession.status)
          ) {
            clearMaxDurationTimer()
            void recorder.cancel().finally(() => setIsRecording(false))
            return
          }

          void window.ditado.notifyRecorderStarted(session.sessionId)
          setIsRecording(true)
          clearMaxDurationTimer()
          maxDurationTimer.current = window.setTimeout(() => {
            const observedSession = activeSession.current
            if (
              !observedSession ||
              observedSession.sessionId !== session.sessionId ||
              !['arming', 'listening'].includes(observedSession.status)
            ) {
              return
            }
            finalizeCapture(observedSession)
          }, MAX_RECORDING_DURATION_MS)
        })
        .catch(() => {
          setIsRecording(false)
          clearMaxDurationTimer()
          void window.ditado.notifyRecorderFailed(
            session.sessionId,
            'Unable to start microphone capture.',
          )
        })
      return
    }

    if (session.captureIntent === 'stop' && recorder.isRecording()) {
      handledIntent.current = intentKey
      finalizeCapture(session)
      return
    }

    if (session.captureIntent === 'none') {
      handledIntent.current = intentKey
      if (session.status !== 'listening' && recorder.isRecording() && stopInFlight.current !== session.sessionId) {
        clearMaxDurationTimer()
        void recorder.cancel().finally(() => setIsRecording(false))
      }
    }
  }, [enabled, preferredMicrophoneId, recorder, session])

  return { isRecording }
}
