import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle, KeyRound, Mic, Repeat, Sparkles, Zap } from 'lucide-react'

import type { DictationSession, Settings } from '@shared/contracts'
import { HotkeyField, MicrophoneSelect } from './controls'

type WizardProps = {
  settings: Settings
  session: DictationSession | null
  pendingApiKey: string
  setPendingApiKey: (value: string) => void
  saveApiKey: () => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  microphoneRefreshKey: number
  refreshMicrophones: () => void
  finishOnboarding: () => Promise<void>
}

const TOTAL_STEPS = 6

export const OnboardingWizard = ({
  settings,
  session,
  pendingApiKey,
  setPendingApiKey,
  saveApiKey,
  updateSettings,
  microphoneRefreshKey,
  refreshMicrophones,
  finishOnboarding,
}: WizardProps) => {
  const reducedMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [apiKeySaved, setApiKeySaved] = useState(settings.apiKeyPresent)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [pushTalkDone, setPushTalkDone] = useState(false)
  const [toggleDone, setToggleDone] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  const prev = () => setStep((s) => Math.max(s - 1, 0))

  const handleSaveApiKey = async () => {
    setApiKeyError(null)
    try {
      await saveApiKey()
      setApiKeySaved(true)
      next()
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Failed to save API key. Check that secure storage is available on this device.')
    }
  }

  const canProceed = () => {
    if (step === 0) return apiKeySaved || pendingApiKey.trim().length > 0
    if (finishing) return false
    return true
  }

  const handleNext = () => {
    if (step === 0 && pendingApiKey.trim()) {
      void handleSaveApiKey()
      return
    }
    if (step === TOTAL_STEPS - 1) {
      setFinishing(true)
      void finishOnboarding().catch(() => setFinishing(false))
      return
    }
    next()
  }

  return (
    <div className="wizard-backdrop">
      <motion.div
        className="wizard-card"
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Progress bar */}
        <div className="wizard-progress">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className="wizard-progress-dot"
              data-active={i === step ? 'true' : undefined}
              data-done={i < step ? 'true' : undefined}
            />
          ))}
        </div>

        {/* Step content */}
        <motion.div
          key={step}
          initial={reducedMotion ? false : { opacity: 0, x: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {step === 0 && (
            <StepApiKey
              settings={settings}
              pendingApiKey={pendingApiKey}
              setPendingApiKey={setPendingApiKey}
              apiKeySaved={apiKeySaved}
              apiKeyError={apiKeyError}
              updateSettings={updateSettings}
            />
          )}
          {step === 1 && (
            <StepHotkeys
              settings={settings}
              updateSettings={updateSettings}
            />
          )}
          {step === 2 && (
            <StepMicrophone
              settings={settings}
              updateSettings={updateSettings}
              microphoneRefreshKey={microphoneRefreshKey}
              refreshMicrophones={refreshMicrophones}
            />
          )}
          {step === 3 && (
            <StepPushToTalkDemo
              settings={settings}
              session={session}
              done={pushTalkDone}
              onDone={() => setPushTalkDone(true)}
            />
          )}
          {step === 4 && (
            <StepToggleDemo
              settings={settings}
              session={session}
              done={toggleDone}
              onDone={() => setToggleDone(true)}
            />
          )}
          {step === 5 && <StepReady settings={settings} />}
        </motion.div>

        {/* Actions */}
        <div className="wizard-actions">
          {step > 0 ? (
            <button className="button-ghost" type="button" onClick={prev} disabled={finishing}>
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {step < TOTAL_STEPS - 1 && step > 0 && (
              <button className="button-ghost" type="button" onClick={next} style={{ fontSize: '0.72rem' }}>
                Skip
              </button>
            )}
            <button
              className="button-primary button-lg"
              type="button"
              disabled={!canProceed()}
              onClick={handleNext}
            >
              {finishing
                ? 'Saving…'
                : step === 0 && !apiKeySaved && pendingApiKey.trim()
                  ? 'Save & continue'
                  : step === TOTAL_STEPS - 1
                    ? <><Check size={14} /> Finish setup</>
                    : <>Continue <ArrowRight size={14} /></>
              }
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ── Step 0: API Key + Model ───────────────────────────────────────── */

const StepApiKey = ({
  settings,
  pendingApiKey,
  setPendingApiKey,
  apiKeySaved,
  apiKeyError,
  updateSettings,
}: {
  settings: Settings
  pendingApiKey: string
  setPendingApiKey: (value: string) => void
  apiKeySaved: boolean
  apiKeyError: string | null
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => (
  <div>
    <div className="wizard-step-label"><KeyRound size={12} className="inline -mt-px mr-1" />Step 1 of {TOTAL_STEPS}</div>
    <div className="wizard-title">Connect your API</div>
    <div className="wizard-desc">
      Ditado uses OpenRouter to access language models. Enter your API key to get started.
    </div>

    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>OpenRouter API key</span>
        <input
          className="field field-mono"
          placeholder={apiKeySaved ? 'Key saved' : 'sk-or-v1-...'}
          type="password"
          value={pendingApiKey}
          onChange={(e) => setPendingApiKey(e.target.value)}
          autoFocus
        />
        {apiKeySaved && !apiKeyError && (
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--status-ok)' }}>
            <CheckCircle size={12} /> Key configured
          </span>
        )}
        {apiKeyError && (
          <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--status-error)' }}>
            <AlertCircle size={12} /> {apiKeyError}
          </span>
        )}
      </label>

      <label className="grid gap-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Model</span>
        <input
          className="field field-mono"
          value={settings.modelId}
          onChange={(e) => void updateSettings({ modelId: e.target.value })}
        />
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          Any OpenRouter-compatible model ID.
        </span>
      </label>
    </div>
  </div>
)

/* ── Step 1: Hotkeys ───────────────────────────────────────────────── */

const StepHotkeys = ({
  settings,
  updateSettings,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => (
  <div>
    <div className="wizard-step-label"><Zap size={12} className="inline -mt-px mr-1" />Step 2 of {TOTAL_STEPS}</div>
    <div className="wizard-title">Set your shortcuts</div>
    <div className="wizard-desc">
      Two global shortcuts control dictation. Press any modifier combo to change them.
    </div>

    <div className="grid gap-4">
      <div className="grid gap-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
          Toggle — press to start, press again to stop &amp; send
        </span>
        <HotkeyField
          label="Toggle"
          value={settings.toggleHotkey}
          fallbackValue="Shift+Alt"
          onCommit={(value) => updateSettings({ toggleHotkey: value })}
        />
      </div>

      <div className="grid gap-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
          Push-to-talk — hold to speak, release to send
        </span>
        <HotkeyField
          label="Push to talk"
          value={settings.pushToTalkHotkey}
          fallbackValue="Ctrl+Alt"
          onCommit={(value) => updateSettings({ pushToTalkHotkey: value })}
        />
      </div>
    </div>
  </div>
)

/* ── Step 2: Microphone ────────────────────────────────────────────── */

const StepMicrophone = ({
  settings,
  updateSettings,
  microphoneRefreshKey,
  refreshMicrophones,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  microphoneRefreshKey: number
  refreshMicrophones: () => void
}) => {
  const requestMic = async () => {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    }
    await window.ditado.requestMicrophoneAccess()
    refreshMicrophones()
  }

  return (
    <div>
      <div className="wizard-step-label"><Mic size={12} className="inline -mt-px mr-1" />Step 3 of {TOTAL_STEPS}</div>
      <div className="wizard-title">Microphone access</div>
      <div className="wizard-desc">
        Ditado needs microphone permission to capture your voice. Select a device or keep the system default.
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Microphone</span>
          <MicrophoneSelect
            refreshKey={microphoneRefreshKey}
            selected={settings.preferredMicrophoneId}
            onSelect={(deviceId) => void updateSettings({ preferredMicrophoneId: deviceId })}
          />
        </label>

        <div className="flex gap-2">
          <button className="button-secondary" type="button" onClick={() => void requestMic()}>
            Grant permission
          </button>
          <button className="button-ghost" type="button" onClick={refreshMicrophones}>
            Refresh devices
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Demo step shared ──────────────────────────────────────────────── */

const demoStatusLabel: Partial<Record<string, string>> = {
  idle: 'Waiting for input…',
  arming: 'Arming…',
  listening: 'Recording — speak now',
  processing: 'Processing audio…',
  streaming: 'Writing result…',
  completed: 'Done!',
  error: 'Error during dictation',
}

const demoStatusColor: Partial<Record<string, string>> = {
  listening: 'var(--status-listen)',
  processing: 'var(--status-process)',
  streaming: 'var(--status-write)',
  completed: 'var(--status-ok)',
  error: 'var(--status-error)',
}

/* ── Step 3: Push-to-talk demo ─────────────────────────────────────── */

const StepPushToTalkDemo = ({
  settings,
  session,
  done,
  onDone,
}: {
  settings: Settings
  session: DictationSession | null
  done: boolean
  onDone: () => void
}) => {
  const status = session?.status ?? 'idle'
  const isRelevant = session?.activationMode === 'push-to-talk' && status !== 'idle'

  useEffect(() => {
    if (session?.activationMode === 'push-to-talk' && status === 'completed' && !done) {
      onDone()
    }
  }, [status, session?.activationMode, done, onDone])

  const statusColor = isRelevant ? (demoStatusColor[status] ?? 'var(--text-3)') : done ? 'var(--status-ok)' : 'var(--text-3)'
  const statusText = done && !isRelevant
    ? 'Successfully recorded!'
    : isRelevant
      ? (demoStatusLabel[status] ?? status)
      : 'Waiting for input…'

  return (
    <div>
      <div className="wizard-step-label"><Mic size={12} className="inline -mt-px mr-1" />Step 4 of {TOTAL_STEPS}</div>
      <div className="wizard-title">Try push-to-talk</div>
      <div className="wizard-desc">
        Hold your push-to-talk shortcut while speaking. Release to transcribe and insert text.
      </div>

      <div className="surface-muted p-4 grid gap-3" style={{ borderRadius: '0.6rem', marginTop: '0.75rem' }}>
        <div className="flex items-center gap-3">
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
            background: statusColor,
            boxShadow: isRelevant && status === 'listening' ? `0 0 0 3px ${statusColor}33` : 'none',
          }} />
          <div>
            <div className="text-sm font-medium" style={{ color: statusColor }}>{statusText}</div>
            {done && !isRelevant
              ? <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>You can continue or try again.</div>
              : <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  Hold <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{settings.pushToTalkHotkey}</span> to record
                </div>
            }
          </div>
          {done && !isRelevant && <CheckCircle size={16} style={{ color: 'var(--status-ok)', marginLeft: 'auto', flexShrink: 0 }} />}
        </div>
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.5 }}>
        If shortcuts aren't responding, check system accessibility permissions or use the "Push" button in the top bar while on the main dashboard. You can skip this step and continue.
      </p>
    </div>
  )
}

/* ── Step 4: Toggle demo ───────────────────────────────────────────── */

const StepToggleDemo = ({
  settings,
  session,
  done,
  onDone,
}: {
  settings: Settings
  session: DictationSession | null
  done: boolean
  onDone: () => void
}) => {
  const status = session?.status ?? 'idle'
  const isRelevant = session?.activationMode === 'toggle' && status !== 'idle'

  useEffect(() => {
    if (session?.activationMode === 'toggle' && status === 'completed' && !done) {
      onDone()
    }
  }, [status, session?.activationMode, done, onDone])

  const statusColor = isRelevant ? (demoStatusColor[status] ?? 'var(--text-3)') : done ? 'var(--status-ok)' : 'var(--text-3)'
  const statusText = done && !isRelevant
    ? 'Successfully recorded!'
    : isRelevant
      ? (demoStatusLabel[status] ?? status)
      : 'Waiting for input…'

  return (
    <div>
      <div className="wizard-step-label"><Repeat size={12} className="inline -mt-px mr-1" />Step 5 of {TOTAL_STEPS}</div>
      <div className="wizard-title">Try toggle dictation</div>
      <div className="wizard-desc">
        Press the toggle shortcut once to start recording, then press again to stop and send.
      </div>

      <div className="surface-muted p-4 grid gap-3" style={{ borderRadius: '0.6rem', marginTop: '0.75rem' }}>
        <div className="flex items-center gap-3">
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
            background: statusColor,
            boxShadow: isRelevant && status === 'listening' ? `0 0 0 3px ${statusColor}33` : 'none',
          }} />
          <div>
            <div className="text-sm font-medium" style={{ color: statusColor }}>{statusText}</div>
            {done && !isRelevant
              ? <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>You can continue or try again.</div>
              : <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  Press <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{settings.toggleHotkey}</span> to start, press again to stop
                </div>
            }
          </div>
          {done && !isRelevant && <CheckCircle size={16} style={{ color: 'var(--status-ok)', marginLeft: 'auto', flexShrink: 0 }} />}
        </div>
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.5 }}>
        If shortcuts aren't responding, check system accessibility permissions or use the "Toggle" button in the top bar while on the main dashboard. You can skip this step and continue.
      </p>
    </div>
  )
}

/* ── Step 5: Ready ─────────────────────────────────────────────────── */

const StepReady = ({ settings }: { settings: Settings }) => (
  <div>
    <div className="wizard-step-label"><Sparkles size={12} className="inline -mt-px mr-1" />Step 6 of {TOTAL_STEPS}</div>
    <div className="wizard-title">You're all set</div>
    <div className="wizard-desc">
      Ditado runs in the system tray. Use your shortcuts to start dictating — speak naturally and the model writes polished text into the focused field.
    </div>

    <div className="surface-muted p-3 grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-2)' }}>API key</span>
        <span className="text-xs" style={{ color: settings.apiKeyPresent ? 'var(--status-ok)' : 'var(--status-error)', fontFamily: 'var(--font-mono)' }}>
          {settings.apiKeyPresent ? 'Configured' : 'Not set'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-2)' }}>Model</span>
        <span className="text-xs" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
          {settings.modelId.split('/').at(-1) ?? settings.modelId}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-2)' }}>Toggle</span>
        <span className="text-xs" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
          {settings.toggleHotkey}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-2)' }}>Push-to-talk</span>
        <span className="text-xs" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
          {settings.pushToTalkHotkey}
        </span>
      </div>
    </div>

    <p className="mt-3 text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.5 }}>
      If insertion fails, the result stays in your clipboard. You can change all settings later from the dashboard.
    </p>
  </div>
)
