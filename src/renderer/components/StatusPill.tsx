import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import type { DictationStatus } from '@shared/contracts'

const labels: Record<DictationStatus, string> = {
  idle: 'Idle',
  arming: 'Arming',
  listening: 'Listening',
  processing: 'Thinking',
  streaming: 'Writing',
  completed: 'Done',
  notice: 'Tip',
  error: 'Error',
  'permission-required': 'Permission',
}

const labelEnter = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
const labelExit = { duration: 0.1, ease: [0.4, 0, 1, 1] as const }
const pillLayout = { type: 'spring' as const, duration: 0.36, bounce: 0.12 }

export const StatusPill = ({ status }: { status: DictationStatus }) => {
  const reducedMotion = useReducedMotion()

  return (
    <motion.span
      className="status-pill"
      data-status={status}
      layout={reducedMotion ? false : 'size'}
      transition={pillLayout}
    >
      <span className="status-dot" />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          className="status-pill-label"
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -6, transition: labelExit }}
          transition={labelEnter}
        >
          {labels[status]}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}
