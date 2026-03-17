import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Settings } from '@shared/contracts'
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
  onRestartOnboarding,
}: {
  settings: Settings
  pendingApiKey: string
  setPendingApiKey: (value: string) => void
  saveApiKey: () => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  microphoneRefreshKey: number
  refreshMicrophones: () => void
  onRestartOnboarding: () => void
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
}) => {
  const { t } = useTranslation()
  const [shortcutStatus, setShortcutStatus] = useState<{ captureActive: boolean; uiohookRunning: boolean } | null>(null)

  useEffect(() => {
    void window.ditado.getShortcutStatus().then(setShortcutStatus)
  }, [])

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) 260px' }}>
      {/* ── Left column: settings form ── */}
      <div className="surface-panel p-4 grid gap-4 content-start">
        {/* API & Model */}
        <Section title={t('settings.apiAndModel')}>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label={t('settings.openRouterApiKey')} hint={t('settings.encryptedInOs')}>
              <div className="flex gap-2">
                <input
                  className="field field-mono"
                  placeholder={settings.apiKeyPresent ? t('settings.keySaved') : 'sk-or-v1-...'}
                  type="password"
                  value={pendingApiKey}
                  onChange={(e) => setPendingApiKey(e.target.value)}
                />
                <button className="button-secondary" type="button" style={{ flexShrink: 0 }} onClick={() => void saveApiKey()}>
                  {t('common.save')}
                </button>
              </div>
            </Field>
            <Field label={t('settings.modelId')} hint={t('settings.anyOpenRouterModel')}>
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
        <Section title={t('settings.hotkeys')}>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label={t('settings.toggleLabel')} hint={t('settings.toggleHint')}>
              <HotkeyField
                label={t('settings.toggleLabel')}
                value={settings.toggleHotkey}
                fallbackValue="Shift+Alt"
                onCommit={(v) => updateSettings({ toggleHotkey: v })}
              />
            </Field>
            <Field label={t('settings.pushToTalkLabel')} hint={t('settings.pushToTalkHint')}>
              <HotkeyField
                label={t('settings.pushToTalkLabel')}
                value={settings.pushToTalkHotkey}
                fallbackValue="Ctrl+Alt"
                onCommit={(v) => updateSettings({ pushToTalkHotkey: v })}
              />
            </Field>
          </div>
        </Section>

        <div className="divider" />

        {/* Audio */}
        <Section title={t('settings.audio')}>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr auto' }}>
            <Field label={t('settings.microphone')}>
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
                {t('common.grantAccess')}
              </button>
              <button className="button-ghost" type="button" onClick={refreshMicrophones}>{t('common.refresh')}</button>
            </div>
          </div>
        </Section>

        <div className="divider" />

        {/* Insertion */}
        <Section title={t('settings.insertion')}>
          <Field label={t('settings.revealMode')} hint={t('settings.revealModeHint')}>
            <select
              className="field"
              value={settings.insertionStreamingMode}
              onChange={(e) => void updateSettings({ insertionStreamingMode: e.target.value as Settings['insertionStreamingMode'] })}
              aria-label="Insertion reveal"
            >
              <option value="letter-by-letter">{t('settings.letterByLetter')}</option>
              <option value="all-at-once">{t('settings.allAtOnce')}</option>
            </select>
          </Field>
        </Section>

        <div className="divider" />

        {/* System */}
        <Section title={t('settings.system')}>
          <div className="flex gap-2 flex-wrap">
            <button className="button-ghost" type="button" onClick={() => void window.ditado.checkForUpdates()}>
              {t('settings.checkForUpdates')}
            </button>
            <button
              className="button-ghost"
              type="button"
              title={t('settings.resetShortcutCaptureHint')}
              onClick={() => {
                void window.ditado.setHotkeyCaptureActive(false)
                void window.ditado.getShortcutStatus().then(setShortcutStatus)
              }}
            >
              {t('settings.resetShortcutCapture')}
            </button>
            <button
              className="button-ghost"
              type="button"
              title={t('settings.restartSetupWizardHint')}
              onClick={onRestartOnboarding}
            >
              {t('settings.restartSetupWizard')}
            </button>
          </div>
          {shortcutStatus && (
            <div className="surface-muted p-2.5 text-xs grid gap-1" style={{ borderRadius: '0.4rem' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-3)' }}>{t('settings.keyboardHook')}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: shortcutStatus.uiohookRunning ? 'var(--status-ok)' : 'var(--status-error)' }}>
                  {shortcutStatus.uiohookRunning ? t('settings.hookRunning') : t('settings.hookFailed')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-3)' }}>{t('settings.captureMode')}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: shortcutStatus.captureActive ? 'var(--status-error)' : 'var(--status-ok)' }}>
                  {shortcutStatus.captureActive ? t('settings.captureLocked') : t('settings.captureUnlocked')}
                </span>
              </div>
              {!shortcutStatus.uiohookRunning && (
                <div className="mt-1" style={{ color: 'var(--text-3)', lineHeight: 1.45 }}>
                  {t('settings.hookFailedMessage')}
                </div>
              )}
            </div>
          )}
        </Section>

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
            <option value="pt-BR">Português (Brasil)</option>
            <option value="es">Español</option>
          </select>
        </label>

        <div className="divider" />
        <div className="section-label">{t('settings.behavior')}</div>
        <ToggleRow
          label={t('settings.sendContext')}
          description={t('settings.sendContextDesc')}
          value={settings.sendContextAutomatically}
          onChange={(v) => void updateSettings({ sendContextAutomatically: v })}
        />
        <ToggleRow
          label={t('settings.launchOnLogin')}
          description={t('settings.launchOnLoginDesc')}
          value={settings.launchOnLogin}
          onChange={(v) => void updateSettings({ launchOnLogin: v })}
        />

        <div className="divider" />
        <div className="section-label">{t('settings.updatesAndTelemetry')}</div>
        <ToggleRow
          label={t('settings.telemetry')}
          description={t('settings.telemetryDesc')}
          value={settings.telemetryEnabled}
          onChange={(v) => void updateSettings({ telemetryEnabled: v })}
        />
        <ToggleRow
          label={t('settings.autoUpdate')}
          description={t('settings.autoUpdateDesc')}
          value={settings.autoUpdateEnabled}
          onChange={(v) => void updateSettings({ autoUpdateEnabled: v })}
        />
        <ToggleRow
          label={t('settings.betaChannel')}
          description={t('settings.betaChannelDesc')}
          value={settings.updateChannel === 'beta'}
          onChange={(v) => void updateSettings({ updateChannel: v ? 'beta' : 'stable' })}
        />
      </div>
    </div>
  )
}
