import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'

import type { HistoryEntry } from '@shared/contracts'
import { ConfirmModal, HistoryRow } from './controls'

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

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="eyebrow">{t('history.entries', { count: history.length })}</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{t('history.retention', { days: retentionDays })}</span>
        </div>
        <button className="button-ghost" type="button" onClick={() => setConfirmClear(true)}>
          <Trash2 size={13} /> {t('common.clear')}
        </button>
      </div>

      {history.length === 0 ? (
        <div className="surface-panel p-5 text-center">
          <div className="text-sm" style={{ color: 'var(--text-3)' }}>
            {t('history.noEntries')}
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          {history.map((entry, index) => <HistoryRow key={entry.id} entry={entry} index={index} />)}
        </div>
      )}

      {confirmClear && (
        <ConfirmModal
          title={t('history.confirmClearAll')}
          desc={t('history.confirmClearAllDesc', { count: history.length })}
          onConfirm={() => { void window.ditado.clearHistory(); setConfirmClear(false) }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  )
}
