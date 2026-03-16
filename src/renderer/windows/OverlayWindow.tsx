import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, CheckCircle, Loader, Mic, PenLine } from 'lucide-react'

import { useOverlayBridge } from '@renderer/hooks/useDitadoBridge'
import { useThemeAndLanguage } from '@renderer/hooks/useThemeAndLanguage'
import type { DictationStatus } from '@shared/contracts'

/* ── Status-based colors ──────────────────────────────────────────── */

/* toggle = azul (fluxo contínuo), push-to-talk = verde (ativo ao vivo) */
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


export const OverlayWindow = () => {
  const reducedMotion = useReducedMotion()
  const state = useOverlayBridge()
  useThemeAndLanguage(state.settings)
  const session = state.session
  const status: DictationStatus = session?.status ?? 'idle'
  const appName = session?.context.appName || session?.targetApp || 'Ditado'
  const detail = session?.noticeMessage ?? appName
  const mode = session?.activationMode ?? 'toggle'
  const isVisible = Boolean(session) && status !== 'idle'

  const isPtt = mode === 'push-to-talk'
  const colorMap = isPtt ? pttStatusColor : toggleStatusColor
  const borderMap = isPtt ? pttStatusBorder : toggleStatusBorder

  const IconComponent = iconMap[status] ?? Mic
  const iconClass = reducedMotion ? '' : (iconAnimation[status] ?? '')
  const color = colorMap[status] ?? 'var(--text-3)'
  const border = borderMap[status] ?? (isPtt ? 'rgba(210,175,110,0.28)' : 'rgba(110,165,210,0.22)')

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

              {/* Text with fade transition to avoid font stretching during resize */}
              <AnimatePresence mode="wait" initial={false}>
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
              </AnimatePresence>

            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
