import { Check, Mic, Shield, X } from 'lucide-react'

import { StatusPill } from '@renderer/components/StatusPill'
import type { DashboardViewModel } from '@shared/contracts'
import { formatDate } from './formatters'

const updateStatusCopy = {
  idle: 'Up to date',
  checking: 'Checking…',
  available: 'Update available',
  downloading: 'Downloading…',
  downloaded: 'Ready on restart',
  disabled: 'Disabled',
  error: 'Check failed',
  unsupported: 'Dev build',
} as const

const stageCopy: Record<string, string> = {
  idle: 'Standing by',
  arming: 'Opening mic',
  listening: 'Capturing speech',
  processing: 'Drafting text',
  streaming: 'Writing output',
  completed: 'Insertion done',
  notice: 'Notice',
  'permission-required': 'Permission blocked',
  error: 'Error',
}

export const OverviewPanel = ({
  state,
  isRecording,
  openSettings,
}: {
  state: DashboardViewModel
  isRecording: boolean
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
  openSettings: () => void
}) => {
  const latestEntry = state.history[0] ?? null
  const sessionStatus = state.session?.status ?? 'idle'
  const stageLabel = stageCopy[sessionStatus] ?? 'Unknown'
  const telemetrySample = state.telemetryTail.slice(0, 5)
  const modelShort = state.settings.modelId.split('/').at(-1) ?? state.settings.modelId
  const micOk = state.permissions.microphone === 'granted'
  const accOk = state.permissions.accessibility === 'granted'
  const apiOk = state.settings.apiKeyPresent

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? <Check size={12} style={{ color: 'var(--status-ok)' }} /> : <X size={12} style={{ color: 'var(--status-error)' }} />

  return (
    <div className="grid gap-3">
      {/* Row 1: Status + Quick actions */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr auto' }}>
        <div className="surface-panel p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <StatusPill status={sessionStatus} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{stageLabel}</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {state.session?.targetApp ?? '—'}
            </span>
          </div>
          {state.session?.partialText ? (
            <div className="surface-muted p-2.5 text-sm wrap-safe" style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
              {state.session.partialText}
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>
              Use a shortcut to begin dictating into the focused application.
            </div>
          )}
        </div>

        <div className="surface-panel p-4 grid gap-2 content-start" style={{ width: '160px' }}>
          <button className="button-primary w-full" type="button" onClick={() => void window.ditado.toggleDictation()}>
            Toggle
          </button>
          <button className="button-secondary w-full" type="button" onClick={() => void window.ditado.startPushToTalk()}>
            Push-to-talk
          </button>
          <button className="button-ghost w-full" type="button" onClick={openSettings}>
            Settings
          </button>
        </div>
      </div>

      {/* Row 2: Metrics */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="metric-card">
          <div className="metric-label">Status</div>
          <div className="metric-value">{isRecording ? 'Recording' : 'Idle'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Context</div>
          <div className="metric-value">{state.settings.sendContextAutomatically ? 'Auto' : 'Off'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Model</div>
          <div className="metric-value" title={state.settings.modelId}>{modelShort}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Reveal</div>
          <div className="metric-value">
            {state.settings.insertionStreamingMode === 'letter-by-letter' ? 'Stream' : 'Instant'}
          </div>
        </div>
      </div>

      {/* Row 3: Health + Last output + Telemetry */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '200px 1fr 260px' }}>
        {/* Health */}
        <div className="surface-panel p-4">
          <div className="eyebrow mb-3">
            <Shield size={10} className="inline -mt-px mr-1" />System health
          </div>
          <div className="health-row">
            <span className="health-label">API key</span>
            <StatusIcon ok={apiOk} />
          </div>
          <div className="health-row">
            <span className="health-label"><Mic size={11} className="inline -mt-px mr-0.5" /> Microphone</span>
            <StatusIcon ok={micOk} />
          </div>
          <div className="health-row">
            <span className="health-label">Accessibility</span>
            <StatusIcon ok={accOk} />
          </div>
          <div className="health-row">
            <span className="health-label">Updates</span>
            <span className="health-value" style={{ color: 'var(--text-2)', fontSize: '0.68rem' }}>
              {updateStatusCopy[state.updateState.status]}
            </span>
          </div>
        </div>

        {/* Last output */}
        <div className="surface-panel p-4">
          <div className="eyebrow mb-2">Last output</div>
          {latestEntry ? (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{latestEntry.appName}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {latestEntry.modelId.split('/').at(-1)}
                </span>
              </div>
              <p className="text-sm wrap-safe line-clamp-3" style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>
                {latestEntry.outputText || 'No text inserted.'}
              </p>
              <div className="mt-2 text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                {formatDate(latestEntry.createdAt)}
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>No dictation history yet.</p>
          )}
        </div>

        {/* Telemetry */}
        <div className="surface-panel p-4">
          <div className="eyebrow mb-2">Events</div>
          {telemetrySample.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>No events captured.</p>
          ) : (
            <div className="grid gap-1">
              {telemetrySample.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-2" style={{ padding: '0.2rem 0' }}>
                  <span className="text-xs" style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0, fontSize: '0.62rem' }}>
                    {event.kind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
