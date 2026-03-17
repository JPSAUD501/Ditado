import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion'
import { AlertCircle, CheckCircle, Loader, Mic, PenLine, Type } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MotionValue } from 'framer-motion'

import { useOverlayBridge } from '@renderer/hooks/useDitadoBridge'
import { useThemeAndLanguage } from '@renderer/hooks/useThemeAndLanguage'
import type { DictationStatus } from '@shared/contracts'

/* ── Status-based colors ──────────────────────────────────────────── */

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

const toggleStatusBorder: Record<string, string> = {
  listening: 'rgba(90,140,210,0.28)',
  processing: 'rgba(210,175,110,0.22)',
  streaming: 'rgba(90,140,210,0.22)',
  completed: 'rgba(112,192,134,0.18)',
  error: 'rgba(210,90,80,0.22)',
  'permission-required': 'rgba(210,90,80,0.22)',
}

const pttStatusBorder: Record<string, string> = {
  ...toggleStatusBorder,
  listening: 'rgba(112,192,134,0.28)',
  arming: 'rgba(112,192,134,0.18)',
}

/* ── Animated icon ────────────────────────────────────────────────── */

const iconMap: Record<string, React.FC<{ size?: number; strokeWidth?: number; className?: string }>> = {
  arming: Mic,
  processing: Loader,
  streaming: PenLine,
  completed: CheckCircle,
  error: AlertCircle,
  'permission-required': AlertCircle,
  notice: Mic,
  idle: Mic,
}

const iconAnimation: Record<string, string> = {
  arming: '',
  processing: 'animate-spin-slow',
  streaming: 'animate-shimmer',
}

/* ── Transition configs ───────────────────────────────────────────── */

// ease-in-out suave: começa devagar, acelera, desacelera — "easy easy"
const easeInOut = [0.45, 0, 0.55, 1] as const

// Icon swap spring
const chipSpring = { type: 'spring' as const, duration: 0.28, bounce: 0.1 }
// Context badge pop
const gentleSpring = { type: 'spring' as const, duration: 0.28, bounce: 0.05 }

// Content transitions — concorrentes com o resize
const contentExit = { duration: 0.12, ease: 'easeIn' as const }
const contentEnter = { duration: 0.18, ease: easeInOut }

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

  // Keep ref in sync so the RAF callback always sees current active value
  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    // Reset and restart only when the reference point changes
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
  }, [startIso]) // ← only startIso, never active

  return startIso ? elapsed : '0.0'
}

/* ── Audio-reactive equalizer (zero React re-renders via MotionValues) ── */

const BAR_MIN = 2
const BAR_MAX = 12
const BAR_STAGGER = [0.15, 0, -0.15] // relative amplitude offsets per bar

const EqualizerBars = ({ level }: { level: MotionValue<number> }) => {
  const h0 = useTransform(level, v => BAR_MIN + Math.max(0, Math.min(1, v + BAR_STAGGER[0])) * (BAR_MAX - BAR_MIN))
  const h1 = useTransform(level, v => BAR_MIN + Math.max(0, Math.min(1, v + BAR_STAGGER[1])) * (BAR_MAX - BAR_MIN))
  const h2 = useTransform(level, v => BAR_MIN + Math.max(0, Math.min(1, v + BAR_STAGGER[2])) * (BAR_MAX - BAR_MIN))
  return (
    <span className="overlay-equalizer">
      <motion.span className="overlay-eq-bar" style={{ height: h0 }} />
      <motion.span className="overlay-eq-bar" style={{ height: h1 }} />
      <motion.span className="overlay-eq-bar" style={{ height: h2 }} />
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
    initial={reducedMotion ? false : { opacity: 0, scale: 0.4 }}
    animate={reducedMotion ? undefined : { opacity: 0.55, scale: 1 }}
    exit={reducedMotion ? undefined : { opacity: 0, scale: 0.4 }}
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
  const borderMap = isPtt ? pttStatusBorder : toggleStatusBorder

  // color is set on the chip itself — icon, equalizer, timer all inherit it
  const color = colorMap[status] ?? 'var(--text-3)'
  const border = borderMap[status] ?? (isPtt ? 'rgba(210,175,110,0.28)' : 'rgba(110,165,210,0.22)')

  // Timer — only visible during processing/streaming
  const showTimer = status === 'processing' || status === 'streaming'
  const timerText = useLiveTimer(session?.processingStartedAt, showTimer)

  // Equalizer — audio-reactive via MotionValue, zero React re-renders
  const isListening = status === 'listening'
  const isListeningRef = useRef(isListening)
  useEffect(() => { isListeningRef.current = isListening }, [isListening])

  const rawLevel = useMotionValue(0)
  const smoothLevel = useSpring(rawLevel, { stiffness: 400, damping: 20, restDelta: 0.005 })

  // Subscribe directly to motion value — no React state, no re-renders
  useEffect(() => {
    const unsub = window.ditado.subscribeAudioLevel((rms) => {
      rawLevel.set(isListeningRef.current ? Math.min(1, rms * 5) : 0)
    })
    return unsub
  }, [rawLevel])

  // Reset level to 0 when we leave listening state
  useEffect(() => {
    if (!isListening) rawLevel.set(0)
  }, [isListening, rawLevel])

  // Context badge — show whenever session has selected text
  const hasContext = Boolean(session?.context.selectedText)

  // Notice text translation
  const noticeText = useNoticeText(session?.noticeMessage)
  const detail = status === 'notice' ? (noticeText || appName) : appName

  const IconComponent = iconMap[status] ?? Mic
  const iconClass = reducedMotion ? '' : (iconAnimation[status] ?? '')

  // Animate chip width directly — sem FLIP/scale, sem distorção de border-radius
  const chipRef = useRef<HTMLDivElement>(null)
  const chipAnimRef = useRef<{ stop: () => void } | null>(null)

  useLayoutEffect(() => {
    const el = chipRef.current
    if (!el) return

    chipAnimRef.current?.stop()
    chipAnimRef.current = null

    // currentWidth: sempre px concreto — nunca 'auto', evita race condition
    const currentWidth = el.getBoundingClientRect().width

    // max-content: bypassa flex-shrink e dá a largura intrínseca máxima confiável
    // +1: folga de 1px contra arredondamentos sub-pixel (evita "..." espúrio)
    el.style.width = 'max-content'
    const naturalWidth = Math.ceil(el.getBoundingClientRect().width) + 1

    // Restaura valor concreto em px para que a próxima leitura seja estável
    el.style.width = `${naturalWidth}px`

    if (reducedMotion || currentWidth <= 0 || Math.abs(currentWidth - naturalWidth) < 1) return

    el.style.width = `${currentWidth}px`
    const anim = animate(el, { width: naturalWidth }, { type: 'tween', duration: 0.22, ease: easeInOut })
    chipAnimRef.current = anim
  }, [status, detail, showTimer, hasContext, isListening, reducedMotion])

  return (
    <div className="overlay-shell">
      <AnimatePresence mode="sync">
        {isVisible && (
          // Outer wrapper: ONLY handles opacity + blur enter/exit — no scale, no size
          <motion.div
            key="overlay-chip"
            initial={reducedMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
            animate={reducedMotion ? undefined : { opacity: 1, filter: 'blur(0px)' }}
            exit={reducedMotion ? undefined : {
              opacity: 0,
              filter: 'blur(3px)',
              transition: { duration: 0.1, ease: 'easeIn' },
            }}
            transition={{ duration: 0.4, ease: easeInOut }}
            style={{ display: 'flex', width: '100%', justifyContent: 'center' }}
          >
            {/* Inner chip: width animada diretamente via imperativo — sem FLIP, sem scaleX */}
            <motion.div
              ref={chipRef}
              className="overlay-chip"
              animate={reducedMotion ? undefined : { borderColor: border }}
              transition={{ borderColor: { duration: 0.6, ease: easeInOut } }}
              data-mode={mode}
              data-status={status}
              style={{ color }}
            >
              {/* Left: icon (or live equalizer when listening) + context badge */}
              <span className="overlay-left">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={isListening ? 'eq' : status}
                    className="overlay-icon"
                    initial={reducedMotion ? false : { scale: 0.5, opacity: 0, rotate: -30 }}
                    animate={reducedMotion ? undefined : { scale: 1, opacity: 1, rotate: 0 }}
                    exit={reducedMotion ? undefined : { scale: 0.5, opacity: 0, rotate: 30 }}
                    transition={chipSpring}
                  >
                    {isListening && !reducedMotion
                      ? <EqualizerBars level={smoothLevel} />
                      : <IconComponent size={13} strokeWidth={2.2} className={iconClass} />
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
                    initial={reducedMotion ? false : { opacity: 0, filter: 'blur(4px)' }}
                    animate={reducedMotion ? undefined : { opacity: 1, filter: 'blur(0px)' }}
                    exit={reducedMotion ? undefined : { opacity: 0, filter: 'blur(4px)', transition: contentExit }}
                    transition={reducedMotion ? undefined : contentEnter}
                  >
                    {timerText}<span className="overlay-timer-unit">s</span>
                  </motion.span>
                ) : (
                  <motion.span
                    key={detail}
                    className="overlay-app-name"
                    initial={reducedMotion ? false : { opacity: 0, filter: 'blur(4px)' }}
                    animate={reducedMotion ? undefined : { opacity: 1, filter: 'blur(0px)' }}
                    exit={reducedMotion ? undefined : { opacity: 0, filter: 'blur(4px)', transition: contentExit }}
                    transition={reducedMotion ? undefined : contentEnter}
                  >
                    {detail}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
