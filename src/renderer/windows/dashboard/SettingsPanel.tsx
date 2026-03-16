import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'

import type { InsertionBenchmarkResult, Settings } from '@shared/contracts'
import { HotkeyField, MicrophoneSelect, ToggleRow } from './controls'

const requestBrowserMicrophonePermission = async (): Promise<void> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    await window.ditado.requestMicrophoneAccess()
    return
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
  await window.ditado.requestMicrophoneAccess()
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <div className="section-label">{title}</div>
    <div className="grid gap-3 mt-1">{children}</div>
  </div>
)

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="grid gap-1">
    <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{label}</span>
    {hint ? <span className="text-xs" style={{ color: 'var(--text-3)' }}>{hint}</span> : null}
    {children}
  </label>
)

export const SettingsPanel = ({
  settings,
  pendingApiKey,
  setPendingApiKey,
  saveApiKey,
  updateSettings,
  microphoneRefreshKey,
  refreshMicrophones,
  benchmarkText,
  setBenchmarkText,
  resetBenchmarkText,
  benchmarkCountdown,
  benchmarkRunning,
  benchmarkResult,
  benchmarkError,
  runInsertionBenchmark,
}: {
  settings: Settings
  pendingApiKey: string
  setPendingApiKey: (value: string) => void
  saveApiKey: () => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  microphoneRefreshKey: number
  refreshMicrophones: () => void
  benchmarkText: string
  setBenchmarkText: (value: string) => void
  resetBenchmarkText: () => void
  benchmarkCountdown: number | null
  benchmarkRunning: boolean
  benchmarkResult: InsertionBenchmarkResult | null
  benchmarkError: string | null
  runInsertionBenchmark: () => void
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
}) => {
  const { t } = useTranslation()
  const [benchmarkOpen, setBenchmarkOpen] = useState(true)
  const [shortcutStatus, setShortcutStatus] = useState<{ captureActive: boolean; uiohookRunning: boolean } | null>(null)

  useEffect(() => {
    void window.ditado.getShortcutStatus().then(setShortcutStatus)
  }, [])

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) 260px' }}>
      {/* ── Left column: settings form ── */}
      <div className="surface-panel p-4 grid gap-4 content-start">
        {/* API & Model */}
        <Section title="API &amp; Model">
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="OpenRouter API key" hint="Encrypted in OS secure storage.">
              <div className="flex gap-2">
                <input
                  className="field field-mono"
                  placeholder={settings.apiKeyPresent ? 'Key saved' : 'sk-or-v1-...'}
                  type="password"
                  value={pendingApiKey}
                  onChange={(e) => setPendingApiKey(e.target.value)}
                />
                <button className="button-secondary" type="button" style={{ flexShrink: 0 }} onClick={() => void saveApiKey()}>
                  Save
                </button>
              </div>
            </Field>
            <Field label="Model ID" hint="Any OpenRouter model.">
              <input
                className="field field-mono"
                value={settings.modelId}
                onChange={(e) => void updateSettings({ modelId: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        <div className="divider" />

        {/* Hotkeys */}
        <Section title="Hotkeys">
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Toggle" hint="Press to start, press again to send.">
              <HotkeyField
                label="Toggle"
                value={settings.toggleHotkey}
                fallbackValue="Shift+Alt"
                onCommit={(v) => updateSettings({ toggleHotkey: v })}
              />
            </Field>
            <Field label="Push-to-talk" hint="Hold to speak, release to send.">
              <HotkeyField
                label="Push to talk"
                value={settings.pushToTalkHotkey}
                fallbackValue="Ctrl+Alt"
                onCommit={(v) => updateSettings({ pushToTalkHotkey: v })}
              />
            </Field>
          </div>
        </Section>

        <div className="divider" />

        {/* Audio */}
        <Section title="Audio">
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr auto' }}>
            <Field label="Microphone">
              <MicrophoneSelect
                refreshKey={microphoneRefreshKey}
                selected={settings.preferredMicrophoneId}
                onSelect={(id) => void updateSettings({ preferredMicrophoneId: id })}
              />
            </Field>
            <div className="flex gap-2 items-end">
              <button
                className="button-secondary"
                type="button"
                onClick={() => void requestBrowserMicrophonePermission().catch(() => undefined).then(refreshMicrophones)}
              >
                Grant access
              </button>
              <button className="button-ghost" type="button" onClick={refreshMicrophones}>Refresh</button>
            </div>
          </div>
        </Section>

        <div className="divider" />

        {/* Insertion */}
        <Section title="Insertion">
          <Field label="Reveal mode" hint="How text appears in the target field.">
            <select
              className="field"
              value={settings.insertionStreamingMode}
              onChange={(e) => void updateSettings({ insertionStreamingMode: e.target.value as Settings['insertionStreamingMode'] })}
              aria-label="Insertion reveal"
            >
              <option value="letter-by-letter">Letter by letter (streaming)</option>
              <option value="all-at-once">All at once (clipboard paste)</option>
            </select>
          </Field>
        </Section>

        <div className="divider" />

        {/* System */}
        <Section title="System">
          <div className="flex gap-2 flex-wrap">
            <button className="button-ghost" type="button" onClick={() => void window.ditado.checkForUpdates()}>
              Check for updates
            </button>
            <button
              className="button-ghost"
              type="button"
              title="If shortcuts stop responding, click this to reset the shortcut capture lock."
              onClick={() => {
                void window.ditado.setHotkeyCaptureActive(false)
                void window.ditado.getShortcutStatus().then(setShortcutStatus)
              }}
            >
              Reset shortcut capture
            </button>
          </div>
          {shortcutStatus && (
            <div className="surface-muted p-2.5 text-xs grid gap-1" style={{ borderRadius: '0.4rem' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-3)' }}>Keyboard hook</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: shortcutStatus.uiohookRunning ? 'var(--status-ok)' : 'var(--status-error)' }}>
                  {shortcutStatus.uiohookRunning ? 'running' : 'failed to start'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-3)' }}>Capture mode</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: shortcutStatus.captureActive ? 'var(--status-error)' : 'var(--status-ok)' }}>
                  {shortcutStatus.captureActive ? 'locked (shortcuts suspended)' : 'unlocked'}
                </span>
              </div>
              {!shortcutStatus.uiohookRunning && (
                <div className="mt-1" style={{ color: 'var(--text-3)', lineHeight: 1.45 }}>
                  The keyboard hook failed. Check that no antivirus or security software is blocking it, or try running the app as administrator.
                </div>
              )}
            </div>
          )}
        </Section>

        <div className="divider" />

        {/* Benchmark (collapsible) */}
        <div>
          <button
            className="section-label flex items-center gap-1 cursor-pointer"
            style={{ background: 'none', border: 'none', padding: '0.5rem 0' }}
            type="button"
            onClick={() => setBenchmarkOpen(!benchmarkOpen)}
          >
            <ChevronDown
              size={12}
              style={{
                transition: 'transform 120ms ease',
                transform: benchmarkOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            />
            Insertion Benchmark
          </button>
          {benchmarkOpen && (
            <div className="grid gap-2 mt-1">
              <Field label="Test text" hint="Focus a disposable text field, then click run.">
                <textarea
                  className="field"
                  style={{ minHeight: '5rem', resize: 'vertical' }}
                  placeholder="Enter text to measure insertion speed."
                  value={benchmarkText}
                  onChange={(e) => setBenchmarkText(e.target.value)}
                  aria-label="Benchmark text"
                />
              </Field>
              <div className="flex items-center gap-2">
                <button
                  className="button-secondary"
                  type="button"
                  disabled={benchmarkRunning || benchmarkCountdown !== null}
                  onClick={runInsertionBenchmark}
                >
                  {benchmarkCountdown !== null
                    ? `Focus field in ${benchmarkCountdown}s`
                    : benchmarkRunning
                      ? 'Running…'
                      : 'Run benchmark'}
                </button>
                <button className="button-ghost" type="button" onClick={resetBenchmarkText}>Reset text</button>
              </div>
              {benchmarkResult && (
                <div className="surface-muted p-2.5 text-xs">
                  <div style={{ color: 'var(--text-1)' }}>
                    {benchmarkResult.charactersPerSecond.toFixed(1)} chars/s in {benchmarkResult.targetApp}
                  </div>
                  <div className="mt-1" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {benchmarkResult.graphemeCount} chars · {Math.round(benchmarkResult.durationMs)}ms · {benchmarkResult.mode} via {benchmarkResult.insertionMethod}
                    {benchmarkResult.fallbackUsed ? ' · fallback' : ''}
                  </div>
                </div>
              )}
              {benchmarkError && (
                <div className="p-2.5 text-xs" style={{ borderRadius: '0.4rem', border: '1px solid rgba(210,90,80,0.2)', background: 'rgba(210,90,80,0.06)', color: 'var(--status-error)' }}>
                  {benchmarkError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right column: appearance + behavior toggles ── */}
      <div className="surface-panel p-4 grid gap-3 content-start">
        <div className="section-label">{t('settings.appearance')}</div>
        <label className="grid gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{t('settings.theme')}</span>
          <select
            className="field"
            value={settings.theme}
            onChange={(e) => void updateSettings({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="system">{t('common.system')}</option>
            <option value="dark">{t('common.dark')}</option>
            <option value="light">{t('common.light')}</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{t('settings.language')}</span>
          <select
            className="field"
            value={settings.language}
            onChange={(e) => void updateSettings({ language: e.target.value as Settings['language'] })}
          >
            <option value="system">{t('common.system')}</option>
            <option value="en">English</option>
            <option value="pt-BR">Portugues (Brasil)</option>
            <option value="es">Espanol</option>
          </select>
        </label>

        <div className="divider" />
        <div className="section-label">Behavior</div>
        <ToggleRow
          label="Send context automatically"
          description="Sends focused app and selection to the model."
          value={settings.sendContextAutomatically}
          onChange={(v) => void updateSettings({ sendContextAutomatically: v })}
        />
        <ToggleRow
          label="Launch on login"
          description="Start in the system tray on boot."
          value={settings.launchOnLogin}
          onChange={(v) => void updateSettings({ launchOnLogin: v })}
        />

        <div className="divider" />
        <div className="section-label">Updates &amp; Telemetry</div>
        <ToggleRow
          label="Telemetry"
          description="Technical telemetry only: no audio or dictated text. Builds without OTLP config stay local-only."
          value={settings.telemetryEnabled}
          onChange={(v) => void updateSettings({ telemetryEnabled: v })}
        />
        <ToggleRow
          label="Auto updates"
          description="Download and install updates automatically."
          value={settings.autoUpdateEnabled}
          onChange={(v) => void updateSettings({ autoUpdateEnabled: v })}
        />
        <ToggleRow
          label="Beta channel"
          description="Receive prerelease builds."
          value={settings.updateChannel === 'beta'}
          onChange={(v) => void updateSettings({ updateChannel: v ? 'beta' : 'stable' })}
        />
      </div>
    </div>
  )
}
