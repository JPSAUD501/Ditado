import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Globe, KeyRound, Mic, Moon, MousePointerClick,
  RefreshCw, Settings2, SlidersHorizontal, Type,
} from 'lucide-react'

import type { Settings } from '@shared/contracts'
import { defaultPushToTalkHotkey, defaultToggleHotkey } from '@shared/defaults'
import { HotkeyField, MicrophoneSelect, ToggleRow } from './controls'

const requestBrowserMicrophonePermission = async (): Promise<void> => {
  await window.ditado.requestMicrophoneAccess()
}

/* ── Section component ─────────────────────────────────────────────── */

const Section = ({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: React.FC<{ size?: number; strokeWidth?: number }>
  children: ReactNode
}) => (
  <div className="settings-section">
    <div className="settings-section-header">
      {Icon && (
        <div className="settings-section-icon">
          <Icon size={13} strokeWidth={2} />
        </div>
      )}
      <span className="settings-section-title">{title}</span>
    </div>
    <div className="settings-section-body">{children}</div>
  </div>
)

/* ── Field component ───────────────────────────────────────────────── */

const Field = ({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) => (
  <label className="grid gap-1">
    <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{label}</span>
    {hint ? <span className="text-xs" style={{ color: 'var(--text-3)' }}>{hint}</span> : null}
    {children}
  </label>
)

/* ── Main component ─────────────────────────────────────────────────── */

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
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    void window.ditado.getShortcutStatus().then(setShortcutStatus)
  }, [])

  const handleSaveApiKey = async () => {
    setSaveState('saving')
    try {
      await saveApiKey()
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('idle')
    }
  }

  const hookProblem = shortcutStatus && (!shortcutStatus.uiohookRunning || shortcutStatus.captureActive)

  return (
    <div className="settings-layout">
      {/* ── Left column ── */}
      <div className="grid gap-3">

        {/* API & Model */}
        <div className="surface-panel p-4">
          <Section title={t('settings.apiAndModel')} icon={KeyRound}>
            <Field label={t('settings.openRouterApiKey')} hint={t('settings.encryptedInOs')}>
              <div className="flex gap-2">
                <input
                  className="field field-mono"
                  placeholder={settings.apiKeyPresent ? t('settings.keySaved') : 'sk-or-v1-...'}
                  type="password"
                  value={pendingApiKey}
                  onChange={(e) => setPendingApiKey(e.target.value)}
                />
                <button
                  className={saveState === 'saved' ? 'button-primary' : 'button-secondary'}
                  type="button"
                  style={{ flexShrink: 0 }}
                  disabled={saveState === 'saving' || !pendingApiKey.trim()}
                  onClick={() => void handleSaveApiKey()}
                >
                  {saveState === 'saving' ? t('common.saving') : saveState === 'saved' ? '✓ Saved' : t('common.save')}
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
          </Section>
        </div>

        {/* Hotkeys */}
        <div className="surface-panel p-4">
          <Section title={t('settings.hotkeys')} icon={MousePointerClick}>
            <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label={t('settings.toggleLabel')} hint={t('settings.toggleHint')}>
                <HotkeyField
                  label={t('settings.toggleLabel')}
                  value={settings.toggleHotkey}
                  fallbackValue={defaultToggleHotkey}
                  onCommit={(v) => updateSettings({ toggleHotkey: v })}
                />
              </Field>
              <Field label={t('settings.pushToTalkLabel')} hint={t('settings.pushToTalkHint')}>
                <HotkeyField
                  label={t('settings.pushToTalkLabel')}
                  value={settings.pushToTalkHotkey}
                  fallbackValue={defaultPushToTalkHotkey}
                  onCommit={(v) => updateSettings({ pushToTalkHotkey: v })}
                />
              </Field>
            </div>
          </Section>
        </div>

        {/* Audio */}
        <div className="surface-panel p-4">
          <Section title={t('settings.audio')} icon={Mic}>
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
                <button className="button-ghost" type="button" onClick={refreshMicrophones}>
                  {t('common.refresh')}
                </button>
              </div>
            </div>
          </Section>
        </div>

        {/* Insertion */}
        <div className="surface-panel p-4">
          <Section title={t('settings.insertion')} icon={Type}>
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
        </div>

        {/* System — only shows troublesome states */}
        <div className="surface-panel p-4">
          <Section title={t('settings.system')} icon={Settings2}>
            <div className="flex gap-2 flex-wrap">
              <button className="button-ghost" type="button" onClick={() => void window.ditado.checkForUpdates()}>
                <RefreshCw size={13} /> {t('settings.checkForUpdates')}
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

            {/* Only show hook status when there's a problem */}
            {hookProblem && (
              <div className="settings-alert-box">
                <AlertTriangle size={13} style={{ color: 'var(--status-error)', flexShrink: 0 }} />
                <div className="grid gap-1">
                  {!shortcutStatus?.uiohookRunning && (
                    <div className="flex items-center gap-2">
                      <span style={{ color: 'var(--text-2)', fontSize: '0.75rem', fontWeight: 500 }}>
                        {t('settings.keyboardHook')}:
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--status-error)' }}>
                        {t('settings.hookFailed')}
                      </span>
                    </div>
                  )}
                  {shortcutStatus?.captureActive && (
                    <div className="flex items-center gap-2">
                      <span style={{ color: 'var(--text-2)', fontSize: '0.75rem', fontWeight: 500 }}>
                        {t('settings.captureMode')}:
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--status-error)' }}>
                        {t('settings.captureLocked')}
                      </span>
                    </div>
                  )}
                  {!shortcutStatus?.uiohookRunning && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.45, marginTop: '0.25rem' }}>
                      {t('settings.hookFailedMessage')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="grid gap-3 content-start">

        {/* Appearance */}
        <div className="surface-panel p-4">
          <Section title={t('settings.appearance')} icon={Moon}>
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
          </Section>
        </div>

        {/* Behavior */}
        <div className="surface-panel p-4">
          <Section title={t('settings.behavior')} icon={SlidersHorizontal}>
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
          </Section>
        </div>

        {/* Updates & Telemetry */}
        <div className="surface-panel p-4">
          <Section title={t('settings.updatesAndTelemetry')} icon={Globe}>
            <ToggleRow
              label={t('settings.betaChannel')}
              description={t('settings.betaChannelDesc')}
              value={settings.updateChannel === 'beta'}
              onChange={(v) => void updateSettings({ updateChannel: v ? 'beta' : 'stable' })}
            />
            <ToggleRow
              label={t('settings.telemetry')}
              description={t('settings.telemetryDesc')}
              value={settings.telemetryEnabled}
              onChange={(v) => void updateSettings({ telemetryEnabled: v })}
            />
          </Section>
        </div>
      </div>
    </div>
  )
}
