import { motion, useReducedMotion } from 'framer-motion'

import { useOverlayBridge } from '@renderer/hooks/useDitadoBridge'

const statusCopy = {
  idle: 'Ready',
  arming: 'Listening',
  listening: 'Listening',
  processing: 'Sending',
  streaming: 'Writing',
  completed: 'Done',
  notice: 'Tip',
  error: 'Error',
  'permission-required': 'Mic',
} as const

const modeCopy = {
  'push-to-talk': 'Hold',
  toggle: 'Toggle',
} as const

export const OverlayWindow = () => {
  const reducedMotion = useReducedMotion()
  const state = useOverlayBridge()
  const session = state.session
  const status = session?.status ?? 'idle'
  const isRecording = status === 'arming' || status === 'listening'
  const appName = session?.context.appName || session?.targetApp || 'Foreground app'
  const detail = session?.noticeMessage ?? appName
  const mode = session?.activationMode ?? 'toggle'
  const modeLabel = modeCopy[mode]

  if (!session || status === 'idle') {
    return null
  }

  return (
    <div className="overlay-shell">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.985 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="overlay-chip"
        data-mode={mode}
      >
        <motion.span
          animate={
            reducedMotion
              ? undefined
              : {
                  scale: isRecording ? [1, 1.12, 1] : 1,
                  opacity: isRecording ? [0.72, 1, 0.72] : 0.88,
                }
          }
          transition={{ duration: 1.05, repeat: isRecording ? Infinity : 0, ease: 'easeInOut' }}
          className="overlay-chip__dot"
        />
        <span className="overlay-chip__mode" data-mode={mode}>
          {modeLabel}
        </span>
        <div className="overlay-chip__meta">
          <span className="overlay-chip__status">{statusCopy[status]}</span>
          {detail ? (
            <>
              <span className="overlay-chip__separator">/</span>
              <span className="overlay-chip__app">{detail}</span>
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}
