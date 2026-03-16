import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import type { HistoryEntry } from '@shared/contracts'
import { hotkeyFromKeyboardEvent, isSupportedHotkey, normalizeHotkey } from '@shared/hotkeys'
import { formatAudioDuration, formatDate, summarizeContext } from './formatters'

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

/* ── History audio player ──────────────────────────────────────────── */

export const HistoryAudioPlayer = ({ entryId, hasAudio }: { entryId: string; hasAudio: boolean }) => {
  const [src, setSrc] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

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

  if (!hasAudio) return null
  if (loadFailed) return <div className="mt-2 text-xs" style={{ color: 'var(--status-error)' }}>Audio unavailable.</div>
  if (!src) return <div className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>Loading audio…</div>
  return <audio className="mt-2 w-full" style={{ maxWidth: '20rem', height: '28px' }} controls preload="metadata" src={src} />
}

/* ── History row ───────────────────────────────────────────────────── */

export const HistoryRow = ({ entry, index }: { entry: HistoryEntry; index: number }) => (
  <div className="surface-panel p-3">
    {/* Header */}
    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
      <span className="text-xs font-mono" style={{ color: 'var(--text-3)', width: '1.5rem', flexShrink: 0 }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{entry.appName}</span>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', height: '1rem',
          padding: '0 0.35rem', borderRadius: '999px', fontSize: '0.58rem', fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          border: entry.outcome === 'error' ? '1px solid rgba(210,90,80,0.22)' : '1px solid rgba(112,192,134,0.2)',
          background: entry.outcome === 'error' ? 'rgba(210,90,80,0.06)' : 'rgba(112,192,134,0.06)',
          color: entry.outcome === 'error' ? 'var(--status-error)' : 'var(--status-ok)',
        }}
      >
        {entry.outcome === 'error' ? 'err' : 'ok'}
      </span>
      <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
        {entry.modelId.split('/').at(-1) ?? entry.modelId}
      </span>
      {entry.audioDurationMs > 0 && (
        <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
          {formatAudioDuration(entry.audioDurationMs)}
        </span>
      )}
      <span className="text-xs ml-auto" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem' }}>
        {formatDate(entry.createdAt)}
      </span>
    </div>

    {/* Body */}
    {entry.errorMessage && (
      <p className="text-xs mb-1" style={{ color: 'var(--status-error)', lineHeight: 1.45 }}>{entry.errorMessage}</p>
    )}
    <p className="text-sm line-clamp-3 wrap-safe" style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
      {entry.outputText || (entry.outcome === 'error' ? 'No text inserted.' : '')}
    </p>

    {/* Meta */}
    <div className="mt-1.5 text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem' }}>
      {entry.requestedMode} · {entry.effectiveMode} · {entry.insertionMethod}
    </div>

    <HistoryAudioPlayer entryId={entry.id} hasAudio={Boolean(entry.audioFilePath)} />

    <details className="mt-2">
      <summary className="cursor-pointer text-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)', fontSize: '0.62rem' }}>
        Context
      </summary>
      <p className="mt-1.5 text-xs wrap-safe" style={{ color: 'var(--text-2)', lineHeight: 1.45 }}>
        {summarizeContext(entry)}
      </p>
    </details>
  </div>
)
