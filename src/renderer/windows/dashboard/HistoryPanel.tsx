import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Trash2 } from 'lucide-react'

import type { HistoryEntry } from '@shared/contracts'
import { ConfirmModal, HistoryRow } from './controls'

const easeOutExpo = [0.16, 1, 0.3, 1] as const

type OutcomeFilter = 'all' | 'completed' | 'error'

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
}) => {
  const { t } = useTranslation()
  const [confirmClear, setConfirmClear] = useState(false)
  const [search, setSearch] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')

  const filtered = useMemo(() => {
    let result = history
    if (outcomeFilter !== 'all') {
      result = result.filter((e) => e.outcome === outcomeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.appName.toLowerCase().includes(q) ||
          (e.outputText ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [history, outcomeFilter, search])

  const successCount = useMemo(() => history.filter((e) => e.outcome === 'completed').length, [history])
  const errorCount = history.length - successCount

  return (
    <div className="grid gap-3">
      {/* Header: count + retention + clear */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="eyebrow">{t('history.entries', { count: history.length })}</span>
          <span style={{ color: 'var(--text-3)', fontSize: '0.65rem' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('history.retention', { days: retentionDays })}
          </span>
        </div>
        <button className="button-ghost" type="button" onClick={() => setConfirmClear(true)}>
          <Trash2 size={13} /> {t('common.clear')}
        </button>
      </div>

      {/* Search + Filter bar */}
      {history.length > 0 && (
        <motion.div
          className="history-controls"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: easeOutExpo }}
        >
          {/* Search */}
          <div className="history-search-wrap">
            <Search size={13} className="history-search-icon" />
            <input
              type="search"
              className="history-search-input"
              placeholder={t('history.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter tabs */}
          <div className="history-filter-tabs">
            {([
              { id: 'all' as OutcomeFilter, label: t('history.filterAll'), count: history.length },
              { id: 'completed' as OutcomeFilter, label: t('history.filterOk'), count: successCount },
              { id: 'error' as OutcomeFilter, label: t('history.filterError'), count: errorCount },
            ]).map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                className="history-filter-tab"
                data-active={outcomeFilter === id}
                onClick={() => setOutcomeFilter(id)}
              >
                {label}
                <span className="history-filter-count">{count}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* List */}
      {history.length === 0 ? (
        <div className="surface-panel p-6 text-center grid gap-2">
          <div className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
            {t('history.noEntries')}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-panel p-5 text-center">
          <div className="text-sm" style={{ color: 'var(--text-3)' }}>
            {t('history.noResults')}
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          {filtered.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {confirmClear && (
          <ConfirmModal
            title={t('history.confirmClearAll')}
            desc={t('history.confirmClearAllDesc', { count: history.length })}
            onConfirm={() => { void window.ditado.clearHistory(); setConfirmClear(false) }}
            onCancel={() => setConfirmClear(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
