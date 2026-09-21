import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Copy, Mic, Type, CheckCircle, Clock, Zap, AppWindow, AlertTriangle, ArrowRight } from 'lucide-react'

import { StatusPill } from '@renderer/components/StatusPill'
import type { DashboardViewModel, DictationStatus, HistoryEntry } from '@shared/contracts'
import { formatAudioDuration, formatDate } from './formatters'

const easeOutExpo = [0.16, 1, 0.3, 1] as const
const _appStartTime = Date.now()

const computeRelativeTime = (createdAt: string): string => {
  const now = _appStartTime
  const then = new Date(createdAt).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(createdAt)
}

/* ── Stat computations ──────────────────────────────────────────────── */

const computeStats = (history: HistoryEntry[]) => {
  const total = history.length
  const completed = history.filter((e) => e.outcome === 'completed').length
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const totalMinutes = history.reduce((sum, e) => sum + e.audioDurationMs, 0) / 60_000
  const totalChars = history.reduce((sum, e) => sum + (e.outputText?.length ?? 0), 0)
  const avgLatency = total > 0
    ? Math.round(history.reduce((sum, e) => sum + e.latencyMs, 0) / total)
    : 0

  const appCounts = new Map<string, number>()
  for (const e of history) {
    appCounts.set(e.appName, (appCounts.get(e.appName) ?? 0) + 1)
  }
  const topApps = [...appCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  const now = Date.now()
  const dayMs = 86_400_000
  const weekActivity = Array.from({ length: 7 }, (_, i) => {
    const dayStart = now - (6 - i) * dayMs
    const dayEnd = dayStart + dayMs
    return history.filter((e) => {
      const t = new Date(e.createdAt).getTime()
      return t >= dayStart && t < dayEnd
    }).length
  })

  return { total, completed, successRate, totalMinutes, totalChars, avgLatency, topApps, weekActivity }
}

/* ── System issues banner ── only renders when something is wrong ── */

const SystemIssuesBanner = ({
  apiOk,
  micOk,
  accOk,
  reducedMotion,
}: {
  apiOk: boolean
  micOk: boolean
  accOk: boolean
  reducedMotion: boolean | null
}) => {
  const { t } = useTranslation()
  const issues: string[] = []
  if (!apiOk) issues.push(t('overview.apiKey'))
  if (!micOk) issues.push(t('overview.microphone'))
  if (!accOk) issues.push(t('overview.accessibility'))

  if (issues.length === 0) return null

  return (
    <motion.div
      className="system-issues-banner"
      initial={reducedMotion ? false : { opacity: 0, y: -6 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: easeOutExpo }}
    >
      <AlertTriangle size={13} className="system-issues-icon" />
      <span className="system-issues-text">
        <span className="system-issues-title">
          {issues.length === 1 ? t('overview.issueDetected') : t('overview.issuesDetected')}:{' '}
        </span>
        {issues.join(', ')}
      </span>
    </motion.div>
  )
}

/* ── Stat card ──────────────────────────────────────────────────────── */

const StatCard = ({
  icon: Icon, label, value, color, index, reducedMotion,
}: {
  icon: React.FC<{ size?: number; strokeWidth?: number }>
  label: string
  value: string
  color: string
  index: number
  reducedMotion: boolean | null
}) => (
  <motion.div
    className="stat-card"
    style={{ '--stat-color': color } as React.CSSProperties}
    initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
    animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.35, ease: easeOutExpo, delay: index * 0.06 }}
  >
    <div className="stat-card-icon" style={{ '--stat-color': color } as React.CSSProperties}>
      <Icon size={16} strokeWidth={2} />
    </div>
    <div className="stat-card-content">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  </motion.div>
)

/* ── Mini bar chart ─────────────────────────────────────────────────── */

// Must stay in sync with .week-chart { height: 100px } in CSS
// 100px total - ~15px value label - ~10px day label - ~6px gaps = ~69px bar area
const BAR_AREA_PX = 68

const WeekChart = ({ data, reducedMotion }: { data: number[]; reducedMotion: boolean | null }) => {
  const max = Math.max(...data, 1)
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const today = new Date().getDay()
  const orderedDays = Array.from({ length: 7 }, (_, i) => days[((today - 6 + i) % 7 + 7) % 7])

  return (
    <div className="week-chart">
      {data.map((count, i) => {
        const barPx = count === 0 ? 0 : Math.max(Math.round((count / max) * BAR_AREA_PX), 6)
        return (
          <div key={i} className="week-chart-col">
            <div className="week-chart-value-label">
              {count > 0 ? count : ''}
            </div>
            <div className="week-chart-bar-track">
              <motion.div
                className="week-chart-bar"
                data-today={i === 6 ? 'true' : undefined}
                data-empty={count === 0 ? 'true' : undefined}
                initial={reducedMotion ? false : { height: 0 }}
                animate={{ height: barPx }}
                transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.15 + i * 0.05 }}
              />
            </div>
            <span className="week-chart-label" data-today={i === 6 ? 'true' : undefined}>
              {orderedDays[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Stage copy keys ────────────────────────────────────────────────── */

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

/* ── Mini history entry ─────────────────────────────────────────────── */

const MiniHistoryEntry = ({
  entry,
  index,
  reducedMotion,
}: {
  entry: HistoryEntry
  index: number
  reducedMotion: boolean | null
}) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const isError = entry.outcome === 'error'
  const hasText = Boolean(entry.outputText)
  const textPreview = entry.outputText
    || (isError ? (entry.errorMessage ?? t('history.noTextInserted')) : t('history.noTextInserted'))
  const modeLabel = entry.activationMode === 'push-to-talk' ? t('common.push') : t('common.toggle')

  const handleCopy = useCallback(() => {
    if (!entry.outputText) return
    void navigator.clipboard.writeText(entry.outputText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [entry.outputText])

  return (
    <motion.div
      className="hentry-card"
      data-outcome={entry.outcome}
      initial={reducedMotion ? false : { opacity: 0, y: -6 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: easeOutExpo, delay: 0.35 + index * 0.06 }}
    >
      <div className="hentry-row">
        <div className="hentry-content" data-static="true">
          <div className="hentry-top">
            <div className="hentry-app-row">
              <span className="hentry-app">{entry.appName}</span>
              {entry.audioDurationMs > 0 && (
                <span className="hentry-duration-badge">
                  <span className="hentry-duration-icon">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                  </span>
                  {formatAudioDuration(entry.audioDurationMs)}
                </span>
              )}
            </div>
            <div className="hentry-time-row">
              <span className="hentry-mode">{modeLabel}</span>
              <span className="hentry-time">{computeRelativeTime(entry.createdAt)}</span>
            </div>
          </div>
          <p className="hentry-preview" data-error={isError ? 'true' : undefined} data-muted={!hasText ? 'true' : undefined}>
            {textPreview}
          </p>
        </div>
        {hasText && (
          <div className="hentry-actions">
            <button
              type="button"
              className="hentry-action-btn"
              aria-label={copied ? t('history.copied') : t('history.copyText')}
              onClick={handleCopy}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }} className="flex" style={{ color: 'var(--status-ok)' }}>
                    <Check size={12} />
                  </motion.span>
                ) : (
                  <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }} className="flex">
                    <Copy size={12} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ── Main component ─────────────────────────────────────────────────── */

export const OverviewPanel = ({
  state,
  onNavigateToHistory,
}: {
  state: DashboardViewModel
  onNavigateToHistory: () => void
}) => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const stats = useMemo(() => computeStats(state.history), [state.history])
  const recentEntries = state.history.slice(0, 3)
  const sessionStatus: DictationStatus = state.session?.status ?? 'idle'
  const stageLabel = t(stageCopyKeys[sessionStatus] ?? 'overview.unknown')
  const micOk = state.permissions.microphone === 'granted'
  const accOk = state.permissions.accessibility === 'granted'
  const apiOk = state.settings.apiKeyPresent

  const hasHistory = state.history.length > 0

  return (
    <div className="ov-grid">
      {/* System issues banner — only shown when something is wrong */}
      <SystemIssuesBanner apiOk={apiOk} micOk={micOk} accOk={accOk} reducedMotion={reducedMotion} />

      {/* Row 1: Live status strip */}
      <motion.div
        className="surface-panel ov-status"
        data-status={sessionStatus}
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutExpo }}
      >
        <div className="ov-status-row">
          <div className="ov-status-main">
            <StatusPill status={sessionStatus} />
            <span className="ov-status-label">{stageLabel}</span>
          </div>
          {state.session?.targetApp && (
            <span className="ov-status-target">{state.session.targetApp}</span>
          )}
        </div>
        {state.session?.partialText && (
          <motion.div
            className="surface-muted ov-partial wrap-safe"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.25, ease: easeOutExpo }}
          >
            {state.session.partialText}
          </motion.div>
        )}
      </motion.div>

      {/* Row 2: Stats grid */}
      {hasHistory ? (
        <>
          <div className="stats-grid">
            <StatCard
              icon={Mic}
              label={t('overview.totalDictations')}
              value={stats.total.toLocaleString()}
              color="var(--status-listen)"
              index={0}
              reducedMotion={reducedMotion}
            />
            <StatCard
              icon={Clock}
              label={t('overview.minutesSpoken')}
              value={stats.totalMinutes < 1 ? `${Math.round(stats.totalMinutes * 60)}s` : `${stats.totalMinutes.toFixed(1)}`}
              color="var(--status-write)"
              index={1}
              reducedMotion={reducedMotion}
            />
            <StatCard
              icon={Type}
              label={t('overview.charactersWritten')}
              value={stats.totalChars.toLocaleString()}
              color="var(--accent)"
              index={2}
              reducedMotion={reducedMotion}
            />
            <StatCard
              icon={CheckCircle}
              label={t('overview.successRate')}
              value={`${stats.successRate}%`}
              color="var(--status-ok)"
              index={3}
              reducedMotion={reducedMotion}
            />
          </div>

          {/* Row 3: Activity chart + Top apps */}
          <div className="dashboard-row">
            {/* Weekly activity */}
            <motion.div
              className="surface-panel ov-card dashboard-chart-card"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: easeOutExpo, delay: 0.2 }}
            >
              <div className="ov-card-head">
                <span className="eyebrow">{t('overview.usageThisWeek')}</span>
                <span className="ov-card-meta">
                  {t('overview.dictationsCount', { count: stats.weekActivity.reduce((a, b) => a + b, 0) })}
                </span>
              </div>
              <WeekChart data={stats.weekActivity} reducedMotion={reducedMotion} />
            </motion.div>

            {/* Top apps + avg latency */}
            <motion.div
              className="surface-panel ov-card dashboard-side-card"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: easeOutExpo, delay: 0.28 }}
            >
              {stats.topApps.length > 0 && (
                <div className="ov-topapps">
                  <div className="ov-card-head"><span className="eyebrow">{t('overview.topApps')}</span></div>
                  <div className="ov-topapps-list">
                    {stats.topApps.map(([app, count], i) => (
                      <motion.div
                        key={app}
                        className="ov-topapp"
                        style={{ '--share': Math.max(count / stats.topApps[0][1], 0.08) } as React.CSSProperties}
                        initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                        animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, ease: easeOutExpo, delay: 0.35 + i * 0.05 }}
                      >
                        <AppWindow size={11} className="ov-topapp-icon" />
                        <span className="ov-topapp-name">{app}</span>
                        <span className="ov-topapp-bar" aria-hidden="true" />
                        <span className="ov-topapp-count">{count}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
              <div className="ov-latency" data-divided={stats.topApps.length > 0 ? 'true' : undefined}>
                <div className="ov-latency-label">
                  <Zap size={11} className="ov-latency-icon" />
                  <span>{t('overview.avgLatency')}</span>
                </div>
                <span className="ov-latency-value">
                  {stats.avgLatency > 0 ? `${(stats.avgLatency / 1000).toFixed(1)}s` : '—'}
                </span>
              </div>
            </motion.div>
          </div>

          {/* Row 4: Recent outputs (last 3) */}
          <motion.div
            className="surface-panel ov-card ov-recent"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: easeOutExpo, delay: 0.35 }}
          >
            <div className="ov-card-head">
              <span className="eyebrow">{t('overview.recentOutputs')}</span>
              {state.history.length > 3 && (
                <button
                  type="button"
                  className="view-all-btn"
                  onClick={onNavigateToHistory}
                >
                  {t('overview.viewAll')} <ArrowRight size={11} />
                </button>
              )}
            </div>

            {recentEntries.length > 0 ? (
              <div className="mini-history-list">
                {recentEntries.map((entry, i) => (
                  <MiniHistoryEntry
                    key={entry.id}
                    entry={entry}
                    index={i}
                    reducedMotion={reducedMotion}
                  />
                ))}
              </div>
            ) : (
              <p className="copy-muted text-xs">{t('overview.noHistory')}</p>
            )}
          </motion.div>
        </>
      ) : (
        /* Empty state — welcome card */
        <motion.div
          className="surface-panel ov-empty"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeOutExpo, delay: 0.1 }}
        >
          <motion.div
            className="ov-empty-mark"
            initial={reducedMotion ? false : { scale: 0 }}
            animate={reducedMotion ? undefined : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.2 }}
          >
            <Mic size={22} strokeWidth={1.6} />
            <span className="ov-empty-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => <i key={i} />)}
            </span>
          </motion.div>
          <div className="ov-empty-title">{t('overview.welcome')}</div>
          <p className="ov-empty-desc">{t('overview.welcomeDesc')}</p>
        </motion.div>
      )}
    </div>
  )
}
