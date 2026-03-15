import { motion } from 'framer-motion'

import type { HistoryEntry } from '@shared/contracts'
import { HistoryRow } from './controls'

export const HistoryPanel = ({
  history,
  retentionDays,
  reducedMotion,
  sectionMotion,
}: {
  history: HistoryEntry[]
  retentionDays: number
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
}) => (
  <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
    <section className="surface-panel px-5 py-5 md:px-7 md:py-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] md:items-end">
        <div className="min-w-0">
          <div className="eyebrow">Local archive</div>
          <h2 className="section-title mt-3">Recent dictations stay recoverable.</h2>
        </div>
        <p className="copy-soft min-w-0 text-sm md:text-[0.98rem]">
          Entries are kept locally, including audio and submitted context, without turning the product into a transcript inbox.
        </p>
      </div>
      <div className="ornament-line my-6" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="copy-soft text-sm">Retention window: {retentionDays} days.</p>
        <button className="button-secondary" type="button" onClick={() => void window.ditado.clearHistory()}>
          Clear history
        </button>
      </div>
      <div className="grid gap-4">
        {history.length === 0 ? (
          <div className="surface-muted rounded-[1.5rem] px-5 py-6">
            <div className="eyebrow">No entries yet</div>
            <p className="copy-soft mt-3 text-sm">
              The first successful insertion will appear here with app context, saved audio, and the written result.
            </p>
          </div>
        ) : (
          history.map((entry, index) => <HistoryRow key={entry.id} entry={entry} index={index} />)
        )}
      </div>
    </section>
  </motion.div>
)
