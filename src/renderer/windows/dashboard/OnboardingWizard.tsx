import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle, ExternalLink,
  KeyRound, Mic, MessageSquareQuote, Monitor, Moon, Repeat, Sparkles, Sun, Zap,
} from 'lucide-react'

import type { DictationSession, Settings } from '@shared/contracts'
import { defaultPushToTalkHotkey, defaultToggleHotkey } from '@shared/defaults'
import { formatHotkeyForDisplay } from '@shared/hotkeys'
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

const TOTAL_STEPS = 7
const easeOutExpo = [0.16, 1, 0.3, 1] as const

const demoStatusColor: Partial<Record<string, string>> = {
  listening: 'var(--status-listen)',
  processing: 'var(--status-process)',
  streaming: 'var(--status-write)',
  completed: 'var(--status-ok)',
  error: 'var(--status-error)',
}

/* -- Animated status dot -------------------------------------------------- */

const StatusDot = ({ color, pulse }: { color: string; pulse: boolean }) => (
  <motion.div
    style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: color }}
    animate={{
      boxShadow: pulse
        ? [`0 0 0 0px ${color}55`, `0 0 0 5px ${color}00`]
        : `0 0 0 0px ${color}00`,
    }}
    transition={pulse ? { duration: 1.1, repeat: Infinity, ease: 'easeOut' } : { duration: 0.25 }}
  />
)

/* -- Theme card ----------------------------------------------------------- */

const ThemeCard = ({
  value, current, icon: Icon, label, onChange,
}: {
  value: Settings['theme']
  current: Settings['theme']
  icon: React.FC<{ size?: number; strokeWidth?: number }>
  label: string
  onChange: (v: Settings['theme']) => void
}) => {
  const active = current === value
  return (
    <motion.button
      type="button"
      onClick={() => onChange(value)}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
        padding: '0.75rem 0.5rem', borderRadius: '0.6rem', cursor: 'pointer',
        position: 'relative',
        border: `1px solid ${active ? 'rgba(210,175,110,0.4)' : 'var(--border)'}`,
        background: active ? 'var(--accent-muted)' : 'var(--bg-2)',
        color: active ? 'var(--accent)' : 'var(--text-2)',
        transition: 'border-color 150ms ease, background 150ms ease, color 150ms ease',
      }}
      whileTap={{ scale: 0.95 }}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{label}</span>
      {active && (
        <motion.div
          layoutId="theme-check"
          style={{ position: 'absolute', top: 6, right: 6 }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        >
          <Check size={10} />
        </motion.div>
      )}
    </motion.button>
  )
}

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
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [apiKeySaved, setApiKeySaved] = useState(settings.apiKeyPresent)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [pushTalkDone, setPushTalkDone] = useState(false)
  const [toggleDone, setToggleDone] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const goNext = () => { setDirection(1); setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)) }
  const goPrev = () => { setDirection(-1); setStep((s) => Math.max(s - 1, 0)) }

  const handleSaveApiKey = async () => {
    setApiKeyError(null)
    try {
      await saveApiKey()
      setApiKeySaved(true)
      goNext()
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Failed to save API key.')
    }
  }

  const canProceed = () => {
    if (finishing) return false
    if (step === 1) return apiKeySaved || pendingApiKey.trim().length > 0
    if (step === 4) return pushTalkDone
    if (step === 5) return toggleDone
    return true
  }

  const handleNext = () => {
    if (step === 1 && pendingApiKey.trim()) { void handleSaveApiKey(); return }
    if (step === TOTAL_STEPS - 1) {
      setFinishing(true)
      void finishOnboarding().catch(() => setFinishing(false))
      return
    }
    goNext()
  }

  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 22 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -22 }),
  }

  return (
    <motion.div
      className="wizard-backdrop"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={reducedMotion ? undefined : { opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <motion.div
        className="wizard-card"
        initial={reducedMotion ? false : { opacity: 0, y: 30, scale: 0.94 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: easeOutExpo, delay: 0.08 }}
      >
        {/* Progress dots */}
        <div className="wizard-progress">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <motion.div
              key={i}
              className="wizard-progress-dot"
              data-active={i === step ? 'true' : undefined}
              data-done={i < step ? 'true' : undefined}
              layout
              transition={{ duration: 0.25, ease: easeOutExpo }}
            />
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={reducedMotion ? undefined : slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: easeOutExpo }}
          >
            {step === 0 && <StepWelcome />}
            {step === 1 && (
              <StepApiKey
                settings={settings}
                pendingApiKey={pendingApiKey}
                setPendingApiKey={setPendingApiKey}
                apiKeySaved={apiKeySaved}
                apiKeyError={apiKeyError}
                updateSettings={updateSettings}
              />
            )}
            {step === 2 && (
              <StepAppearance settings={settings} updateSettings={updateSettings} />
            )}
            {step === 3 && (
              <StepMicrophone
                settings={settings}
                updateSettings={updateSettings}
                microphoneRefreshKey={microphoneRefreshKey}
                refreshMicrophones={refreshMicrophones}
              />
            )}
            {step === 4 && (
              <StepPushToTalkDemo
                settings={settings}
                session={session}
                done={pushTalkDone}
                onDone={() => setPushTalkDone(true)}
                updateSettings={updateSettings}
              />
            )}
            {step === 5 && (
              <StepToggleDemo
                settings={settings}
                session={session}
                done={toggleDone}
                onDone={() => setToggleDone(true)}
                updateSettings={updateSettings}
              />
            )}
            {step === 6 && <StepReady settings={settings} />}
          </motion.div>
        </AnimatePresence>

        {/* Actions */}
        <div className="wizard-actions">
          {step > 0 ? (
            <button className="button-ghost" type="button" onClick={goPrev} disabled={finishing}>
              <ArrowLeft size={14} /> {t('common.back')}
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            {step < TOTAL_STEPS - 1 && step > 1 && (
              <button className="button-ghost" type="button" onClick={goNext} style={{ fontSize: '0.72rem' }}>
                {t('common.skip')}
              </button>
            )}
            <button
              className="button-primary button-lg"
              type="button"
              disabled={!canProceed()}
              onClick={handleNext}
            >
              {finishing ? t('common.saving')
                : step === 1 && !apiKeySaved && pendingApiKey.trim() ? t('common.saveAndContinue')
                : step === TOTAL_STEPS - 1 ? <><Check size={14} /> {t('common.finishSetup')}</>
                : <>{t('common.continue')} <ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* -- Step 0: Welcome ------------------------------------------------------ */

const FeatureHighlight = ({
  text,
  delay,
  icon: Icon,
}: {
  text: string
  delay: number
  icon: React.FC<{ size?: number; strokeWidth?: number }>
}) => (
  <motion.div
    style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
      padding: '0.65rem 0.75rem', borderRadius: '0.55rem',
      background: 'var(--accent-muted)', border: '1px solid rgba(210,175,110,0.15)',
    }}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.28, ease: easeOutExpo, delay }}
  >
    <div style={{
      width: 24, height: 24, borderRadius: 7,
      background: 'rgba(210,175,110,0.18)', border: '1px solid rgba(210,175,110,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--accent)', flexShrink: 0,
    }}>
      <Icon size={13} strokeWidth={2} />
    </div>
    <span className="text-xs" style={{ color: 'var(--text-1)', lineHeight: 1.55 }}>{text}</span>
  </motion.div>
)

const StepWelcome = () => {
  const { t } = useTranslation()
  return (
    <div>
      <div className="wizard-step-label">
        <Sparkles size={11} className="inline -mt-px mr-1" />
        {t('common.stepOf', { step: 1, total: TOTAL_STEPS })}
      </div>
      <div className="wizard-title">{t('onboarding.welcomeTitle')}</div>
      <div className="wizard-desc">{t('onboarding.welcomeDesc')}</div>

      <div className="grid gap-2" style={{ marginTop: '0.5rem' }}>
        <FeatureHighlight
          text={t('onboarding.featureContextAware')}
          delay={0.08}
          icon={MessageSquareQuote}
        />
        <FeatureHighlight
          text={t('onboarding.featureStreaming')}
          delay={0.16}
          icon={Zap}
        />
        <FeatureHighlight
          text={t('onboarding.featureWorksEverywhere')}
          delay={0.24}
          icon={Monitor}
        />
      </div>
    </div>
  )
}

/* -- Step 1: API Key ------------------------------------------------------ */

const StepApiKey = ({
  settings, pendingApiKey, setPendingApiKey, apiKeySaved, apiKeyError, updateSettings,
}: {
  settings: Settings
  pendingApiKey: string
  setPendingApiKey: (v: string) => void
  apiKeySaved: boolean
  apiKeyError: string | null
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => {
  const { t } = useTranslation()
  return (
    <div>
      <div className="wizard-step-label"><KeyRound size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 2, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.connectApi')}</div>
      <div className="wizard-desc">
        {t('onboarding.connectApiDesc')}{' '}
        <a
          href="https://openrouter.ai/keys"
          onClick={(e) => {
            e.preventDefault()
            void window.ditado.openExternalUrl('https://openrouter.ai/keys')
          }}
          style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' }}
        >
          {t('onboarding.getApiKey')} <ExternalLink size={11} style={{ display: 'inline', verticalAlign: '-1px' }} />
        </a>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('settings.openRouterApiKey')}</span>
          <input
            className="field field-mono"
            placeholder={apiKeySaved ? t('settings.keySaved') : 'sk-or-v1-...'}
            type="password"
            value={pendingApiKey}
            onChange={(e) => setPendingApiKey(e.target.value)}
            autoFocus
          />
          <AnimatePresence mode="wait">
            {apiKeySaved && !apiKeyError && (
              <motion.span
                key="ok"
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--status-ok)' }}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: easeOutExpo }}
              >
                <CheckCircle size={12} /> {t('onboarding.keyConfigured')}
              </motion.span>
            )}
            {apiKeyError && (
              <motion.span
                key="err"
                className="text-xs flex items-center gap-1.5"
                style={{ color: 'var(--status-error)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <AlertCircle size={12} /> {apiKeyError}
              </motion.span>
            )}
          </AnimatePresence>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('settings.modelId')}</span>
          <input
            className="field field-mono"
            value={settings.modelId}
            onChange={(e) => void updateSettings({ modelId: e.target.value })}
          />
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{t('onboarding.anyOpenRouterModelId')}</span>
        </label>
      </div>
    </div>
  )
}

/* -- Step 2: Appearance --------------------------------------------------- */

const StepAppearance = ({
  settings, updateSettings,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => {
  const { t } = useTranslation()
  return (
    <div>
      <div className="wizard-step-label"><Sparkles size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 3, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.makeItYours')}</div>
      <div className="wizard-desc">{t('onboarding.makeItYoursDesc')}</div>

      <div className="grid gap-4">
        {/* Theme picker */}
        <div className="grid gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('settings.theme')}</span>
          <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
            {([
              { value: 'system', icon: Monitor, label: t('common.system') },
              { value: 'dark',   icon: Moon,    label: t('common.dark') },
              { value: 'light',  icon: Sun,     label: t('common.light') },
            ] as const).map(({ value, icon, label }) => (
              <ThemeCard
                key={value}
                value={value}
                current={settings.theme}
                icon={icon}
                label={label}
                onChange={(v) => void updateSettings({ theme: v })}
              />
            ))}
          </div>
        </div>

        {/* Language picker */}
        <label className="grid gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('settings.language')}</span>
          <select
            className="field"
            value={settings.language}
            onChange={(e) => void updateSettings({ language: e.target.value as Settings['language'] })}
          >
            <option value="system">{t('common.systemDefault')}</option>
            <option value="en">English</option>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="es">Español</option>
          </select>
        </label>
      </div>
    </div>
  )
}

/* -- Step 3: Microphone --------------------------------------------------- */

const StepMicrophone = ({
  settings, updateSettings, microphoneRefreshKey, refreshMicrophones,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  microphoneRefreshKey: number
  refreshMicrophones: () => void
}) => {
  const { t } = useTranslation()
  const requestMic = async () => {
    await window.ditado.requestMicrophoneAccess()
    refreshMicrophones()
  }

  return (
    <div>
      <div className="wizard-step-label"><Mic size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 4, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.microphoneAccess')}</div>
      <div className="wizard-desc">{t('onboarding.microphoneAccessDesc')}</div>

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('settings.microphone')}</span>
          <MicrophoneSelect
            refreshKey={microphoneRefreshKey}
            selected={settings.preferredMicrophoneId}
            onSelect={(id) => void updateSettings({ preferredMicrophoneId: id })}
          />
        </label>
        <div className="flex gap-2">
          <button className="button-secondary" type="button" onClick={() => void requestMic()}>
            {t('common.grantPermission')}
          </button>
          <button className="button-ghost" type="button" onClick={refreshMicrophones}>
            {t('common.refresh')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* -- Shared demo step ----------------------------------------------------- */

const DemoStep = ({
  stepLabel, icon: StepIcon, title, desc, hotkey, hotkeyLabel, hotkeyFallback, onHotkeyChange,
  session, activationMode, done, onDone, suggestedPhrase, instruction, prefillText,
}: {
  stepLabel: string
  icon: React.FC<{ size?: number; strokeWidth?: number }>
  title: string
  desc: string
  hotkey: string
  hotkeyLabel: string
  hotkeyFallback: string
  onHotkeyChange: (v: string) => void
  session: DictationSession | null
  activationMode: 'push-to-talk' | 'toggle'
  done: boolean
  onDone: () => void
  suggestedPhrase: string
  instruction: string
  prefillText?: string
}) => {
  const { t } = useTranslation()
  const status = session?.status ?? 'idle'
  const isRelevant = session?.activationMode === activationMode && status !== 'idle'
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const demoStatusLabel: Partial<Record<string, string>> = {
    idle: t('onboarding.demoWaiting'),
    arming: t('onboarding.demoArming'),
    listening: t('onboarding.demoListening'),
    processing: t('onboarding.demoProcessing'),
    streaming: t('onboarding.demoStreaming'),
    completed: t('onboarding.demoCompleted'),
    error: t('onboarding.demoError'),
  }

  useEffect(() => {
    if (session?.activationMode === activationMode && status === 'completed' && !done) {
      onDone()
    }
  }, [status, session?.activationMode, done, onDone, activationMode])

  const statusColor = isRelevant
    ? (demoStatusColor[status] ?? 'var(--text-3)')
    : done ? 'var(--status-ok)' : 'var(--text-3)'

  const statusText = done && !isRelevant
    ? t('onboarding.demoSuccess')
    : isRelevant
      ? (demoStatusLabel[status] ?? status)
      : t('onboarding.demoInstruction')

  const demoZoneStatus = isRelevant ? status : done ? 'completed' : 'idle'

  return (
    <div>
      <div className="wizard-step-label">
        <span className="inline -mt-px mr-1"><StepIcon size={11} /></span>{stepLabel}
      </div>
      <div className="wizard-title">{title}</div>
      <div className="wizard-desc">{desc}</div>

      {/* Compact hotkey row */}
      <div className="wizard-hotkey-row">
        <span className="wizard-hotkey-label">{hotkeyLabel}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HotkeyField
            label={hotkeyLabel}
            value={hotkey}
            fallbackValue={hotkeyFallback}
            onCommit={onHotkeyChange}
          />
        </div>
      </div>

      {/* Demo zone */}
      <div className="wizard-demo-zone" data-status={demoZoneStatus}>
        {/* Status bar */}
        <div className="wizard-demo-status-bar">
          <StatusDot color={statusColor} pulse={isRelevant && status === 'listening'} />
          <AnimatePresence mode="wait">
            <motion.span
              key={statusText}
              style={{ color: statusColor, flex: 1, fontSize: '0.75rem', fontWeight: 500 }}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 5 }}
              transition={{ duration: 0.15, ease: easeOutExpo }}
            >
              {statusText}
            </motion.span>
          </AnimatePresence>
          <AnimatePresence>
            {done && !isRelevant && (
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 450, damping: 18 }}
              >
                <CheckCircle size={15} style={{ color: 'var(--status-ok)' }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="wizard-demo-textarea"
          defaultValue={prefillText ?? ''}
          placeholder={!prefillText ? t('onboarding.textWillAppear') : ''}
          rows={4}
          spellCheck={false}
        />

        {/* Footer: instruction + suggested phrase (hidden once done) */}
        <AnimatePresence initial={false}>
          {!done && (
            <motion.div
              className="wizard-demo-footer"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: easeOutExpo }}
              style={{ overflow: 'hidden' }}
            >
              <div className="wizard-demo-instruction">{instruction}</div>
              <div className="wizard-demo-hint">
                <MessageSquareQuote size={11} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                <span>&ldquo;{suggestedPhrase}&rdquo;</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* -- Step 4: Push-to-talk demo -------------------------------------------- */

const StepPushToTalkDemo = ({
  settings, session, done, onDone, updateSettings,
}: {
  settings: Settings
  session: DictationSession | null
  done: boolean
  onDone: () => void
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => {
  const { t } = useTranslation()
  return (
    <DemoStep
      stepLabel={t('common.stepOf', { step: 5, total: TOTAL_STEPS })}
      icon={Zap}
      title={t('onboarding.tryPushToTalk')}
      desc={t('onboarding.tryPushToTalkDesc')}
      hotkey={settings.pushToTalkHotkey}
      hotkeyLabel={t('onboarding.pushToTalkShortcut')}
      hotkeyFallback={defaultPushToTalkHotkey}
      onHotkeyChange={(v) => void updateSettings({ pushToTalkHotkey: v })}
      session={session}
      activationMode="push-to-talk"
      done={done}
      onDone={onDone}
      suggestedPhrase={t('onboarding.suggestedPhrasesPtt')}
      instruction={t('onboarding.holdAndSpeak', { hotkey: formatHotkeyForDisplay(settings.pushToTalkHotkey) })}
    />
  )
}

/* -- Step 5: Toggle demo -------------------------------------------------- */

const StepToggleDemo = ({
  settings, session, done, onDone, updateSettings,
}: {
  settings: Settings
  session: DictationSession | null
  done: boolean
  onDone: () => void
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => {
  const { t } = useTranslation()
  return (
    <DemoStep
      stepLabel={t('common.stepOf', { step: 6, total: TOTAL_STEPS })}
      icon={Repeat}
      title={t('onboarding.tryToggle')}
      desc={t('onboarding.tryToggleDesc')}
      hotkey={settings.toggleHotkey}
      hotkeyLabel={t('onboarding.toggleShortcut')}
      hotkeyFallback={defaultToggleHotkey}
      onHotkeyChange={(v) => void updateSettings({ toggleHotkey: v })}
      session={session}
      activationMode="toggle"
      done={done}
      onDone={onDone}
      suggestedPhrase={t('onboarding.suggestedPhrasesToggle')}
      instruction={t('onboarding.pressToStartStop', { hotkey: formatHotkeyForDisplay(settings.toggleHotkey) })}
    />
  )
}

/* -- Step 6: Ready -------------------------------------------------------- */

const StepReady = ({ settings }: { settings: Settings }) => {
  const { t } = useTranslation()
  const rows = [
    { label: t('overview.apiKey'),       value: settings.apiKeyPresent ? t('common.configured') : t('common.notSet'), warn: !settings.apiKeyPresent },
    { label: t('overview.model'),        value: settings.modelId.split('/').at(-1) ?? settings.modelId },
    { label: t('common.toggle'),         value: formatHotkeyForDisplay(settings.toggleHotkey) },
    { label: t('common.pushToTalk'),     value: formatHotkeyForDisplay(settings.pushToTalkHotkey) },
  ]

  return (
    <div>
      <div className="wizard-step-label"><Sparkles size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 7, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.allSet')}</div>
      <div className="wizard-desc">{t('onboarding.allSetDesc')}</div>

      <div className="surface-muted p-3 grid" style={{ borderRadius: '0.6rem', gap: 0 }}>
        {rows.map((row, i) => (
          <motion.div
            key={row.label}
            className="flex items-center justify-between"
            style={{
              padding: '0.35rem 0',
              borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            }}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: easeOutExpo, delay: i * 0.07 }}
          >
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>{row.label}</span>
            <span className="text-xs" style={{ color: row.warn ? 'var(--status-error)' : 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
              {row.value}
            </span>
          </motion.div>
        ))}
      </div>

      <motion.p
        className="mt-3 text-xs"
        style={{ color: 'var(--text-3)', lineHeight: 1.5 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.32 }}
      >
        {t('settings.fallbackClipboardHint')}
      </motion.p>
    </div>
  )
}
