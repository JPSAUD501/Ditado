import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import type { HistoryEntry } from '@shared/contracts'
import { hotkeyFromKeyboardEvent, isSupportedHotkey, normalizeHotkey } from '@shared/hotkeys'
import { formatAudioDuration, formatDate, summarizeContext } from './formatters'

const easeOutExpo = [0.16, 1, 0.3, 1] as const

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
    return () => {
      void window.ditado.setHotkeyCaptureActive(false)
    }
  }, [])

  const stopCapture = (): void => {
    setIsCapturing(false)
    void window.ditado.setHotkeyCaptureActive(false)
  }

  const startCapture = (): void => {
    setIsCapturing(true)
    void window.ditado.setHotkeyCaptureActive(true)
  }

  return (
    <div className="grid gap-2">
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

          if (event.key === 'Escape') {
            setDraft(value)
            stopCapture()
            return
          }

          const next = hotkeyFromKeyboardEvent(event)
          if (!next || !isSupportedHotkey(next)) {
            return
          }

          const normalized = normalizeHotkey(next)
          if (!normalized) {
            return
          }

          setDraft(normalized)
          stopCapture()
          void onCommit(normalized)
        }}
      >
        <span className={visibleValue ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}>
          {isCapturing ? 'Press the combo now' : visibleValue}
        </span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-3)]">
          {isCapturing ? 'capturing' : label}
        </span>
      </button>
      <button
        className="button-ghost min-h-0 justify-start px-0 py-0 text-xs"
        type="button"
        onClick={() => {
          setDraft(fallbackValue)
          stopCapture()
          void onCommit(fallbackValue)
        }}
      >
        Reset to {fallbackValue}
      </button>
    </div>
  )
}

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
}) => (
  <div className="surface-muted rounded-[1.45rem] px-4 py-4">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--text-1)]">{label}</div>
        <p className="copy-muted mt-2 text-sm">{description}</p>
      </div>
      <button
        className="relative inline-flex h-8 w-14 shrink-0 rounded-full border border-[rgba(247,239,227,0.12)] bg-[rgba(255,248,240,0.06)]"
        type="button"
        aria-label={label}
        aria-pressed={value}
        onClick={() => onChange(!value)}
      >
        <motion.span
          animate={{ x: value ? 24 : 0 }}
          transition={{ duration: 0.22, ease: easeOutExpo }}
          className="pointer-events-none absolute left-1 top-1 h-6 w-6 rounded-full bg-[linear-gradient(180deg,rgba(244,238,230,1),rgba(214,194,162,0.94))]"
        />
      </button>
    </div>
  </div>
)

const enumerateBrowserMicrophones = async (): Promise<Array<{ deviceId: string; label: string }>> => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return window.ditado.listMicrophones()
  }

  const devices = await navigator.mediaDevices.enumerateDevices()
  const microphones = devices
    .filter((device) => device.kind === 'audioinput')
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || 'System microphone',
    }))

  if (microphones.length > 0) {
    return microphones
  }

  return window.ditado.listMicrophones()
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
      .then((result) => {
        if (mounted) {
          setDevices(result)
        }
      })
      .catch(() => {
        if (mounted) {
          setDevices([])
        }
      })

    return () => {
      mounted = false
    }
  }, [refreshKey])

  return (
    <select
      className="field"
      value={selected ?? ''}
      onChange={(event) => onSelect(event.target.value || null)}
      aria-label="Preferred microphone"
    >
      <option value="">System default</option>
      {devices.length === 0 ? <option value="" disabled>No microphones detected</option> : null}
      {devices.map((device) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label}
        </option>
      ))}
    </select>
  )
}

export const HistoryAudioPlayer = ({
  entryId,
  hasAudio,
}: {
  entryId: string
  hasAudio: boolean
}) => {
  const [src, setSrc] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let mounted = true
    let objectUrl: string | null = null
    if (!hasAudio) {
      return () => {
        mounted = false
      }
    }

    void window.ditado.getHistoryAudio(entryId)
      .then((value) => {
        if (!mounted || !value) {
          if (mounted) {
            setLoadFailed(true)
          }
          return
        }

        const binary = atob(value.base64)
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: value.mimeType }))
        setSrc(objectUrl)
        setLoadFailed(false)
      })
      .catch(() => {
        if (mounted) {
          setLoadFailed(true)
        }
      })

    return () => {
      mounted = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [entryId, hasAudio])

  if (!hasAudio) {
    return null
  }

  if (loadFailed) {
    return <div className="mt-4 text-xs text-[var(--danger)]">Audio unavailable for this entry.</div>
  }

  if (!src) {
    return <div className="mt-4 text-xs text-[var(--text-3)]">Loading audio...</div>
  }

  return <audio className="mt-4 w-full max-w-[22rem]" controls preload="metadata" src={src} />
}

export const HistoryRow = ({ entry, index }: { entry: HistoryEntry; index: number }) => (
  <div className="surface-muted rounded-[1.45rem] px-5 py-5">
    <div className="grid gap-4 lg:grid-cols-[4.2rem_minmax(0,1fr)_auto] lg:items-start">
      <div className="font-[var(--font-display)] text-[2.1rem] leading-none tracking-[-0.06em] text-[rgba(239,226,205,0.5)]">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="wrap-safe min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-1)]">{entry.appName}</span>
          <span
            className={
              entry.outcome === 'error'
                ? 'rounded-full border border-[rgba(255,120,120,0.22)] bg-[rgba(255,94,94,0.1)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--danger)]'
                : 'rounded-full border border-[rgba(127,220,170,0.18)] bg-[rgba(93,181,127,0.1)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[rgba(166,230,192,0.92)]'
            }
          >
            {entry.outcome === 'error' ? 'Error' : 'Done'}
          </span>
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">{entry.modelId}</span>
          {entry.audioDurationMs > 0 ? (
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">
              Audio {formatAudioDuration(entry.audioDurationMs)}
            </span>
          ) : null}
        </div>
        {entry.errorMessage ? (
          <p className="wrap-safe mt-3 text-sm leading-7 text-[var(--danger)]">{entry.errorMessage}</p>
        ) : null}
        <p className="wrap-safe line-clamp-3 mt-3 text-sm leading-7 text-[var(--text-2)]">
          {entry.outputText || (entry.outcome === 'error' ? 'No text was inserted before the failure.' : '')}
        </p>
        <HistoryAudioPlayer entryId={entry.id} hasAudio={Boolean(entry.audioFilePath)} />
        <details className="mt-4 rounded-[1rem] border border-[rgba(247,239,227,0.08)] bg-[rgba(255,248,240,0.035)] px-4 py-3">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-[var(--text-3)]">
            Model context
          </summary>
          <p className="wrap-safe mt-3 text-sm leading-6 text-[var(--text-2)]">{summarizeContext(entry)}</p>
        </details>
      </div>
      <div className="text-left lg:text-right">
        <div className="eyebrow">Captured</div>
        <div className="mt-2 text-sm text-[var(--text-2)]">{formatDate(entry.createdAt)}</div>
      </div>
    </div>
  </div>
)
