import { useDeferredValue, useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import type { DashboardTab, HistoryEntry, Settings } from '@shared/contracts'
import { hotkeyFromKeyboardEvent, isSupportedHotkey, normalizeHotkey } from '@shared/hotkeys'
import { StatusPill } from '@renderer/components/StatusPill'
import { useDashboardBridge, useDictationRecorder } from '@renderer/hooks/useDitadoBridge'

const tabs: Array<{ id: DashboardTab; label: string; kicker: string }> = [
  { id: 'overview', label: 'Overview', kicker: 'System view' },
  { id: 'settings', label: 'Settings', kicker: 'Tune behavior' },
  { id: 'history', label: 'History', kicker: 'Recent output' },
  { id: 'onboarding', label: 'Onboarding', kicker: 'First-use path' },
]

const easeOutExpo = [0.16, 1, 0.3, 1] as const

const formatDate = (value: string | null): string => (value ? new Date(value).toLocaleString() : 'Never')
const formatAudioDuration = (value: number): string => {
  const totalSeconds = Math.max(Math.round(value / 1000), 0)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
const summarizeContext = (entry: HistoryEntry): string => {
  const context = entry.submittedContext
  if (!context) {
    return `Legacy entry. App: ${entry.appName}${entry.windowTitle ? ` • Window: ${entry.windowTitle}` : ''}`
  }

  const parts = [
    `App: ${context.appName}`,
    context.windowTitle && `Window: ${context.windowTitle}`,
    context.selectedText && `Selection: ${context.selectedText}`,
    context.textBefore && `Before: ${context.textBefore}`,
    context.textAfter && `After: ${context.textAfter}`,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' • ') : `App: ${entry.appName}${entry.windowTitle ? ` • Window: ${entry.windowTitle}` : ''}`
}

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

const requestBrowserMicrophonePermission = async (): Promise<void> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    await window.ditado.requestMicrophoneAccess()
    return
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
  await window.ditado.requestMicrophoneAccess()
}

const sectionMotion = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: easeOutExpo },
}

const Section = ({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string
  title: string
  summary: string
  children: ReactNode
}) => (
  <section className="surface-panel px-5 py-5 md:px-7 md:py-6">
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] md:items-end">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="section-title mt-3">{title}</h2>
      </div>
      <p className="copy-soft min-w-0 text-sm md:text-[0.98rem]">{summary}</p>
    </div>
    <div className="ornament-line my-6" />
    {children}
  </section>
)

const Field = ({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: ReactNode
}) => (
  <label className="grid gap-2.5">
    <span className="text-sm font-medium text-[var(--text-1)]">{label}</span>
    <span className="copy-muted text-sm">{hint}</span>
    {children}
  </label>
)

const StatBlock = ({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) => (
  <div className="stat-block">
    <span className="eyebrow">{label}</span>
    <span className="stat-value mt-3">{value}</span>
    <p className="copy-muted mt-3 text-sm">{description}</p>
  </div>
)

export const DashboardWindow = ({ initialTab }: { initialTab: DashboardTab }) => {
  const state = useDashboardBridge()
  const reducedMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab)
  const [pendingApiKey, setPendingApiKey] = useState('')
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null)
  const [microphoneRefreshKey, setMicrophoneRefreshKey] = useState(0)
  const history = useDeferredValue(state.history)
  const { isRecording } = useDictationRecorder(state.session, state.settings.preferredMicrophoneId)
  const settings = draftSettings ?? state.settings

  const sessionStatus = state.session?.status ?? 'idle'
  const latestEntry = history[0] ?? null

  const updateSettings = async (patch: Partial<Settings>) => {
    const optimisticSettings = { ...settings, ...patch }
    setDraftSettings(optimisticSettings)

    try {
      const nextSettings = await window.ditado.updateSettings(patch)
      setDraftSettings(nextSettings)
      return nextSettings
    } catch (error) {
      setDraftSettings(state.settings)
      throw error
    }
  }

  const saveApiKey = async (): Promise<void> => {
    const optimisticSettings = { ...settings, apiKeyPresent: Boolean(pendingApiKey.trim()) }
    setDraftSettings(optimisticSettings)

    try {
      const nextSettings = await window.ditado.setApiKey(pendingApiKey)
      setDraftSettings(nextSettings)
      setPendingApiKey('')
    } catch (error) {
      setDraftSettings(state.settings)
      throw error
    }
  }

  const stageLabel =
    sessionStatus === 'idle'
      ? 'Standing by'
      : sessionStatus === 'listening'
        ? 'Capturing speech'
        : sessionStatus === 'processing'
          ? 'Drafting final text'
          : sessionStatus === 'streaming'
            ? 'Writing into field'
            : sessionStatus === 'completed'
              ? 'Last insertion landed'
              : sessionStatus === 'notice'
                ? 'Quick-tip guidance'
              : sessionStatus === 'permission-required'
                ? 'Permission blocked'
                : 'Recovery mode'

  const telemetrySample = state.telemetryTail.slice(0, 4)

  const renderOverview = () => (
    <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
      <section className="surface-panel surface-glow overflow-hidden px-5 py-5 md:px-7 md:py-7">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
          <div className="min-w-0">
            <div className="eyebrow">Desktop control room</div>
            <h1 className="display-title mt-4">Resident. Quiet. Ready.</h1>
            <p className="copy-soft mt-5 max-w-[42rem] text-[0.98rem] md:text-[1.04rem]">
              Ditado sits like a system utility, not a drafting surface. You call it, speak naturally, and it returns final writing with the local recovery trail still visible.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="button-primary" type="button" onClick={() => void window.ditado.toggleDictation()}>
                Start toggle dictation
              </button>
              <button className="button-secondary" type="button" onClick={() => void window.ditado.startPushToTalk()}>
                Arm push-to-talk
              </button>
              <button className="button-ghost" type="button" onClick={() => setActiveTab('settings')}>
                Open settings
              </button>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <StatBlock
                label="Current mode"
                value={isRecording ? 'Hot mic' : 'Ready'}
                description="Capture begins from global shortcuts instead of dragging you into a separate composer."
              />
              <StatBlock
                label="Context"
                value={settings.sendContextAutomatically ? 'Selected text' : 'Audio only'}
                description="The model gets field context only when available, and now the history keeps the exact snapshot that was sent."
              />
              <StatBlock
                label="Model"
                value={settings.modelId.split('/').at(-1) ?? settings.modelId}
                description="User-owned OpenRouter key, editable model id, and silence blocked before the request leaves the machine."
              />
            </div>
          </div>

          <aside className="surface-muted grid gap-4 rounded-[1.6rem] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Live stage</div>
                <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">{stageLabel}</div>
              </div>
              <StatusPill status={sessionStatus} />
            </div>
            <div className="ornament-line" />
            <div className="grid gap-3">
              <div className="text-sm font-medium text-[var(--text-1)]">
                {state.session?.targetApp ?? 'Foreground app'}
              </div>
              <p className="copy-soft wrap-safe text-sm">
                {state.session?.partialText?.trim() ||
                  'When the next dictation starts, this panel will show where the text is heading and how the system is responding.'}
              </p>
            </div>
            <div className="surface-muted rounded-[1.2rem] px-4 py-3">
              <div className="eyebrow">Last update check</div>
              <div className="mt-2 text-sm text-[var(--text-1)]">{formatDate(state.updateState.lastCheckedAt)}</div>
              <div className="mt-1 text-sm text-[var(--text-3)]">{state.updateState.status}</div>
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <Section
          eyebrow="Operational signals"
          title="The UI stays calm while the system stays explicit."
          summary="The dashboard avoids becoming an editor. It shows state, route-to-recovery, and only the details that change trust."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="surface-muted rounded-[1.45rem] p-4">
              <div className="eyebrow">Permissions</div>
              <div className="mt-3 text-lg font-semibold text-[var(--text-1)]">{state.permissions.microphone}</div>
              <p className="copy-soft mt-3 text-sm">
                Accessibility is {state.permissions.accessibility}. If context capture falls short, Ditado degrades to audio-first rather than blocking the flow.
              </p>
            </div>
            <div className="surface-muted rounded-[1.45rem] p-4">
              <div className="eyebrow">Last output</div>
              <div className="mt-3 text-lg font-semibold text-[var(--text-1)]">{latestEntry?.appName ?? 'No entries yet'}</div>
              <p className="copy-soft wrap-safe mt-3 text-sm">
                {latestEntry?.outputText ||
                  'The history rail will store recent insertions locally, giving you a recoverable trail without turning Ditado into a transcript archive.'}
              </p>
            </div>
          </div>
        </Section>

        <section className="surface-panel px-5 py-5">
          <div className="eyebrow">Telemetry tail</div>
          <h2 className="section-title mt-3">Minimal technical trace.</h2>
          <div className="ornament-line my-5" />
          <div className="grid gap-3">
            {telemetrySample.length === 0 ? (
              <div className="copy-soft text-sm">No technical events captured yet.</div>
            ) : (
              telemetrySample.map((event) => (
                <div key={event.id} className="surface-muted rounded-[1.2rem] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-[var(--text-1)]">{event.name}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">{event.kind}</div>
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-3)]">{formatDate(event.timestamp)}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </motion.div>
  )

  const renderSettings = () => (
    <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
      <Section
        eyebrow="Behavior controls"
        title="Tune how the layer behaves, not how it looks busy."
        summary="Settings stay operational and legible. The goal is faster trust-building, not a maze of switches."
      >
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
          <div className="grid gap-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="OpenRouter API key" hint="Stored locally with OS-backed encryption when available.">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    className="field"
                    placeholder={settings.apiKeyPresent ? 'Saved key' : 'sk-or-v1-...'}
                    type="password"
                    value={pendingApiKey}
                    onChange={(event) => setPendingApiKey(event.target.value)}
                  />
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => void saveApiKey()}
                  >
                    Save key
                  </button>
                </div>
              </Field>

              <Field label="Model id" hint="Any valid OpenRouter model id is allowed.">
                <input
                  className="field"
                  value={settings.modelId}
                  onChange={(event) => void updateSettings({ modelId: event.target.value })}
                />
              </Field>

              <Field label="Toggle hotkey" hint="Press once to start, once more to stop and send.">
                <HotkeyField
                  label="Toggle"
                  value={settings.toggleHotkey}
                  fallbackValue="Shift+Alt"
                  onCommit={(value) => void updateSettings({ toggleHotkey: value })}
                />
              </Field>

              <Field label="Push-to-talk hotkey" hint="Hold the combo, speak, release.">
                <HotkeyField
                  label="Push to talk"
                  value={settings.pushToTalkHotkey}
                  fallbackValue="Ctrl+Alt"
                  onCommit={(value) => void updateSettings({ pushToTalkHotkey: value })}
                />
              </Field>

              <Field label="Preferred microphone" hint="Keep system default or pin a specific device.">
                <MicrophoneSelect
                  refreshKey={microphoneRefreshKey}
                  selected={settings.preferredMicrophoneId}
                  onSelect={(deviceId) => void updateSettings({ preferredMicrophoneId: deviceId })}
                />
              </Field>

              <Field
                label="Insertion reveal"
                hint="Choose how the final text appears in the target field: in chunks, letter by letter, or all at once."
              >
                <select
                  className="field"
                  value={settings.insertionStreamingMode}
                  onChange={(event) =>
                    void updateSettings({
                      insertionStreamingMode: event.target.value as Settings['insertionStreamingMode'],
                    })
                  }
                  aria-label="Insertion reveal"
                >
                  <option value="chunks">Piece by piece (chunks)</option>
                  <option value="letter-by-letter">Letter by letter</option>
                  <option value="all-at-once">All at once</option>
                </select>
              </Field>

              <Field label="Permission refresh" hint="Re-check microphone access without leaving the app.">
                <div className="flex flex-wrap gap-3">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() =>
                      void requestBrowserMicrophonePermission()
                        .catch(() => undefined)
                        .then(() => {
                          setMicrophoneRefreshKey((value) => value + 1)
                        })
                    }
                  >
                    Request microphone
                  </button>
                  <button
                    className="button-ghost"
                    type="button"
                    onClick={() => setMicrophoneRefreshKey((value) => value + 1)}
                  >
                    Refresh microphones
                  </button>
                  <button className="button-ghost" type="button" onClick={() => void window.ditado.checkForUpdates()}>
                    Check updates
                  </button>
                </div>
              </Field>
            </div>
          </div>

          <aside className="grid gap-4">
            <ToggleRow
              label="Send context automatically"
              description="Selected text and foreground app metadata are sent when available."
              value={settings.sendContextAutomatically}
              onChange={(value) => void updateSettings({ sendContextAutomatically: value })}
            />
            <ToggleRow
              label="Launch on login"
              description="Keep Ditado resident in the tray so writing starts with one remembered shortcut."
              value={settings.launchOnLogin}
              onChange={(value) => void updateSettings({ launchOnLogin: value })}
            />
            <ToggleRow
              label="Telemetry enabled"
              description="Technical metrics only. No dictated content, no audio payloads."
              value={settings.telemetryEnabled}
              onChange={(value) => void updateSettings({ telemetryEnabled: value })}
            />
            <ToggleRow
              label="Auto updates"
              description="Direct-download distribution with a simple update channel."
              value={settings.autoUpdateEnabled}
              onChange={(value) => void updateSettings({ autoUpdateEnabled: value })}
            />
          </aside>
        </div>
      </Section>
    </motion.div>
  )

  const renderHistory = () => (
    <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
      <Section
        eyebrow="Local archive"
        title="Recent dictations stay available without becoming a product detour."
        summary="Entries are kept locally, prune with retention, and give the user a recovery rail instead of a transcript inbox."
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="copy-soft text-sm">Retention window: {settings.historyRetentionDays} days.</p>
          <button className="button-secondary" type="button" onClick={() => void window.ditado.clearHistory()}>
            Clear history
          </button>
        </div>
        <div className="grid gap-4">
          {history.length === 0 ? (
            <div className="surface-muted rounded-[1.5rem] px-5 py-6">
              <div className="eyebrow">No entries yet</div>
              <p className="copy-soft mt-3 text-sm">
                The first successful insertion will appear here with app context, saved audio, and the written result.
              </p>
            </div>
          ) : (
            history.map((entry, index) => <HistoryRow key={entry.id} entry={entry} index={index} />)
          )}
        </div>
      </Section>
    </motion.div>
  )

  const renderOnboarding = () => (
    <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
      <Section
        eyebrow="First-use path"
        title="Trust is built in five short moves."
        summary="The onboarding avoids teaching dictation as a command language. It teaches confidence: why permissions matter, where recovery lives, and how to begin fast."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            'Add your OpenRouter API key so Ditado can call the selected model.',
            'Grant microphone access and keep the app available in the tray.',
            'Choose one hotkey you can remember and one you can hold comfortably.',
            'Speak naturally; the model rewrites speech into final text, not raw transcript.',
            'If insertion fails, Ditado copies the latest result to the clipboard and tells you what happened.',
          ].map((item, index) => (
            <div key={item} className="surface-muted rounded-[1.45rem] px-5 py-5">
              <div className="eyebrow">Step 0{index + 1}</div>
              <p className="copy-soft mt-4 text-sm">{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="button-primary"
            type="button"
            onClick={() =>
              void updateSettings({ onboardingCompleted: true }).then(() => {
                setActiveTab('overview')
              })
            }
          >
            Finish onboarding
          </button>
          <button className="button-secondary" type="button" onClick={() => setActiveTab('settings')}>
            Open settings
          </button>
        </div>
      </Section>
    </motion.div>
  )

  return (
    <div className="app-shell">
      <div className="app-frame">
        <motion.header
          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6 grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]"
        >
          <aside className="surface-panel app-rail px-4 py-4 md:px-5 md:py-5">
            <div className="eyebrow">Ditado desktop</div>
            <div className="mt-4 text-[1.25rem] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
              Voice layer
            </div>
            <p className="copy-soft mt-3 text-sm">
              Tray-resident dictation for fields, chats, docs and code.
            </p>
            <div className="ornament-line my-5" />
            <nav className="grid gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className="rail-link"
                  data-active={activeTab === tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-medium text-current">{tab.label}</span>
                    <span className="mt-1 block text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">{tab.kicker}</span>
                  </span>
                  <span className="rail-dot" />
                </button>
              ))}
            </nav>
          </aside>

          <div className="surface-panel app-toolbar px-5 py-5 md:px-7 md:py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="eyebrow">Foreground writing system</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h1 className="text-[1.55rem] font-semibold tracking-[-0.05em] text-[var(--text-1)]">
                    Desktop workspace
                  </h1>
                  <div className="surface-muted rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--text-3)]">
                    {state.session?.targetApp ?? 'Foreground app'}
                  </div>
                </div>
                <p className="copy-soft mt-3 max-w-[42rem] text-[0.95rem]">
                  Hotkeys, permissions, local history and recovery all stay visible without turning the product into an editor.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="button-secondary" type="button" onClick={() => void window.ditado.toggleDictation()}>
                  Toggle
                </button>
                <button className="button-ghost" type="button" onClick={() => void window.ditado.startPushToTalk()}>
                  Push
                </button>
                <StatusPill status={sessionStatus} />
                <div className="surface-muted rounded-full px-4 py-2 text-sm text-[var(--text-2)]">
                  {settings.modelId}
                </div>
              </div>
            </div>
          </div>
        </motion.header>

        <div className="grid gap-6">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'settings' && renderSettings()}
          {activeTab === 'history' && renderHistory()}
          {activeTab === 'onboarding' && renderOnboarding()}
        </div>
      </div>
    </div>
  )
}

const HotkeyField = ({
  label,
  value,
  fallbackValue,
  onCommit,
}: {
  label: string
  value: string
  fallbackValue: string
  onCommit: (value: string) => Promise<void> | void
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
      <div className="flex flex-wrap gap-2">
        <button
          className="button-ghost min-h-0 px-0 py-0 text-xs"
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
    </div>
  )
}

const ToggleRow = ({
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

const MicrophoneSelect = ({
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

const HistoryRow = ({ entry, index }: { entry: HistoryEntry; index: number }) => (
  <div className="surface-muted rounded-[1.45rem] px-5 py-5">
    <div className="grid gap-4 lg:grid-cols-[4.2rem_minmax(0,1fr)_auto] lg:items-start">
      <div className="font-[var(--font-display)] text-[2.1rem] leading-none tracking-[-0.06em] text-[rgba(239,226,205,0.5)]">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="wrap-safe min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-1)]">{entry.appName}</span>
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">{entry.modelId}</span>
          {entry.audioDurationMs > 0 ? (
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">
              Audio {formatAudioDuration(entry.audioDurationMs)}
            </span>
          ) : null}
        </div>
        <p className="wrap-safe line-clamp-3 mt-3 text-sm leading-7 text-[var(--text-2)]">{entry.outputText}</p>
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

const HistoryAudioPlayer = ({
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

    void window.ditado.getHistoryAudio(entryId).then((value) => {
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
    }).catch(() => {
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
    return <div className="mt-4 text-xs text-[var(--text-3)]">Loading audio…</div>
  }

  return <audio className="mt-4 w-full max-w-[22rem]" controls preload="metadata" src={src} />
}
