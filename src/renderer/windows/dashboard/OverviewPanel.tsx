import { useTranslation } from 'react-i18next'
import { Shield } from 'lucide-react'

import { StatusPill } from '@renderer/components/StatusPill'
import type { DashboardViewModel, DictationStatus } from '@shared/contracts'
import { formatDate } from './formatters'

const HealthDot = ({ ok, label }: { ok: boolean; label: string }) => (
  <span
    title={label}
    style={{
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: ok ? 'var(--status-ok)' : 'var(--status-error)',
      display: 'inline-block',
      flexShrink: 0,
    }}
  />
)

const stageCopyKeys: Record<string, string> = {
  idle: 'overview.standingBy',
  arming: 'overview.openingMic',
  listening: 'overview.capturingSpeech',
  processing: 'overview.draftingText',
  streaming: 'overview.writingOutput',
  completed: 'overview.insertionDone',
  notice: 'overview.notice',
  'permission-required': 'overview.permissionBlocked',
  error: 'overview.error',
}

export const OverviewPanel = ({
  state,
  isRecording,
}: {
  state: DashboardViewModel
  isRecording: boolean
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
}) => {
  const { t } = useTranslation()
  const latestEntry = state.history[0] ?? null
  const sessionStatus: DictationStatus = state.session?.status ?? 'idle'
  const stageLabel = t(stageCopyKeys[sessionStatus] ?? 'overview.unknown')
  const modelShort = state.settings.modelId.split('/').at(-1) ?? state.settings.modelId
  const micOk = state.permissions.microphone === 'granted'
  const accOk = state.permissions.accessibility === 'granted'
  const apiOk = state.settings.apiKeyPresent

  return (
    <div className="grid gap-3">
      {/* Row 1: Status */}
      <div className="surface-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <StatusPill status={sessionStatus} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{stageLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" title={t('overview.systemHealth')}>
              <Shield size={10} style={{ color: 'var(--text-3)' }} />
              <HealthDot ok={apiOk} label={t('overview.apiKey')} />
              <HealthDot ok={micOk} label={t('overview.microphone')} />
              <HealthDot ok={accOk} label={t('overview.accessibility')} />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {state.session?.targetApp ?? '—'}
            </span>
          </div>
        </div>
        {state.session?.partialText ? (
          <div className="surface-muted p-2.5 text-sm wrap-safe" style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
            {state.session.partialText}
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('overview.useShortcutHint')}
          </div>
        )}
      </div>

      {/* Row 2: Metrics */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="metric-card">
          <div className="metric-label">{t('overview.status')}</div>
          <div className="metric-value">{isRecording ? t('common.recording') : t('common.idle')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('overview.context')}</div>
          <div className="metric-value">{state.settings.sendContextAutomatically ? t('common.auto') : t('common.off')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('overview.model')}</div>
          <div className="metric-value" title={state.settings.modelId}>{modelShort}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('overview.reveal')}</div>
          <div className="metric-value">
            {state.settings.insertionStreamingMode === 'letter-by-letter' ? t('common.stream') : t('common.instant')}
          </div>
        </div>
      </div>

      {/* Row 3: Last output (full width) */}
      <div className="surface-panel p-4">
        <div className="eyebrow mb-2">{t('overview.lastOutput')}</div>
        {latestEntry ? (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{latestEntry.appName}</span>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', height: '1rem',
                  padding: '0 0.35rem', borderRadius: '999px', fontSize: '0.58rem', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                  border: latestEntry.outcome === 'error' ? '1px solid rgba(210,90,80,0.22)' : '1px solid rgba(112,192,134,0.2)',
                  background: latestEntry.outcome === 'error' ? 'rgba(210,90,80,0.06)' : 'rgba(112,192,134,0.06)',
                  color: latestEntry.outcome === 'error' ? 'var(--status-error)' : 'var(--status-ok)',
                }}
              >
                {latestEntry.outcome === 'error' ? t('history.err') : t('history.ok')}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                {latestEntry.modelId.split('/').at(-1)}
              </span>
            </div>
            <p className="text-sm wrap-safe line-clamp-3" style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>
              {latestEntry.outputText || t('history.noTextInserted')}
            </p>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {formatDate(latestEntry.createdAt)}
            </div>
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{t('overview.noHistory')}</p>
        )}
      </div>
    </div>
  )
}
