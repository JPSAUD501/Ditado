import { useEffect, useRef, useState } from 'react'

import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, CheckCircle, KeyRound, Mic } from 'lucide-react'

import type { DictationSession, Settings } from '@shared/contracts'
import { formatHotkeyForDisplay, normalizeHotkey } from '@shared/hotkeys'
import { easeOutExpo } from './OnboardingWizard.shared'

type PressedKeysState = {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  keys: Set<string>
}

const normalizeKeyboardKey = (key: string): string => {
  if (key === ' ') {
    return 'Space'
  }

  if (key.length === 1) {
    return key.toUpperCase()
  }

  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    return key.replace('Arrow', '')
  }

  return key
}

const getHotkeyTokens = (hotkey: string): string[] =>
  normalizeHotkey(hotkey)?.split('+').filter(Boolean) ?? []

const getHotkeyTokenLabel = (token: string, isMacOS: boolean): string => {
  if (token === 'Meta') return isMacOS ? '⌘' : 'Win'
  if (token === 'Alt') return isMacOS ? '⌥' : 'Alt'
  if (token === 'Ctrl') return isMacOS ? '⌃' : 'Ctrl'
  if (token === 'Shift') return isMacOS ? '⇧' : 'Shift'
  return token
}

const isHotkeyTokenPressed = (token: string, pressedKeys: PressedKeysState): boolean => {
  if (token === 'Ctrl') return pressedKeys.ctrl
  if (token === 'Alt') return pressedKeys.alt
  if (token === 'Shift') return pressedKeys.shift
  if (token === 'Meta') return pressedKeys.meta
  return pressedKeys.keys.has(token)
}

export const MicLevelVisualizer = ({ onConfirm }: { onConfirm: () => void }) => {
  const { t } = useTranslation()
  const [bars, setBars] = useState<number[]>(Array(16).fill(4))
  const animFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    let analyser: AnalyserNode | null = null
    let cancelled = false

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.75
        ctx.createMediaStreamSource(stream).connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        const speechStart = 3
        const speechEnd = 50
        const barCount = 16
        const chunkSize = (speechEnd - speechStart) / barCount

        const tick = () => {
          if (cancelled || !analyser) {
            return
          }

          analyser.getByteFrequencyData(data)
          const nextBars = Array.from({ length: barCount }, (_, index) => {
            const startIndex = speechStart + Math.floor(index * chunkSize)
            const endIndex = speechStart + Math.floor((index + 1) * chunkSize) + 1
            const slice = data.slice(startIndex, Math.min(endIndex, data.length))
            const avg = slice.reduce((sum, value) => sum + value, 0) / slice.length
            const level = Math.max(0, avg - 15)
            return Math.max(4, Math.round((level / 220) * 72))
          })
          setBars(nextBars)
          animFrameRef.current = requestAnimationFrame(tick)
        }

        animFrameRef.current = requestAnimationFrame(tick)
      } catch {
        // Keep the demo idle when no microphone is available.
      }
    }

    void start()

    return () => {
      cancelled = true
      if (animFrameRef.current != null) {
        cancelAnimationFrame(animFrameRef.current)
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      void audioCtxRef.current?.close()
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.5rem', padding: '2rem' }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%', maxWidth: 340 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', textAlign: 'center' }}>
          {t('onboarding.micSeeingBars')}
        </div>
        <div className="wizard-mic-bars" style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 88, padding: '0 0.5rem' }}>
          {bars.map((height, index) => (
            <div
              key={index}
              style={{
                width: 10,
                height: Math.max(6, height),
                borderRadius: 4,
                flexShrink: 0,
                minHeight: 6,
                transition: 'height 80ms ease-out, opacity 150ms ease',
                background: 'var(--accent)',
                opacity: 0.3 + (Math.max(6, height) / 72) * 0.7,
              }}
            />
          ))}
        </div>
        <button className="button-primary" type="button" onClick={onConfirm}>
          <Check size={13} /> {t('common.continue')}
        </button>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-2)', textAlign: 'center', padding: '0.5rem 1rem', background: 'var(--bg-2)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
        {t('onboarding.micQuickTip')}
      </div>
    </div>
  )
}

export const MockupChatApp = ({
  session,
  pushToTalkHotkey,
}: {
  session: DictationSession | null
  pushToTalkHotkey: string
}) => {
  const { t } = useTranslation()
  const isActive = session?.activationMode === 'push-to-talk' && session.status !== 'idle' && session.status !== 'notice'
  const isListening = session?.activationMode === 'push-to-talk' && (session.status === 'listening' || session.status === 'arming')
  const displayText = session?.finalText || session?.partialText || ''
  const shortcutHint = formatHotkeyForDisplay(pushToTalkHotkey).split('').join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: '0.85rem', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-2)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-ok)', flexShrink: 0 }} />
          <span>💬</span>
          <span>{t('onboarding.demoConversationTitle')}</span>
        </div>
        <div style={{ padding: '0.85rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 100 }}>
          <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
            <div style={{ width: 30, height: 30, borderRadius: '0.35rem', flexShrink: 0, background: 'var(--accent-muted)', border: '1px solid rgba(210,175,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--accent)' }}>TJ</div>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: 3 }}>{t('onboarding.demoContactName')}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-1)', lineHeight: 1.45, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '0 0.5rem 0.5rem 0.5rem', padding: '0.4rem 0.6rem', maxWidth: 200 }}>
                {t('onboarding.demoContactMessage')}
              </div>
            </div>
          </div>
        </div>
        <div style={{ margin: '0 0.75rem 0.75rem', borderRadius: '0.6rem', border: isListening ? '1.5px solid color-mix(in oklch, var(--status-listen) 60%, var(--border))' : '1.5px solid var(--border)', background: 'var(--bg-2)', transition: 'border-color 200ms', overflow: 'hidden' }}>
          <div style={{ padding: '0.55rem 0.75rem', fontSize: '0.75rem', minHeight: 40, display: 'flex', alignItems: 'center', gap: '0.5rem', color: isActive && displayText ? 'var(--text-1)' : 'var(--text-3)' }}>
            {isListening && (
              <motion.div
                style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-listen)', flexShrink: 0 }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 0.85, repeat: Infinity }}
              />
            )}
            <span style={{ flex: 1, lineHeight: 1.4 }}>
              {isActive && displayText ? displayText : <span style={{ opacity: 0.5 }}>{shortcutHint} → {t('onboarding.demoInstruction')}</span>}
            </span>
            <div style={{ width: 26, height: 26, borderRadius: '0.35rem', flexShrink: 0, background: isActive && displayText ? 'var(--accent)' : 'var(--bg-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 200ms' }}>
              <ArrowRight size={12} style={{ color: isActive && displayText ? 'white' : 'var(--text-3)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const SelectTransformMockup = ({ session }: { session: DictationSession | null }) => {
  const { t } = useTranslation()
  const entrySessionIdRef = useRef<string | null | undefined>(session?.id)
  const isNewSession = session?.id !== entrySessionIdRef.current
  const isListening = isNewSession && session?.activationMode === 'push-to-talk' && (session.status === 'listening' || session.status === 'arming')
  const isProcessing = isNewSession && session?.activationMode === 'push-to-talk' && session.status === 'processing'
  const transformSucceeded = isNewSession && session?.activationMode === 'push-to-talk' && session.status === 'completed' && !!session.context.selectedText
  const noSelectionAttempted = isNewSession && session?.activationMode === 'push-to-talk' && session.status === 'completed' && !session.context.selectedText
  const isActive = isNewSession && session?.activationMode === 'push-to-talk' && !['idle', 'notice'].includes(session?.status ?? '') && !noSelectionAttempted
  const finalText = transformSucceeded ? (session?.finalText || '') : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: '0.85rem', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-2)' }}>
          <span>📝</span>
          <span>{t('onboarding.demoEditorTitle')}</span>
          <div style={{ flex: 1 }} />
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', fontWeight: 500, color: isListening ? 'var(--status-listen)' : isProcessing ? 'var(--status-process)' : 'var(--status-ok)' }}
              >
                <motion.div
                  style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}
                  animate={isListening ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
                  transition={{ duration: 0.9, repeat: isListening ? Infinity : 0 }}
                />
                {isListening ? t('onboarding.selectTransformListening') : isProcessing ? t('onboarding.demoProcessing') : t('onboarding.demoCompleted')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div style={{ padding: '0.85rem 0.9rem', minHeight: 120, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.63rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '0.2rem' }}>
            {t('onboarding.selectTransformReplyDraft')}
          </div>
          <AnimatePresence mode="wait">
            {finalText ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                style={{ fontSize: '0.78rem', color: 'var(--text-1)', lineHeight: 1.6, padding: '0.5rem 0.65rem', borderRadius: '0.4rem', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.28)' }}
              >
                {finalText}
              </motion.div>
            ) : (
              <motion.div key="original" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <div style={{ fontSize: '0.78rem', lineHeight: 1.6, padding: '0.5rem 0.65rem', borderRadius: '0.4rem', background: isListening ? 'rgba(59,130,246,0.06)' : 'var(--bg-2)', border: noSelectionAttempted ? '1px solid rgba(210,175,110,0.4)' : isListening ? '1px solid rgba(59,130,246,0.28)' : '1px solid var(--border)', transition: 'background 200ms, border-color 200ms', userSelect: 'text' }}>
                  <span style={{ background: 'rgba(59,130,246,0.30)', borderRadius: 2, padding: '0 2px', color: 'var(--text-1)' }}>
                    {t('onboarding.selectTransformOriginalText')}
                  </span>
                </div>
                <AnimatePresence>
                  {noSelectionAttempted ? (
                    <motion.div
                      key="no-selection"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      style={{ marginTop: '0.4rem', fontSize: '0.67rem', lineHeight: 1.45, color: 'var(--accent)', paddingLeft: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <span>👆</span>
                      {t('onboarding.selectFirstHint')}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{ marginTop: '0.4rem', fontSize: '0.67rem', color: 'var(--text-3)', lineHeight: 1.45, paddingLeft: '0.1rem' }}
                    >
                      {t('onboarding.selectTransformPlaceholder')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

const HandsFreeVisual = ({
  session,
  pushToTalkHotkey,
  isMacOS,
}: {
  session: DictationSession | null
  pushToTalkHotkey: string
  isMacOS: boolean
}) => {
  const { t } = useTranslation()
  const hotkeyTokens = getHotkeyTokens(pushToTalkHotkey)
  const isToggleActive = session?.activationMode === 'toggle'
  const isRecording = isToggleActive && (session.status === 'listening' || session.status === 'arming')
  const isProcessing = isToggleActive && session.status === 'processing'
  const isDone = isToggleActive && session.status === 'completed'
  const displayText = isToggleActive ? (session.finalText || session.partialText || '') : ''
  const [tapPhase, setTapPhase] = useState(0)

  useEffect(() => {
    if (isToggleActive) {
      return
    }
    let id: ReturnType<typeof setTimeout>
    const cycle = () => {
      setTapPhase(1)
      id = setTimeout(() => { setTapPhase(2); id = setTimeout(() => { setTapPhase(3); id = setTimeout(() => setTapPhase(0), 300) }, 200) }, 200)
    }
    const interval = setInterval(cycle, 2400)
    cycle()
    return () => { clearInterval(interval); clearTimeout(id) }
  }, [isToggleActive])

  const keyHighlight = isRecording || tapPhase === 1 || tapPhase === 3
  const KeyBadge = ({ label }: { label: string }) => (
    <motion.div
      animate={{ background: keyHighlight ? 'var(--status-write)' : 'var(--bg-3)', color: keyHighlight ? 'white' : 'var(--text-2)', boxShadow: keyHighlight ? 'none' : '0 2px 0 var(--border)', scale: keyHighlight ? 0.94 : 1 }}
      transition={{ duration: 0.1 }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.3rem 0.65rem', borderRadius: '0.4rem', fontSize: '0.78rem', fontWeight: 700, border: `1.5px solid ${keyHighlight ? 'var(--status-write)' : 'var(--border)'}`, minWidth: 44, cursor: 'default', userSelect: 'none' }}
    >{label}</motion.div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: '0.85rem', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem' }}>🎙️</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)' }}>
              {isRecording ? t('onboarding.handsFreeRecording') : isDone ? t('onboarding.demoCompleted') : t('onboarding.tryHandsFree')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {hotkeyTokens.map((token, index) => (
              <div key={token} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {index > 0 ? <span style={{ color: 'var(--text-3)', fontSize: '0.7rem' }}>+</span> : null}
                <KeyBadge label={getHotkeyTokenLabel(token, isMacOS)} />
              </div>
            ))}
            <motion.span animate={{ color: keyHighlight ? 'var(--status-write)' : 'var(--accent)' }} style={{ fontWeight: 800, fontSize: '0.75rem', marginLeft: '0.1rem' }}>×2</motion.span>
          </div>
        </div>
        <div style={{ padding: '0.85rem 0.9rem', minHeight: 110, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <AnimatePresence mode="wait">
            {isDone && displayText ? (
              <motion.div key="done" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} style={{ fontSize: '0.78rem', color: 'var(--text-1)', lineHeight: 1.6, padding: '0.5rem 0.65rem', borderRadius: '0.4rem', background: 'color-mix(in oklch, var(--status-ok) 8%, var(--bg-1))', border: '1px solid color-mix(in oklch, var(--status-ok) 28%, transparent)' }}>
                {displayText}
              </motion.div>
            ) : isRecording || isProcessing ? (
              <motion.div key="recording" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {displayText && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-1)', lineHeight: 1.6, padding: '0.5rem 0.65rem', borderRadius: '0.4rem', background: 'color-mix(in oklch, var(--status-write) 6%, var(--bg-1))', border: '1px solid color-mix(in oklch, var(--status-write) 20%, transparent)' }}>
                    {displayText}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--status-write)', fontWeight: 600 }}>
                  <motion.div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-write)', flexShrink: 0 }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                  {isProcessing ? t('onboarding.demoProcessing') : t('onboarding.handsFreeRecording')}
                </div>
              </motion.div>
            ) : (
              <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5, minHeight: 60 }}>
                {t('onboarding.handsFreeFinishTip')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div style={{ padding: '0.4rem 0.75rem', borderTop: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: isRecording ? 'var(--status-write)' : 'var(--text-3)', transition: 'color 200ms' }}>
          <motion.div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: isRecording ? 'var(--status-write)' : 'var(--border)' }} animate={isRecording ? { opacity: [1, 0.3, 1] } : { opacity: 1 }} transition={{ duration: 0.9, repeat: isRecording ? Infinity : 0 }} />
          {isRecording ? t('onboarding.tapAgainToFinish') : t('onboarding.doubleTapHandsFree')}
        </div>
      </div>
    </div>
  )
}

const RightWhisper = () => {
  const { t } = useTranslation()
  const apps = [
    t('onboarding.whisperBadgeChat'),
    t('onboarding.whisperBadgeDocs'),
    t('onboarding.whisperBadgeEmail'),
    t('onboarding.whisperBadgeBrowser'),
    t('onboarding.whisperBadgeNotes'),
    t('onboarding.whisperBadgeEditor'),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.5rem', padding: '2rem' }}>
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: easeOutExpo }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: '1rem', background: 'var(--accent-muted)', border: '1px solid rgba(210,175,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <Mic size={26} strokeWidth={1.5} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 18, overflow: 'hidden' }}>
          {[0.4, 0.7, 1, 0.7, 0.4].map((scale, index) => (
            <motion.div key={index} style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--accent)', opacity: 0.65, transformOrigin: 'center' }} animate={{ scaleY: [0.2, scale, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.12, ease: 'easeInOut' }} />
          ))}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', maxWidth: 300 }}>
        {apps.map((app, index) => (
          <motion.span key={app} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, delay: 0.2 + index * 0.04 }} style={{ fontSize: '0.7rem', fontWeight: 500, padding: '0.25rem 0.65rem', borderRadius: '1rem', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{app}</motion.span>
        ))}
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.5 }} style={{ fontSize: '0.72rem', color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.55, maxWidth: 240 }}>
        {t('onboarding.whisperAppsDesc')}
      </motion.div>
    </div>
  )
}

const RightApiKey = () => {
  const { t } = useTranslation()
  const features = [t('onboarding.apiKeyEncrypted'), t('onboarding.apiKeyFast'), t('onboarding.apiKeyPayPerUse')]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.5rem', padding: '2rem' }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', width: '100%', maxWidth: 300 }}>
        <div style={{ width: 64, height: 64, borderRadius: '1rem', background: 'var(--accent-muted)', border: '1px solid rgba(210,175,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <KeyRound size={30} strokeWidth={1.5} />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.6, maxWidth: 220 }}>
          {t('onboarding.apiKeyStoredSecurely')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
          {features.map((badge, index) => (
            <motion.div key={badge} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: index * 0.07 }} style={{ fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 1.4, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '0.4rem', padding: '0.45rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {badge}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

const RightAppearance = ({ settings }: { settings: Settings }) => {
  const { t } = useTranslation()
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.5rem', padding: '2rem' }}>
      <motion.div layout style={{ background: isDark ? '#1a1a1a' : '#f5f5f5', border: '1px solid var(--border)', borderRadius: '0.85rem', overflow: 'hidden', width: '100%', maxWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '0.5rem 0.75rem', background: isDark ? '#111' : '#e8e8e8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {(['#ff5f57', '#febc2e', '#28c840'] as const).map((color) => (
            <div key={color} style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          ))}
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: isDark ? '#222' : '#d0d0d0', margin: '0 0.5rem' }} />
        </div>
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[1, 0.7, 0.5, 0.8, 0.6].map((opacity, index) => (
            <div key={index} style={{ height: 7, borderRadius: 4, background: isDark ? `rgba(255,255,255,${opacity * 0.15})` : `rgba(0,0,0,${opacity * 0.12})`, width: `${60 + index * 8}%` }} />
          ))}
        </div>
      </motion.div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5, maxWidth: 220 }}>
        {t('onboarding.appearanceAppliedInstantly')}
      </div>
    </div>
  )
}

const RightShortcutTest = ({
  session,
  onTested,
  isMacOS,
  pushToTalkHotkey,
}: {
  session: DictationSession | null
  onTested: () => void
  isMacOS: boolean
  pushToTalkHotkey: string
}) => {
  const { t } = useTranslation()
  const hotkeyTokens = getHotkeyTokens(pushToTalkHotkey)
  const [pressedKeys, setPressedKeys] = useState<PressedKeysState>({
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    keys: new Set<string>(),
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      setPressedKeys((current) => {
        const nextKeys = new Set(current.keys)
        nextKeys.add(normalizeKeyboardKey(event.key))
        return {
          ctrl: event.ctrlKey,
          alt: event.altKey,
          shift: event.shiftKey,
          meta: event.metaKey,
          keys: nextKeys,
        }
      })
    }
    const onKeyUp = (event: KeyboardEvent) => {
      setPressedKeys((current) => {
        const nextKeys = new Set(current.keys)
        nextKeys.delete(normalizeKeyboardKey(event.key))
        return {
          ctrl: event.ctrlKey,
          alt: event.altKey,
          shift: event.shiftKey,
          meta: event.metaKey,
          keys: nextKeys,
        }
      })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const sessionActive = session?.status === 'listening' || session?.status === 'arming'
  useEffect(() => {
    if (sessionActive) onTested()
  }, [sessionActive, onTested])

  const shortcutActive = sessionActive || (hotkeyTokens.length > 0 && hotkeyTokens.every((token) => isHotkeyTokenPressed(token, pressedKeys)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '2rem', padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {hotkeyTokens.map((token, index) => {
          const isPressed = shortcutActive || isHotkeyTokenPressed(token, pressedKeys)
          return (
            <div key={token} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {index > 0 ? <span style={{ color: 'var(--text-3)', fontSize: '1rem', fontWeight: 300 }}>+</span> : null}
              <motion.div animate={{ background: isPressed ? 'var(--accent)' : 'var(--bg-3)', color: isPressed ? 'white' : 'var(--text-1)', scale: isPressed ? 0.94 : 1, boxShadow: isPressed ? '0 0 0 var(--border)' : '0 4px 0 var(--border)' }} transition={{ duration: 0.09 }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 1.1rem', borderRadius: '0.5rem', fontSize: token.length > 1 ? '0.92rem' : '1.1rem', fontWeight: 700, border: `2px solid ${isPressed ? 'var(--accent)' : 'var(--border)'}`, cursor: 'default', minWidth: 64, userSelect: 'none' }}>{getHotkeyTokenLabel(token, isMacOS)}</motion.div>
            </div>
          )
        })}
      </div>
      <AnimatePresence mode="wait">
        {shortcutActive ? (
          <motion.div key="active" initial={{ opacity: 0, scale: 0.85, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.18, ease: easeOutExpo }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--status-ok)', fontWeight: 600 }}>
            <CheckCircle size={16} />
            {t('onboarding.shortcutIsWorking')}
          </motion.div>
        ) : (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center' }}>
            {t('onboarding.shortcutTestQuestion')}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const RightReady = () => {
  const { t } = useTranslation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.5rem', padding: '2rem' }}>
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }} style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--status-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <Check size={36} strokeWidth={2.5} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.4rem' }}>
          {t('onboarding.readyWelcome')}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 240 }}>
          {t('onboarding.readyDesc')}
        </div>
      </motion.div>
    </div>
  )
}

const RightWelcome = () => {
  const { t } = useTranslation()
  const features = [
    { icon: '🎙️', text: t('onboarding.featureWhisper') },
    { icon: '✂️', text: t('onboarding.featureSelectTransform') },
    { icon: '🔄', text: t('onboarding.featureSelfCorrect') },
    { icon: '🙌', text: t('onboarding.featureHandsFree') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '2rem', padding: '2rem' }}>
      <motion.div initial={{ opacity: 0, scale: 0.7, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, ease: easeOutExpo }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: 88, height: 88, borderRadius: '1.5rem', background: 'var(--accent-muted)', border: '2px solid rgba(210,175,110,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', boxShadow: '0 8px 32px rgba(210,175,110,0.12)' }}>
          <Mic size={40} strokeWidth={1.4} />
        </div>
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em', textAlign: 'center' }}>Ditado</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', marginTop: '0.25rem' }}>
            {t('onboarding.welcomeTagline')}
          </div>
        </div>
      </motion.div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: 300 }}>
        {features.map(({ icon, text }, index) => (
          <motion.div key={text} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: 0.2 + index * 0.07, ease: easeOutExpo }} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', padding: '0.5rem 0.65rem', borderRadius: '0.5rem', background: 'var(--bg-2)', border: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 1.45 }}>
            <span style={{ fontSize: '0.85rem', flexShrink: 0, marginTop: '0.05rem' }}>{icon}</span>
            <span>{text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

type RightPaneProps = {
  step: number
  settings: Settings
  session: DictationSession | null
  onConfirmMic: () => void
  onTestShortcut: () => void
  isMacOS: boolean
}

export const OnboardingWizardRightPane = ({
  step,
  settings,
  session,
  onConfirmMic,
  onTestShortcut,
  isMacOS,
}: RightPaneProps) => {
  switch (step) {
    case 0: return <RightWelcome />
    case 1: return <RightAppearance settings={settings} />
    case 2: return <RightWhisper />
    case 3: return <MicLevelVisualizer onConfirm={onConfirmMic} />
    case 4: return <RightApiKey />
    case 5: return <RightShortcutTest session={session} onTested={onTestShortcut} isMacOS={isMacOS} pushToTalkHotkey={settings.pushToTalkHotkey} />
    case 6: return <MockupChatApp session={session} pushToTalkHotkey={settings.pushToTalkHotkey} />
    case 7: return <SelectTransformMockup session={session} />
    case 8: return <HandsFreeVisual session={session} pushToTalkHotkey={settings.pushToTalkHotkey} isMacOS={isMacOS} />
    case 9: return <RightReady />
    default: return null
  }
}

