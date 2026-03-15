import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

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

export const SettingsPanel = ({
  settings,
  pendingApiKey,
  setPendingApiKey,
  saveApiKey,
  updateSettings,
  microphoneRefreshKey,
  refreshMicrophones,
  reducedMotion,
  sectionMotion,
}: {
  settings: Settings
  pendingApiKey: string
  setPendingApiKey: (value: string) => void
  saveApiKey: () => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  microphoneRefreshKey: number
  refreshMicrophones: () => void
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
}) => (
  <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
    <section className="surface-panel px-5 py-5 md:px-7 md:py-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] md:items-end">
        <div className="min-w-0">
          <div className="eyebrow">Behavior controls</div>
          <h2 className="section-title mt-3">Tune how the layer behaves.</h2>
        </div>
        <p className="copy-soft min-w-0 text-sm md:text-[0.98rem]">
          Settings stay operational and legible. The goal is faster trust-building, not a maze of switches.
        </p>
      </div>
      <div className="ornament-line my-6" />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <div className="grid gap-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <Field label="OpenRouter API key" hint="Stored locally only when secure OS storage is available.">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="field"
                  placeholder={settings.apiKeyPresent ? 'Saved key' : 'sk-or-v1-...'}
                  type="password"
                  value={pendingApiKey}
                  onChange={(event) => setPendingApiKey(event.target.value)}
                />
                <button className="button-secondary" type="button" onClick={() => void saveApiKey()}>
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
                onCommit={(value) => updateSettings({ toggleHotkey: value })}
              />
            </Field>

            <Field label="Push-to-talk hotkey" hint="Hold the combo, speak, release.">
              <HotkeyField
                label="Push to talk"
                value={settings.pushToTalkHotkey}
                fallbackValue="Ctrl+Alt"
                onCommit={(value) => updateSettings({ pushToTalkHotkey: value })}
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
                      .then(refreshMicrophones)
                  }
                >
                  Request microphone
                </button>
                <button className="button-ghost" type="button" onClick={refreshMicrophones}>
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
            description="Selected text and foreground metadata are sent when available."
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
    </section>
  </motion.div>
)
