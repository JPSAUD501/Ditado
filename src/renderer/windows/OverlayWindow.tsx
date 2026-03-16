import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, CheckCircle, Loader, Mic, PenLine } from 'lucide-react'

import { useOverlayBridge } from '@renderer/hooks/useDitadoBridge'
import type { DictationStatus } from '@shared/contracts'

const getIcon = (status: DictationStatus, reducedMotion: boolean | null) => {
  switch (status) {
    case 'listening':
    case 'arming':
      return (
        <Mic
          size={13}
          strokeWidth={2.2}
          className={reducedMotion ? '' : 'animate-pulse-scale'}
        />
      )
    case 'processing':
      return (
        <Loader
          size={13}
          strokeWidth={2.2}
          className={reducedMotion ? '' : 'animate-spin-slow'}
        />
      )
    case 'streaming':
      return (
        <PenLine
          size={13}
          strokeWidth={2.2}
          className={reducedMotion ? '' : 'animate-shimmer'}
        />
      )
    case 'completed':
      return <CheckCircle size={13} strokeWidth={2.2} />
    case 'error':
    case 'permission-required':
      return <AlertCircle size={13} strokeWidth={2.2} />
    default:
      return <Mic size={13} strokeWidth={2.2} />
  }
}

export const OverlayWindow = () => {
  const reducedMotion = useReducedMotion()
  const state = useOverlayBridge()
  const session = state.session
  const status = session?.status ?? 'idle'
  const appName = session?.context.appName || session?.targetApp || 'Ditado'
  const detail = session?.noticeMessage ?? appName
  const mode = session?.activationMode ?? 'toggle'

  if (!session || status === 'idle') {
    return null
  }

  return (
    <div className="overlay-shell">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.94, y: 4 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="overlay-chip"
        data-mode={mode}
        data-status={status}
      >
        <span className="overlay-icon">
          {getIcon(status, reducedMotion)}
        </span>
        <span className="overlay-app-name">{detail}</span>
      </motion.div>
    </div>
  )
}
