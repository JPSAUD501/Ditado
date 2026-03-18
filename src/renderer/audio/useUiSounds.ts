import { useEffect, useRef } from 'react'

import type { DictationSession } from '@shared/contracts'

import { getUiSoundForSessionTransition } from './uiSoundEvents'
import { playUiSound, preloadUiSounds } from './uiSoundPlayer'

export const useUiSounds = (session: DictationSession | null): void => {
  const previousSessionRef = useRef<DictationSession | null>(null)

  useEffect(() => {
    void preloadUiSounds().catch(() => undefined)
  }, [])

  useEffect(() => {
    const nextSound = getUiSoundForSessionTransition(previousSessionRef.current, session)
    previousSessionRef.current = session

    if (!nextSound) {
      return
    }

    void playUiSound(nextSound).catch(() => undefined)
  }, [session])
}
