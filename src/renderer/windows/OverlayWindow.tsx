import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, CheckCircle, Loader, Mic, PenLine, Type } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

/* ── Animated icon with swap transition ───────────────────────────── */

const iconMap: Record<string, React.FC<{ size?: number; strokeWidth?: number; className?: string }>> = {
  listening: Mic,
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
  listening: 'animate-pulse-scale',
  arming: '',
  processing: 'animate-spin-slow',
  streaming: 'animate-shimmer',
}

/* ── Spring configs ───────────────────────────────────────────────── */

const chipSpring = { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.8 }
const chipEnter = { type: 'spring' as const, stiffness: 500, damping: 32, mass: 0.6 }

/* ── Live timer hook ──────────────────────────────────────────────── */

const useLiveTimer = (startIso: string | null | undefined, active: boolean): string => {
  const [elapsed, setElapsed] = useState('0.0')
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active || !startIso) {
      setElapsed('0.0')
      return
    }
    const startMs = new Date(startIso).getTime()
    const tick = () => {
      const s = Math.max(0, (Date.now() - startMs) / 1000)
      setElapsed(s.toFixed(1))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, startIso])

  return elapsed
}

/* ── Equalizer bars component ─────────────────────────────────────── */

const EqualizerBars = () => (
  <span className="overlay-equalizer">
    <span className="overlay-eq-bar" style={{ animationDelay: '0ms' }} />
    <span className="overlay-eq-bar" style={{ animationDelay: '180ms' }} />
    <span className="overlay-eq-bar" style={{ animationDelay: '360ms' }} />
  </span>
)

/* ── Notice text translation hook ─────────────────────────────────── */

const useNoticeText = (raw: string | null | undefined): string => {
  const { t } = useTranslation()
  if (!raw) return ''
  // Format: "notices.key::param" or plain i18n key "notices.key"
  if (raw.startsWith('notices.')) {
    const parts = raw.split('::')
    const key = parts[0]
    const param = parts[1]
    if (param) return t(key, { hotkey: param })
    return t(key)
  }
  return raw
}

/* ── Main component ───────────────────────────────────────────────── */

export const OverlayWindow = () => {
  const reducedMotion = useReducedMotion()
  const state = useOverlayBridge()
  useThemeAndLanguage(state.settings, { skipTheme: true })
  const session = state.session
  const status: DictationStatus = session?.status ?? 'idle'
  const appName = session?.context.appName || session?.targetApp || 'Ditado'
  const mode = session?.activationMode ?? 'toggle'
  const isVisible = Boolean(session) && status !== 'idle'

  const isPtt = mode === 'push-to-talk'
  const colorMap = isPtt ? pttStatusColor : toggleStatusColor
  const borderMap = isPtt ? pttStatusBorder : toggleStatusBorder

  const IconComponent = iconMap[status] ?? Mic
  const iconClass = reducedMotion ? '' : (iconAnimation[status] ?? '')
  const color = colorMap[status] ?? 'var(--text-3)'
  const border = borderMap[status] ?? (isPtt ? 'rgba(210,175,110,0.28)' : 'rgba(110,165,210,0.22)')

  // Timer: show elapsed time during processing/streaming
  const showTimer = status === 'processing' || status === 'streaming'
  const timerText = useLiveTimer(session?.processingStartedAt, showTimer)

  // Equalizer: show during listening
  const showEqualizer = status === 'listening'

  // Context badge: show when selected text is being sent
  const hasContext = Boolean(session?.context.selectedText)

  // Notice text translation
  const noticeText = useNoticeText(session?.noticeMessage)
  const detail = status === 'notice' ? (noticeText || appName) : appName

  return (
    <div className="overlay-shell">
      <LayoutGroup>
        <AnimatePresence mode="wait">
          {isVisible && (
            <motion.div
              key="overlay-chip"
              layout
              initial={reducedMotion ? false : { opacity: 0, scale: 0.85, y: 10, filter: 'blur(4px)' }}
              animate={reducedMotion ? undefined : {
                opacity: 1,
                scale: 1,
                y: 0,
                filter: 'blur(0px)',
                borderColor: border,
              }}
              exit={reducedMotion ? undefined : {
                opacity: 0,
                scale: 0.88,
                y: 6,
                filter: 'blur(3px)',
              }}
              transition={chipEnter}
              className="overlay-chip"
              data-mode={mode}
              data-status={status}
              style={{}}
            >
              {/* Animated icon with swap */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={status}
                  className="overlay-icon"
                  initial={reducedMotion ? false : { scale: 0.5, opacity: 0, rotate: -30 }}
                  animate={reducedMotion ? undefined : { scale: 1, opacity: 1, rotate: 0 }}
                  exit={reducedMotion ? undefined : { scale: 0.5, opacity: 0, rotate: 30 }}
                  transition={chipSpring}
                  style={{ color }}
                >
                  <IconComponent size={13} strokeWidth={2.2} className={iconClass} />
                </motion.span>
              </AnimatePresence>

              {/* Equalizer bars during listening */}
              {showEqualizer && !reducedMotion && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.2 }}
                >
                  <EqualizerBars />
                </motion.span>
              )}

              {/* Text or timer */}
              <AnimatePresence mode="wait" initial={false}>
                {showTimer ? (
                  <motion.span
                    key="timer"
                    className="overlay-timer"
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={reducedMotion ? undefined : { opacity: 1 }}
                    exit={reducedMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    {timerText}s
                  </motion.span>
                ) : (
                  <motion.span
                    key={detail}
                    className="overlay-app-name"
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={reducedMotion ? undefined : { opacity: 1 }}
                    exit={reducedMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    {detail}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Context badge */}
              {hasContext && (
                <motion.span
                  className="overlay-context-badge"
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.5 }}
                  animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
                  transition={chipSpring}
                  title="Context"
                >
                  <Type size={10} strokeWidth={2.4} />
                  <span className="overlay-context-dot" />
                </motion.span>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
