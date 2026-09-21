import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTime,
  useTransform,
} from 'framer-motion'
import { CircleAlert, CircleCheck, LoaderCircle, Mic, PenLine, Sparkles, Type } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MotionStyle, MotionValue } from 'framer-motion'

import { useOverlayBridge } from '@renderer/hooks/useDitadoBridge'
import { useThemeAndLanguage } from '@renderer/hooks/useThemeAndLanguage'
import type { DictationStatus } from '@shared/contracts'

/* ── Status-based colors ──────────────────────────────────────────── */
/*
 * Only the hue is decided here. Border, context badge and completion ring derive
 * in CSS from `--chip-color` (a registered @property), so every status change
 * cross-fades the whole chip instead of snapping individual parts.
 */

const toggleStatusColor: Record<string, string> = {
  listening: 'var(--status-write)',
  arming: 'var(--text-3)',
  processing: 'var(--status-process)',
  streaming: 'var(--status-write)',
  completed: 'var(--status-ok)',
  error: 'var(--status-error)',
  'permission-required': 'var(--status-error)',
  notice: 'var(--text-3)',
  idle: 'var(--text-3)',
}

const pttStatusColor: Record<string, string> = {
  ...toggleStatusColor,
  listening: 'var(--status-listen)',
  arming: 'var(--status-listen)',
}

/* ── Icons ────────────────────────────────────────────────────────── */

type IconComponent = React.FC<{ size?: number; strokeWidth?: number; className?: string }>

const iconMap: Record<string, IconComponent> = {
  arming: Mic,
  processing: LoaderCircle,
  streaming: PenLine,
  completed: CircleCheck,
  error: CircleAlert,
  'permission-required': CircleAlert,
  notice: Mic,
  idle: Mic,
}

/* ── Transition configs ───────────────────────────────────────────── */

// Apple-style "ease out quart-ish": fast start, long soft landing
const easeOutSoft = [0.22, 1, 0.36, 1] as const
const easeIn = [0.4, 0, 1, 1] as const

// Chip enter/exit — rise + blur only, no scale (the border-radius must never distort)
const chipEnter = {
  y: { type: 'spring' as const, duration: 0.55, bounce: 0.24 },
  opacity: { duration: 0.22, ease: easeOutSoft },
  filter: { duration: 0.3, ease: easeOutSoft },
}
const chipExit = { duration: 0.18, ease: easeIn }

// Icon swap: a soft vertical flip. Completed gets a bouncier pop.
const iconSpring = { type: 'spring' as const, duration: 0.34, bounce: 0.18 }
const iconPop = { type: 'spring' as const, duration: 0.5, bounce: 0.45 }
const iconExit = { duration: 0.12, ease: easeIn }

// Context badge pop
const gentleSpring = { type: 'spring' as const, duration: 0.32, bounce: 0.2 }

// Text swap — runs concurrently with the width resize
const contentExit = { duration: 0.12, ease: easeIn }
const contentEnter = { duration: 0.22, ease: easeOutSoft }

// Width resize
const widthTween = { type: 'tween' as const, duration: 0.34, ease: easeOutSoft }

/* ── Live timer hook ──────────────────────────────────────────────── */
/*
 * Resets ONLY when startIso changes (new session). Active flag pauses/resumes
 * the RAF loop but never resets the displayed value mid-session, preventing
 * the "flash to 0" artifact when status briefly leaves processing/streaming.
 */
const useLiveTimer = (startIso: string | null | undefined, active: boolean): string => {
  const [elapsed, setElapsed] = useState('0.0')
  const rafRef = useRef(0)
  const activeRef = useRef(active)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!startIso) return
    const startMs = new Date(startIso).getTime()
    const tick = () => {
      if (activeRef.current) {
        const s = Math.max(0, (Date.now() - startMs) / 1000)
        setElapsed(s.toFixed(1))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [startIso])

  return startIso ? elapsed : '0.0'
}

/* ── Audio-reactive equalizer (zero React re-renders via MotionValues) ── */

const BAR_MIN = 3
const BAR_MAX = 14
// Center-weighted amplitude so the equalizer reads as a "voice" shape
const BAR_AMP = [0.55, 0.85, 1, 0.85, 0.55]
// Phase offsets for the idle breathing so bars never move in lockstep
const BAR_PHASE = [0, 1.3, 2.6, 0.7, 2.0]
const IDLE_WOBBLE = 0.12

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

const EqualizerBar = ({ level, time, index }: { level: MotionValue<number>; time: MotionValue<number>; index: number }) => {
  const height = useTransform([level, time], (values) => {
    const [v, t] = values as [number, number]
    const idle = IDLE_WOBBLE * (0.5 + 0.5 * Math.sin(t / 240 + BAR_PHASE[index]))
    const amplitude = clamp01(v * BAR_AMP[index] + idle)
    return BAR_MIN + amplitude * (BAR_MAX - BAR_MIN)
  })
  return <motion.span className="overlay-eq-bar" style={{ height }} />
}

const EqualizerBars = ({ level }: { level: MotionValue<number> }) => {
  const time = useTime()
  return (
    <span className="overlay-equalizer" aria-hidden="true">
      {BAR_AMP.map((_, i) => (
        <EqualizerBar key={i} level={level} time={time} index={i} />
      ))}
    </span>
  )
}

/* ── Notice text translation hook ─────────────────────────────────── */

const useNoticeText = (raw: string | null | undefined): string => {
  const { t } = useTranslation()
  if (!raw) return ''
  if (raw.startsWith('notices.')) {
    const parts = raw.split('::')
    const key = parts[0]
    const param = parts[1]
    if (param) return t(key, { hotkey: param })
    return t(key)
  }
  return raw
}

/* ── Context badge ────────────────────────────────────────────────── */

const ContextBadge = ({ reducedMotion }: { reducedMotion: boolean | null }) => (
  <motion.span
    className="overlay-context-badge"
    initial={reducedMotion ? false : { opacity: 0, scale: 0.4, x: -4 }}
    animate={reducedMotion ? undefined : { opacity: 1, scale: 1, x: 0 }}
    exit={reducedMotion ? undefined : { opacity: 0, scale: 0.4, x: -4, transition: iconExit }}
    transition={gentleSpring}
    title="Context"
  >
    <Type size={9} strokeWidth={2.5} />
  </motion.span>
)

/* ── Main component ───────────────────────────────────────────────── */

export const OverlayWindow = () => {
  const reducedMotion = useReducedMotion()
  const state = useOverlayBridge()
  useThemeAndLanguage(state.settings, { skipTheme: true })

  const session = state.session
  const status: DictationStatus = session?.status ?? 'idle'
  const rawAppName = session?.context.appName || session?.targetApp || 'App'
  const appName = rawAppName === 'Unknown App' ? 'App' : rawAppName
  const mode = session?.activationMode ?? 'toggle'
  const isVisible = Boolean(session) && status !== 'idle'

  const isPtt = mode === 'push-to-talk'
  const colorMap = isPtt ? pttStatusColor : toggleStatusColor

  // color is set on the chip itself — icon, equalizer, timer all inherit it
  const isReadyNotice = status === 'notice' && session?.noticeMessage === 'notices.ready'
  const color = isReadyNotice ? 'var(--status-ok)' : (colorMap[status] ?? 'var(--text-3)')

  // Timer — only visible during processing/streaming
  const showTimer = status === 'processing' || status === 'streaming'
  const timerText = useLiveTimer(session?.processingStartedAt, showTimer)

  // Equalizer — audio-reactive via MotionValue, zero React re-renders
  const isListening = status === 'listening'
  const isListeningRef = useRef(isListening)
  useEffect(() => { isListeningRef.current = isListening }, [isListening])

  const rawLevel = useMotionValue(0)
  const smoothLevel = useSpring(rawLevel, { stiffness: 420, damping: 22, restDelta: 0.004 })

  useEffect(() => {
    const unsub = window.ditado.subscribeAudioLevel((rms) => {
      rawLevel.set(isListeningRef.current ? Math.min(1, rms * 5) : 0)
    })
    return unsub
  }, [rawLevel])

  useEffect(() => {
    if (!isListening) rawLevel.set(0)
  }, [isListening, rawLevel])

  // Context badge — show whenever session has selected text
  const hasContext = Boolean(session?.context.selectedText)

  // Notice text translation
  const noticeText = useNoticeText(session?.noticeMessage)
  const detail = status === 'notice' ? (noticeText || appName) : appName
  const detailClassName = status === 'notice'
    ? 'overlay-app-name overlay-app-name-notice'
    : 'overlay-app-name'

  const IconComponent: IconComponent = isReadyNotice ? Sparkles : (iconMap[status] ?? Mic)
  const isErrorState = status === 'error' || status === 'permission-required'
  const isCompleted = status === 'completed'

  /* Width: animated imperatively — no FLIP/scale, so the border-radius never distorts */
  const chipRef = useRef<HTMLDivElement>(null)
  const chipAnimRef = useRef<{ stop: () => void } | null>(null)

  useLayoutEffect(() => {
    const el = chipRef.current
    if (!el) return

    chipAnimRef.current?.stop()
    chipAnimRef.current = null

    // offsetWidth: layout width, unaffected by the stage's enter/exit scale transform
    const currentWidth = el.offsetWidth

    // max-content bypasses flex-shrink and yields the reliable intrinsic width
    // +1: 1px of slack against sub-pixel rounding (avoids a spurious "…")
    el.style.width = 'max-content'
    const naturalWidth = el.offsetWidth + 1

    el.style.width = `${naturalWidth}px`

    if (reducedMotion || currentWidth <= 0 || Math.abs(currentWidth - naturalWidth) < 1) return

    el.style.width = `${currentWidth}px`
    // data-resizing switches the app name from ellipsis to plain clip for the duration of the tween
    el.dataset.resizing = 'true'
    const anim = animate(el, { width: naturalWidth }, widthTween)
    chipAnimRef.current = anim
    void anim.then(() => {
      if (chipAnimRef.current === anim) delete el.dataset.resizing
    })
  }, [status, detail, showTimer, hasContext, isListening, reducedMotion])

  /* Error: one-shot horizontal shake on the whole chip */
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = frameRef.current
    if (!el || !isErrorState || reducedMotion) return
    const anim = animate(el, { x: [0, -5, 5, -3, 3, -1, 0] }, { duration: 0.42, ease: 'easeOut' })
    return () => { anim.stop() }
  }, [isErrorState, reducedMotion])

  return (
    <div className="overlay-shell">
      <AnimatePresence mode="sync">
        {isVisible && (
          // Outer wrapper: enter/exit only (rise + settle) — never touches the chip's size
          <motion.div
            key="overlay-chip"
            className="overlay-stage"
            initial={reducedMotion ? false : { opacity: 0, y: 12, filter: 'blur(8px)' }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reducedMotion ? undefined : {
              opacity: 0,
              y: 10,
              filter: 'blur(5px)',
              transition: chipExit,
            }}
            transition={chipEnter}
          >
            {/* Frame: holds the chip plus the completion ring that must escape its overflow clip */}
            <motion.div
              ref={frameRef}
              className="overlay-frame"
              data-status={status}
              // color + --chip-color live on the frame so the chip and the burst sibling inherit them
              style={{ color, '--chip-color': color } as unknown as MotionStyle}
            >
              <div
                ref={chipRef}
                className="overlay-chip"
                data-mode={mode}
                data-status={status}
              >

                {/* Left: icon (or live equalizer when listening) + context badge */}
                <span className="overlay-left">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={isListening ? 'eq' : status}
                      className="overlay-icon"
                      data-status={status}
                      initial={reducedMotion ? false : { y: 7, scale: 0.55, opacity: 0, filter: 'blur(2px)' }}
                      animate={reducedMotion ? undefined : { y: 0, scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={reducedMotion ? undefined : { y: -7, scale: 0.55, opacity: 0, filter: 'blur(2px)', transition: iconExit }}
                      transition={isCompleted ? iconPop : iconSpring}
                    >
                      {isListening && !reducedMotion
                        ? <EqualizerBars level={smoothLevel} />
                        : <IconComponent size={13} strokeWidth={2.2} className="overlay-icon-glyph" />
                      }
                    </motion.span>
                  </AnimatePresence>

                  <AnimatePresence>
                    {hasContext && <ContextBadge reducedMotion={reducedMotion} />}
                  </AnimatePresence>
                </span>

                {/* Center: app name or processing timer */}
                <AnimatePresence mode="popLayout" initial={false}>
                  {showTimer ? (
                    <motion.span
                      key="timer"
                      className="overlay-timer"
                      initial={reducedMotion ? false : { opacity: 0, y: 5, filter: 'blur(4px)' }}
                      animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reducedMotion ? undefined : { opacity: 0, y: -5, filter: 'blur(4px)', transition: contentExit }}
                      transition={reducedMotion ? undefined : contentEnter}
                    >
                      {timerText}<span className="overlay-timer-unit">s</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key={detail}
                      className={detailClassName}
                      initial={reducedMotion ? false : { opacity: 0, y: 5, filter: 'blur(4px)' }}
                      animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reducedMotion ? undefined : { opacity: 0, y: -5, filter: 'blur(4px)', transition: contentExit }}
                      transition={reducedMotion ? undefined : contentEnter}
                    >
                      {detail}
                    </motion.span>
                  )}
                </AnimatePresence>

                <span className="overlay-stream-bar" aria-hidden="true" />
              </div>

              {/* Completed: one-shot ring burst that expands past the chip edge */}
              <AnimatePresence>
                {isCompleted && !reducedMotion && (
                  <motion.span
                    key="burst"
                    className="overlay-burst"
                    aria-hidden="true"
                    initial={{ opacity: 0.85, scale: 0.9 }}
                    animate={{ opacity: 0, scale: 1.18 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: easeOutSoft }}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
