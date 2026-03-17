import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Mic, Type, CheckCircle, Clock, Zap, TrendingUp, Shield, AppWindow } from 'lucide-react'

import { StatusPill } from '@renderer/components/StatusPill'
import type { DashboardViewModel, DictationStatus, HistoryEntry } from '@shared/contracts'
import { formatDate } from './formatters'

const easeOutExpo = [0.16, 1, 0.3, 1] as const

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

  // Top apps
  const appCounts = new Map<string, number>()
  for (const e of history) {
    appCounts.set(e.appName, (appCounts.get(e.appName) ?? 0) + 1)
  }
  const topApps = [...appCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  // Activity last 7 days
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

/* ── Health dot ─────────────────────────────────────────────────────── */

const HealthDot = ({ ok, label }: { ok: boolean; label: string }) => (
  <span
    title={label}
    style={{
      width: 7, height: 7, borderRadius: '50%',
      background: ok ? 'var(--status-ok)' : 'var(--status-error)',
      display: 'inline-block', flexShrink: 0,
    }}
  />
)

/* ── Stat card ──────────────────────────────────────────────────────── */

const StatCard = ({
  icon: Icon, label, value, subtitle, color, index, reducedMotion,
}: {
  icon: React.FC<{ size?: number; strokeWidth?: number }>
  label: string
  value: string
  subtitle?: string
  color: string
  index: number
  reducedMotion: boolean | null
}) => (
  <motion.div
    className="stat-card"
    initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
    animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.35, ease: easeOutExpo, delay: index * 0.06 }}
  >
    <div className="stat-card-icon" style={{ background: `color-mix(in oklch, ${color} 12%, transparent)`, color }}>
      <Icon size={16} strokeWidth={2} />
    </div>
    <div className="stat-card-content">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {subtitle && <div className="stat-card-subtitle">{subtitle}</div>}
    </div>
  </motion.div>
)

/* ── Mini bar chart ─────────────────────────────────────────────────── */

const WeekChart = ({ data, reducedMotion }: { data: number[]; reducedMotion: boolean | null }) => {
  const max = Math.max(...data, 1)
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const today = new Date().getDay()
  // Reorder days labels to end on today
  const orderedDays = Array.from({ length: 7 }, (_, i) => days[((today - 6 + i) % 7 + 7) % 7])

  return (
    <div className="week-chart">
      {data.map((count, i) => (
        <div key={i} className="week-chart-col">
          <div className="week-chart-bar-track">
            <motion.div
              className="week-chart-bar"
              initial={reducedMotion ? false : { height: 0 }}
              animate={{ height: `${Math.max((count / max) * 100, count > 0 ? 8 : 0)}%` }}
              transition={{ duration: 0.5, ease: easeOutExpo, delay: 0.15 + i * 0.05 }}
              style={{ background: count > 0 ? 'var(--accent)' : 'var(--bg-3)' }}
            />
          </div>
          <span className="week-chart-label">{orderedDays[i]}</span>
        </div>
      ))}
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

/* ── Main component ─────────────────────────────────────────────────── */

export const OverviewPanel = ({
  state,
}: {
  state: DashboardViewModel
}) => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const stats = useMemo(() => computeStats(state.history), [state.history])
  const latestEntry = state.history[0] ?? null
  const sessionStatus: DictationStatus = state.session?.status ?? 'idle'
  const stageLabel = t(stageCopyKeys[sessionStatus] ?? 'overview.unknown')
  const micOk = state.permissions.microphone === 'granted'
  const accOk = state.permissions.accessibility === 'granted'
  const apiOk = state.settings.apiKeyPresent

  const hasHistory = state.history.length > 0

  return (
    <div className="grid gap-3">
      {/* Row 1: Live status strip */}
      <motion.div
        className="surface-panel p-4"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutExpo }}
      >
        <div className="flex items-center justify-between gap-3">
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
        {state.session?.partialText && (
          <motion.div
            className="surface-muted p-2.5 text-sm wrap-safe mt-3"
            style={{ color: 'var(--text-2)', lineHeight: 1.5 }}
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
              className="surface-panel p-4 dashboard-chart-card"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: easeOutExpo, delay: 0.2 }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow">{t('overview.usageThisWeek')}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {t('overview.dictationsCount', { count: stats.weekActivity.reduce((a, b) => a + b, 0) })}
                </span>
              </div>
              <WeekChart data={stats.weekActivity} reducedMotion={reducedMotion} />
            </motion.div>

            {/* Top apps + avg latency */}
            <motion.div
              className="surface-panel p-4 dashboard-side-card"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: easeOutExpo, delay: 0.28 }}
            >
              {stats.topApps.length > 0 && (
                <div className="mb-3">
                  <div className="eyebrow mb-2">{t('overview.topApps')}</div>
                  <div className="grid gap-1">
                    {stats.topApps.map(([app, count], i) => (
                      <motion.div
                        key={app}
                        className="flex items-center justify-between"
                        style={{ padding: '0.25rem 0' }}
                        initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                        animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, ease: easeOutExpo, delay: 0.35 + i * 0.05 }}
                      >
                        <div className="flex items-center gap-1.5">
                          <AppWindow size={11} style={{ color: 'var(--text-3)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-1)' }}>{app}</span>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{count}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between" style={{ paddingTop: stats.topApps.length > 0 ? '0.5rem' : 0, borderTop: stats.topApps.length > 0 ? '1px solid var(--border)' : 'none' }}>
                <div className="flex items-center gap-1.5">
                  <Zap size={11} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{t('overview.avgLatency')}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
                  {stats.avgLatency > 0 ? `${(stats.avgLatency / 1000).toFixed(1)}s` : '—'}
                </span>
              </div>
            </motion.div>
          </div>

          {/* Row 4: Last output */}
          <motion.div
            className="surface-panel p-4"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: easeOutExpo, delay: 0.35 }}
          >
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
          </motion.div>
        </>
      ) : (
        /* Empty state — welcome card */
        <motion.div
          className="surface-panel p-5"
          style={{ textAlign: 'center' }}
          initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: easeOutExpo, delay: 0.1 }}
        >
          <motion.div
            style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'var(--accent-muted)', border: '1px solid rgba(210,175,110,0.2)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent)', marginBottom: '1rem',
            }}
            initial={reducedMotion ? false : { scale: 0 }}
            animate={reducedMotion ? undefined : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.2 }}
          >
            <TrendingUp size={22} />
          </motion.div>
          <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
            {t('overview.welcome')}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.5, maxWidth: '28rem', margin: '0 auto' }}>
            {t('overview.welcomeDesc')}
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="flex items-center gap-1.5" title={t('overview.systemHealth')}>
              <Shield size={10} style={{ color: 'var(--text-3)' }} />
              <HealthDot ok={apiOk} label={t('overview.apiKey')} />
              <HealthDot ok={micOk} label={t('overview.microphone')} />
              <HealthDot ok={accOk} label={t('overview.accessibility')} />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
