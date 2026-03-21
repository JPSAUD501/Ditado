import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Copy, Pause, Play, Trash2 } from 'lucide-react'

import type { HistoryEntry } from '@shared/contracts'
import { formatHotkeyForDisplay, hotkeyFromKeyboardEvent, isSupportedHotkey, normalizeHotkey } from '@shared/hotkeys'
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

/* ── Hotkey capture field ──────────────────────────────────────────── */

export const HotkeyField = ({
  label,
  value,
  fallbackValue,
  onCommit,
}: {
  label: string
  value: string
  fallbackValue: string
  onCommit: (value: string) => Promise<unknown> | void
}) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [isCapturing, setIsCapturing] = useState(false)
  const visibleValue = isCapturing ? draft : value

  useEffect(() => {
    return () => { void window.ditado.setHotkeyCaptureActive(false) }
  }, [])

  const stopCapture = (): void => { setIsCapturing(false); void window.ditado.setHotkeyCaptureActive(false) }
  const startCapture = (): void => { setIsCapturing(true); void window.ditado.setHotkeyCaptureActive(true) }

  return (
    <div className="grid gap-1">
      <button
        className="field flex items-center justify-between gap-3 text-left"
        type="button"
        aria-label={`${label} hotkey`}
        onFocus={startCapture}
        onBlur={stopCapture}
        onClick={startCapture}
        onKeyDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Escape') { setDraft(value); stopCapture(); return }
          const next = hotkeyFromKeyboardEvent(event)
          if (!next || !isSupportedHotkey(next)) return
          const normalized = normalizeHotkey(next)
          if (!normalized) return
          setDraft(normalized)
          stopCapture()
          void onCommit(normalized)
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: visibleValue ? 'var(--text-1)' : 'var(--text-3)' }}>
          {isCapturing ? t('common.pressCombo') : formatHotkeyForDisplay(visibleValue)}
        </span>
        <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: isCapturing ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
          {isCapturing ? t('common.capturing') : label}
        </span>
      </button>
      <button
        className="button-ghost"
        style={{ height: 'auto', padding: 0, fontSize: '0.68rem', justifyContent: 'flex-start', color: 'var(--text-3)' }}
        type="button"
        onClick={() => { setDraft(fallbackValue); stopCapture(); void onCommit(fallbackValue) }}
      >
        {t('common.resetTo', { value: formatHotkeyForDisplay(fallbackValue) })}
      </button>
    </div>
  )
}

/* ── Toggle row ────────────────────────────────────────────────────── */

export const ToggleRow = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (value: boolean) => void
}) => {
  const thumbX = value ? 16 : 0

  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{label}</div>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.45 }}>{description}</p>
      </div>
      <button
        className="toggle-track"
        data-on={value}
        type="button"
        aria-label={label}
        aria-pressed={value}
        onClick={() => onChange(!value)}
      >
        <motion.span
          className="toggle-thumb"
          initial={{ x: thumbX }}
          animate={{ x: thumbX }}
          transition={{ duration: 0.16, ease: easeOutExpo }}
          style={{ background: value ? 'var(--accent)' : 'var(--text-3)' }}
        />
      </button>
    </div>
  )
}

/* ── Microphone selector ───────────────────────────────────────────── */

const enumerateBrowserMicrophones = async (): Promise<Array<{ deviceId: string; label: string }>> => {
  if (!navigator.mediaDevices?.enumerateDevices) return window.ditado.listMicrophones()
  const devices = await navigator.mediaDevices.enumerateDevices()
  const mics = devices.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId }))
  return mics.length > 0 ? mics : window.ditado.listMicrophones()
}

export const MicrophoneSelect = ({
  refreshKey,
  selected,
  onSelect,
}: {
  refreshKey: number
  selected: string | null
  onSelect: (deviceId: string | null) => void
}) => {
  const { t } = useTranslation()
  const [devices, setDevices] = useState<Array<{ deviceId: string; label: string }>>([])

  useEffect(() => {
    let mounted = true
    void enumerateBrowserMicrophones()
      .then((r) => { if (mounted) setDevices(r) })
      .catch(() => { if (mounted) setDevices([]) })
    return () => { mounted = false }
  }, [refreshKey])

  return (
    <select className="field" value={selected ?? ''} onChange={(e) => onSelect(e.target.value || null)} aria-label={t('settings.preferredMicrophone')}>
      <option value="">{t('common.systemDefault')}</option>
      {devices.length === 0 ? <option value="" disabled>{t('common.noMicrophonesDetected')}</option> : null}
      {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
    </select>
  )
}

/* ── Custom audio player ──────────────────────────────────────────── */

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const MetricChip = ({
  icon: Icon,
  label,
  value,
  warn = false,
}: {
  icon: React.FC<{ size?: number; strokeWidth?: number }>
  label: string
  value: string
  warn?: boolean
}) => (
  <div
    className="metric-chip"
    data-warn={warn ? 'true' : undefined}
  >
    <Icon size={10} strokeWidth={2.5} />
    <span className="metric-chip-label">{label}</span>
    <span className="metric-chip-value">{value}</span>
  </div>
)

type TimelineStage = {
  label: string
  ms: number
  color: string
}

const safeDiffMs = (start: number | null, end: number | null): number => {
  if (start === null || end === null) {
    return 0
  }

  const diff = end - start
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : 0
}

const formatTimelineDuration = (ms: number): string => `${(ms / 1000).toFixed(2)}s`

const buildTimelineStages = (entry: HistoryEntry): TimelineStage[] => {
  const processingStartedAt = entry.timing.processingStartedMs
  const llmCompletedAt = entry.timing.llmCompletedMs
  const insertionStartedAt = entry.timing.insertionStartedMs
  const insertionCompletedAt = entry.timing.insertionCompletedMs
  const processingWindowEndAt =
    insertionStartedAt && llmCompletedAt
      ? Math.min(insertionStartedAt, llmCompletedAt)
      : llmCompletedAt

  const recordingMs = entry.durations.recordingMs ?? 0
  const processingMs =
    processingStartedAt && processingWindowEndAt
      ? safeDiffMs(processingStartedAt, processingWindowEndAt)
      : [
          entry.durations.audioPreparationMs,
          entry.durations.networkHandshakeMs,
          entry.durations.modelUntilFirstTokenMs,
          entry.durations.modelStreamingMs,
        ].reduce((sum: number, value) => sum + (value ?? 0), 0)
  const writingMs =
    insertionStartedAt && insertionCompletedAt
      ? safeDiffMs(insertionStartedAt, insertionCompletedAt)
      : entry.durations.insertionMs ?? 0

  return [
    { label: 'Recording', ms: recordingMs, color: 'var(--status-listen)' },
    {
      label: 'Processing',
      ms: processingMs,
      color: 'var(--status-process)',
    },
    { label: 'Writing', ms: writingMs, color: 'var(--status-write)' },
  ].filter((stage): stage is TimelineStage => stage.ms > 0)
}

const ProcessingTimeline = ({
  stages,
}: {
  stages: TimelineStage[]
}) => {
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null)

  const total = stages.reduce((sum, s) => sum + s.ms, 0)

  if (total <= 0) {
    return null
  }

  return (
    <div className="proc-timeline">
      <div className="proc-timeline-track">
        {stages.map((stage, i) => {
          if (stage.ms <= 0) return null
          const pct = (stage.ms / total) * 100
          return (
            <div
              key={stage.label}
              className="proc-timeline-segment"
              style={{
                width: `${pct}%`,
                background: stage.color,
                borderRadius: i === 0 ? '3px 0 0 3px' : i === stages.length - 1 ? '0 3px 3px 0' : '0',
              }}
              onMouseMove={(e) =>
                setTooltip({
                  label: `${stage.label}: ${formatTimelineDuration(stage.ms)}`,
                  x: e.clientX,
                  y: e.clientY,
                })}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}
      </div>
      {tooltip && (
        <div
          className="proc-timeline-tooltip"
          style={{ left: tooltip.x, top: tooltip.y - 38 }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  )
}

export const HistoryAudioPlayer = ({ entryId, hasAudio }: { entryId: string; hasAudio: boolean }) => {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    let mounted = true
    let objectUrl: string | null = null
    if (!hasAudio) return () => { mounted = false }
    void window.ditado.getHistoryAudio(entryId)
      .then((value) => {
        if (!mounted || !value) { if (mounted) setLoadFailed(true); return }
        const binary = atob(value.base64)
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: value.mimeType }))
        setSrc(objectUrl)
        setLoadFailed(false)
      })
      .catch(() => { if (mounted) setLoadFailed(true) })
    return () => { mounted = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [entryId, hasAudio])

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) { void audio.play() } else { audio.pause() }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    setCurrentTime(audio.currentTime)
    setProgress((audio.currentTime / audio.duration) * 100)
  }, [])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
  }, [])

  if (!hasAudio) return null
  if (loadFailed) return (
    <div className="audio-player-error">
      <span>{t('history.audioUnavailable')}</span>
    </div>
  )
  if (!src) return (
    <div className="audio-player-loading">
      <span>{t('history.loadingAudio')}</span>
    </div>
  )

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration) }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setProgress(0); setCurrentTime(0) }}
      />
      <button
        type="button"
        className="audio-player-btn"
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div
        className="audio-player-progress"
        onClick={handleSeek}
      >
        <div
          className="audio-player-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="audio-player-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  )
}

/* ── Confirm modal ────────────────────────────────────────────────── */

export const ConfirmModal = ({
  title,
  desc,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  desc: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  return (
    <motion.div
      className="confirm-overlay"
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="confirm-card"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: easeOutExpo }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{title}</p>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.5 }}>{desc}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="button-ghost" type="button" onClick={onCancel}>{t('common.cancel')}</button>
          <button className="button-ghost btn-danger" type="button" onClick={onConfirm}>{confirmLabel ?? t('common.clear')}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── History row (card) ───────────────────────────────────────────── */

export const HistoryRow = ({
  entry,
}: {
  entry: HistoryEntry
}) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const isError = entry.outcome === 'error'
  const hasText = Boolean(entry.outputText)
  const textPreview = entry.outputText
    || (isError ? (entry.errorMessage ?? t('history.noTextInserted')) : t('history.noTextInserted'))
  const modeLabel = entry.activationMode === 'push-to-talk' ? t('common.push') : t('common.toggle')
  const hasAudio = Boolean(entry.audioFilePath)
  const hasContext = Boolean(entry.submittedContext?.selectedText)
  const timelineStages = buildTimelineStages(entry)
  const hasMetrics = timelineStages.length > 0

  const handleCopy = useCallback(() => {
    if (!entry.outputText) return
    void navigator.clipboard.writeText(entry.outputText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [entry.outputText])

  return (
    <div className="hentry-card" data-outcome={entry.outcome}>
      {/* Main row - always visible */}
      <div className="hentry-row">
        {/* Content */}
        <button
          type="button"
          className="hentry-content"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
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
              <motion.div
                className="hentry-chevron"
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2, ease: easeOutExpo }}
              >
                <ChevronDown size={13} />
              </motion.div>
            </div>
          </div>
          <p className="hentry-preview" data-error={isError ? 'true' : undefined} data-muted={!hasText ? 'true' : undefined}>
            {textPreview}
          </p>
        </button>

        {/* Actions — always present, only opacity changes */}
        <div className="hentry-actions">
          {hasText && (
            <button
              type="button"
              className="hentry-action-btn"
              aria-label={copied ? t('history.copied') : t('history.copyText')}
              onClick={handleCopy}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }} style={{ display: 'flex', color: 'var(--status-ok)' }}>
                    <Check size={12} />
                  </motion.span>
                ) : (
                  <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
                    <Copy size={12} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}
          <button
            type="button"
            className="hentry-action-btn hentry-action-btn--danger"
            aria-label={t('history.deleteEntry')}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={12} />
          </button>
        </div>

      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="hentry-expanded-shell">
          <motion.div
            key="details"
            className="hentry-expanded"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: easeOutExpo }}
          >
              {/* Error message */}
              {entry.errorMessage && (
                <div className="hentry-error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{entry.errorMessage}</span>
                </div>
              )}

              {/* Context */}
              {hasContext && (
                <div className="hentry-context">
                  <div className="hentry-context-header">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>{t('history.selectionLabel')}</span>
                  </div>
                  <p className="hentry-context-text">{entry.submittedContext!.selectedText}</p>
                </div>
              )}

              {/* Processing timeline */}
              {hasMetrics && (
                <div className="hentry-section">
                  <div className="hentry-section-label">Processing</div>
                  <ProcessingTimeline stages={timelineStages} />
                </div>
              )}

              {/* Metrics grid */}
              <div className="hentry-metrics">
                <MetricChip
                  icon={() => (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                  )}
                  label={t('history.meta.model')}
                  value={entry.modelId.split('/').at(-1) ?? entry.modelId}
                />
                <MetricChip
                  icon={() => (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  )}
                  label={t('history.meta.latency')}
                  value={entry.durations.totalSessionMs ? `${Math.round(entry.durations.totalSessionMs)}ms` : entry.latencyMs > 0 ? `${Math.round(entry.latencyMs)}ms` : '—'}
                />
                <MetricChip
                  icon={() => (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                  )}
                  label={t('history.meta.mode')}
                  value={entry.insertion.effectiveMode === 'letter-by-letter' ? t('history.meta.letterByLetter') : t('history.meta.allAtOnce')}
                />
                <MetricChip
                  icon={() => (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="M7 15h0M2 9.5h20"/>
                    </svg>
                  )}
                  label={t('history.meta.method')}
                  value={entry.insertion.method === 'enigo-letter' ? t('history.meta.keyboard') : t('history.meta.clipboard')}
                />
                {entry.insertion.fallbackUsed && (
                  <MetricChip
                    icon={() => (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    )}
                    label={t('history.meta.fallback')}
                    value={t('history.meta.yes')}
                    warn
                  />
                )}
              </div>

              {/* Audio player */}
              {hasAudio && (
                <div className="hentry-section">
                  <div className="hentry-section-label">Recording</div>
                  <HistoryAudioPlayer entryId={entry.id} hasAudio={hasAudio} />
                </div>
              )}

          </motion.div>
        </div>
      )}

      {/* Confirm delete */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal
            title={t('history.confirmDeleteEntry')}
            desc={t('history.confirmDeleteEntryDesc')}
            confirmLabel={t('history.deleteEntry')}
            onConfirm={() => { void window.ditado.deleteHistoryEntry(entry.id); setConfirmDelete(false) }}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
