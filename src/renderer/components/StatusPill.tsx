import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

import type { DictationStatus } from '@shared/contracts'

const LIVE_STATUSES: ReadonlySet<DictationStatus> = new Set(['arming', 'listening'])

const labelEnter = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
const labelExit = { duration: 0.1, ease: [0.4, 0, 1, 1] as const }
const pillLayout = { type: 'spring' as const, duration: 0.36, bounce: 0.12 }

export const StatusPill = ({ status }: { status: DictationStatus }) => {
  const reducedMotion = useReducedMotion()
  const { t } = useTranslation()
  const live = LIVE_STATUSES.has(status)

  return (
    <motion.span
      className="status-pill"
      data-status={status}
      layout={reducedMotion ? false : 'size'}
      transition={pillLayout}
    >
      {live ? (
        <span className="status-eq" aria-hidden="true"><i /><i /><i /></span>
      ) : (
        <span className="status-dot" />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          className="status-pill-label"
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -6, transition: labelExit }}
          transition={labelEnter}
        >
          {t(`statusPill.${status}`)}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}
