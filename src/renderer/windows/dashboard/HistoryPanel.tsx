import { Trash2 } from 'lucide-react'

import type { HistoryEntry } from '@shared/contracts'
import { HistoryRow } from './controls'

export const HistoryPanel = ({
  history,
  retentionDays,
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
  <div className="grid gap-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="eyebrow">{history.length} entries</span>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>·</span>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{retentionDays}d retention</span>
      </div>
      <button className="button-ghost" type="button" onClick={() => void window.ditado.clearHistory()}>
        <Trash2 size={13} /> Clear
      </button>
    </div>

    {history.length === 0 ? (
      <div className="surface-panel p-5 text-center">
        <div className="text-sm" style={{ color: 'var(--text-3)' }}>
          No entries yet. Use a shortcut to start dictating.
        </div>
      </div>
    ) : (
      <div className="grid gap-1.5">
        {history.map((entry, index) => <HistoryRow key={entry.id} entry={entry} index={index} />)}
      </div>
    )}
  </div>
)
