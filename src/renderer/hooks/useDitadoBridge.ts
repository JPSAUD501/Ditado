import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import type { DashboardViewModel, DictationSession, OverlayViewModel } from '@shared/contracts'
import { MAX_RECORDING_DURATION_MS, WavRecorder } from '@renderer/lib/wavRecorder'

const initialOverlayState: OverlayViewModel = {
  session: null,
  settings: defaultSettings,
  permissions: defaultPermissionState,
}

const initialDashboardState: DashboardViewModel = {
  session: null,
  settings: defaultSettings,
  history: [],
  telemetryTail: [],
  permissions: defaultPermissionState,
  updateState: {
    enabled: true,
    channel: 'stable',
    lastCheckedAt: null,
    status: 'idle',
    downloadProgress: null,
  },
  appVersion: '',
}

export const useOverlayBridge = (): OverlayViewModel => {
  const [state, setState] = useState(initialOverlayState)

  useEffect(() => {
    let mounted = true
    let receivedLiveState = false

    const unsubscribe = window.ditado.subscribeOverlayState((value) => {
      receivedLiveState = true
      setState(value)
    })

    void window.ditado.getOverlayState().then((value) => {
      if (mounted && !receivedLiveState) {
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

export const useDashboardBridge = (): DashboardViewModel => {
  const [state, setState] = useState(initialDashboardState)

  useEffect(() => {
    let mounted = true
    void window.ditado.getDashboardState().then((value) => {
      if (mounted) {
        setState(value)
      }
    })

    const unsubscribe = window.ditado.subscribeDashboardState((value) => {
      setState(value)
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
): { isRecording: boolean } => {
  const recorder = useMemo(() => new WavRecorder(), [])
  const warmedMicrophone = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    recorder.setOnAudioLevel((rms) => {
      window.ditado.sendAudioLevel(rms)
    })
    return () => { recorder.setOnAudioLevel(null) }
  }, [recorder])

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
    if (!recorder.isRecording() || stopInFlight.current === nextSession.id) {
      return
    }

    stopInFlight.current = nextSession.id
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
        if (stopInFlight.current === nextSession.id) {
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
    if (warmedMicrophone.current === warmupKey) {
      return
    }

    warmedMicrophone.current = warmupKey
    void recorder.warmup(preferredMicrophoneId).catch(() => undefined)
  }, [preferredMicrophoneId, recorder])

  useEffect(() => {
    if (!session) {
      handledIntent.current = null
      clearMaxDurationTimer()
      if (recorder.isRecording()) {
        void recorder.cancel().finally(() => setIsRecording(false))
      }
      return
    }

    const intentKey = `${session.id}:${session.captureIntent}`
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
            latestSession.id !== session.id ||
            !['arming', 'listening'].includes(latestSession.status)
          ) {
            clearMaxDurationTimer()
            void recorder.cancel().finally(() => setIsRecording(false))
            return
          }

          void window.ditado.notifyRecorderStarted(session.id)
          setIsRecording(true)
          clearMaxDurationTimer()
          maxDurationTimer.current = window.setTimeout(() => {
            const currentSession = activeSession.current
            if (
              !currentSession ||
              currentSession.id !== session.id ||
              !['arming', 'listening'].includes(currentSession.status)
            ) {
              return
            }
            finalizeCapture(currentSession)
          }, MAX_RECORDING_DURATION_MS)
        })
        .catch(() => {
          setIsRecording(false)
          clearMaxDurationTimer()
          void window.ditado.notifyRecorderFailed(
            session.id,
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
      if (session.status !== 'listening' && recorder.isRecording() && stopInFlight.current !== session.id) {
        clearMaxDurationTimer()
        void recorder.cancel().finally(() => setIsRecording(false))
      }
    }
  }, [preferredMicrophoneId, recorder, session])

  return { isRecording }
}
