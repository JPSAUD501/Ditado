import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Pause, Play } from 'lucide-react'

import type { HistoryEntry } from '@shared/contracts'
import { hotkeyFromKeyboardEvent, isSupportedHotkey, normalizeHotkey } from '@shared/hotkeys'
import { formatDate, summarizeContext } from './formatters'

const easeOutExpo = [0.16, 1, 0.3, 1] as const

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
          {isCapturing ? 'Press combo…' : visibleValue}
        </span>
        <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: isCapturing ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
          {isCapturing ? 'capturing' : label}
        </span>
      </button>
      <button
        className="button-ghost"
        style={{ height: 'auto', padding: 0, fontSize: '0.68rem', justifyContent: 'flex-start', color: 'var(--text-3)' }}
        type="button"
        onClick={() => { setDraft(fallbackValue); stopCapture(); void onCommit(fallbackValue) }}
      >
        Reset to {fallbackValue}
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
  const mics = devices.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label || 'System microphone' }))
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
  const [devices, setDevices] = useState<Array<{ deviceId: string; label: string }>>([])

  useEffect(() => {
    let mounted = true
    void enumerateBrowserMicrophones()
      .then((r) => { if (mounted) setDevices(r) })
      .catch(() => { if (mounted) setDevices([]) })
    return () => { mounted = false }
  }, [refreshKey])

  return (
    <select className="field" value={selected ?? ''} onChange={(e) => onSelect(e.target.value || null)} aria-label="Preferred microphone">
      <option value="">System default</option>
      {devices.length === 0 ? <option value="" disabled>No microphones detected</option> : null}
      {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
    </select>
  )
}

/* ── Custom audio player ──────────────────────────────────────────── */

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
  if (loadFailed) return <div className="mt-2 text-xs" style={{ color: 'var(--status-error)' }}>{t('history.audioUnavailable')}</div>
  if (!src) return <div className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>{t('history.loadingAudio')}</div>

  return (
    <div className="mt-2 flex items-center gap-2" style={{ maxWidth: '20rem' }}>
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
        className="button-ghost"
        style={{ width: 26, height: 26, padding: 0, borderRadius: '50%', flexShrink: 0 }}
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div
        style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-3)', cursor: 'pointer', position: 'relative' }}
        onClick={handleSeek}
      >
        <div
          style={{
            height: '100%', borderRadius: 2, background: 'var(--accent)',
            width: `${progress}%`, transition: 'width 100ms linear',
          }}
        />
      </div>
      <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', flexShrink: 0 }}>
        {formatTime(currentTime)}/{formatTime(duration)}
      </span>
    </div>
  )
}

/* ── History row (expandable) ─────────────────────────────────────── */

export const HistoryRow = ({ entry, index }: { entry: HistoryEntry; index: number }) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const outputPreview = entry.outputText || (entry.outcome === 'error' ? t('history.noTextInserted') : '')

  return (
    <div className="surface-panel" style={{ overflow: 'hidden' }}>
      {/* Clickable header (always visible) */}
      <button
        type="button"
        className="w-full text-left"
        style={{
          padding: '0.625rem 0.75rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: '1.5rem', flexShrink: 0 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--text-1)', flexShrink: 0 }}>{entry.appName}</span>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', height: '1rem',
            padding: '0 0.35rem', borderRadius: '999px', fontSize: '0.58rem', fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase' as const, flexShrink: 0,
            border: entry.outcome === 'error' ? '1px solid rgba(210,90,80,0.22)' : '1px solid rgba(112,192,134,0.2)',
            background: entry.outcome === 'error' ? 'rgba(210,90,80,0.06)' : 'rgba(112,192,134,0.06)',
            color: entry.outcome === 'error' ? 'var(--status-error)' : 'var(--status-ok)',
          }}
        >
          {entry.outcome === 'error' ? t('history.err') : t('history.ok')}
        </span>
        <span
          className="text-xs"
          style={{
            color: 'var(--text-2)', flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {outputPreview}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', flexShrink: 0 }}>
          {formatDate(entry.createdAt)}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2, ease: easeOutExpo }}
          style={{ flexShrink: 0, color: 'var(--text-3)' }}
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>

      {/* Expandable details */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: easeOutExpo }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: '0.625rem' }}>
                {/* Error message */}
                {entry.errorMessage && (
                  <p className="text-xs mb-1.5" style={{ color: 'var(--status-error)', lineHeight: 1.45 }}>{entry.errorMessage}</p>
                )}

                {/* Full output text */}
                <p className="text-sm wrap-safe" style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {outputPreview}
                </p>

                {/* Meta info — labeled chips */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(
                    [
                      { label: t('history.meta.model'),  value: entry.modelId.split('/').at(-1) ?? entry.modelId },
                      { label: t('history.meta.mode'),   value: entry.effectiveMode === 'letter-by-letter' ? t('history.meta.letterByLetter') : t('history.meta.allAtOnce') },
                      { label: t('history.meta.method'), value: entry.insertionMethod === 'enigo-letter' ? t('history.meta.keyboard') : t('history.meta.clipboard') },
                      entry.fallbackUsed
                        ? { label: t('history.meta.fallback'), value: t('history.meta.yes'), warn: true }
                        : null,
                    ] as Array<{ label: string; value: string; warn?: boolean } | null>
                  ).filter(Boolean).map((chip) => chip && (
                    <span
                      key={chip.label}
                      style={{
                        display: 'inline-flex', flexDirection: 'column', gap: '0.1rem',
                        padding: '0.2rem 0.45rem', borderRadius: '0.3rem',
                        background: chip.warn ? 'rgba(210,175,110,0.08)' : 'var(--bg-2)',
                        border: `1px solid ${chip.warn ? 'rgba(210,175,110,0.22)' : 'var(--border)'}`,
                      }}
                    >
                      <span style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: chip.warn ? 'var(--status-process)' : 'var(--text-3)' }}>
                        {chip.label}
                      </span>
                      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: chip.warn ? 'var(--status-process)' : 'var(--text-1)' }}>
                        {chip.value}
                      </span>
                    </span>
                  ))}
                </div>

                {/* Audio player */}
                <HistoryAudioPlayer entryId={entry.id} hasAudio={Boolean(entry.audioFilePath)} />

                {/* Context */}
                <div className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.6rem', fontWeight: 600 }}>
                    {t('history.context')}
                  </span>
                  <p className="mt-1 wrap-safe" style={{ color: 'var(--text-2)', lineHeight: 1.45 }}>
                    {summarizeContext(entry)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
