import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle, ExternalLink,
  KeyRound, Mic, Monitor, Moon, Repeat, Sparkles, Sun, Zap,
} from 'lucide-react'
import type { DictationSession, Settings } from '@shared/contracts'
import { defaultPushToTalkHotkey } from '@shared/defaults'
import { formatHotkeyForDisplay } from '@shared/hotkeys'
import { HotkeyField, MicrophoneSelect } from './controls'
import { OnboardingWizardRightPane } from './OnboardingWizardRightPane'
import {
  StatusDot,
  ThemeCard,
  TOTAL_STEPS,
  demoStatusColor,
  easeOutExpo,
} from './OnboardingWizard.shared'

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
  isUpgradeOnboarding?: boolean
  initialStep?: number
}
/* -- Step 0: Welcome ------------------------------------------------------ */

const StepWelcome = ({ isUpgradeOnboarding = false }: { isUpgradeOnboarding?: boolean }) => {
  const { t } = useTranslation()
  return (
    <div>
      <div className="wizard-step-label">
        <Sparkles size={11} className="inline -mt-px mr-1" />
        {t('common.stepOf', { step: 1, total: TOTAL_STEPS })}
      </div>
      <div className="wizard-title">{t('onboarding.welcome')}</div>
      <div className="wizard-desc" style={{ marginBottom: '1.5rem' }}>{t('onboarding.welcomeDesc')}</div>

      {isUpgradeOnboarding && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem 0.9rem',
          background: 'var(--accent-muted)',
          border: '1px solid rgba(210,175,110,0.2)',
          borderRadius: '0.6rem',
          fontSize: '0.76rem',
          color: 'var(--text-2)',
          lineHeight: 1.55,
        }}>
          {t('onboarding.upgradeShortcutChange')}
        </div>
      )}

      {/* Key differentiators — short, punchy, no duplication with right panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {([
          { color: '#3b82f6', label: t('onboarding.welcomePoint1') },
          { color: 'var(--accent)', label: t('onboarding.welcomePoint2') },
          { color: '#10b981', label: t('onboarding.welcomePoint3') },
        ]).map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.8rem', color: 'var(--text-2)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

/* -- Step 1: Whisper ------------------------------------------------------ */

const StepWhisper = () => {
  const { t } = useTranslation()
  return (
    <div>
      <div className="wizard-step-label">
        <Mic size={11} className="inline -mt-px mr-1" />
        {t('common.stepOf', { step: 3, total: TOTAL_STEPS })}
      </div>
      <div className="wizard-title">
        <Trans i18nKey="onboarding.whisperTitleFormatted" components={{ em: <em /> }} />
      </div>
      <div className="wizard-desc">{t('onboarding.whisperDesc')}</div>
      <div style={{
        marginTop: '0.75rem', padding: '0.65rem 0.85rem',
        background: 'var(--accent-muted)', border: '1px solid rgba(210,175,110,0.2)',
        borderRadius: '0.55rem', fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 1.55,
      }}>
        {t('onboarding.whisperAppsDesc')}
      </div>
    </div>
  )
}

/* -- Step 2: API Key ------------------------------------------------------ */

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
      <div className="wizard-step-label"><KeyRound size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 5, total: TOTAL_STEPS })}</div>
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

/* -- Step 3: Appearance --------------------------------------------------- */

const StepAppearance = ({
  settings, updateSettings,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => {
  const { t } = useTranslation()
  return (
    <div>
      <div className="wizard-step-label"><Sparkles size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 2, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.makeItYours')}</div>
      <div className="wizard-desc">{t('onboarding.makeItYoursDesc')}</div>

      <div className="grid gap-4">
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

/* -- Step 4: Microphone --------------------------------------------------- */

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
      <div className="wizard-title">{t('onboarding.micTestTitle')}</div>
      <div className="wizard-desc">{t('onboarding.micTestDesc')}</div>

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

/* -- Step 5: Shortcut Test ------------------------------------------------ */

const StepShortcutTest = ({
  settings, updateSettings, shortcutTested,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  shortcutTested: boolean
}) => {
  const { t } = useTranslation()
  return (
    <div>
      <div className="wizard-step-label"><Zap size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 6, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.shortcutTestTitle')}</div>
      <div className="wizard-desc">{t('onboarding.shortcutTestDesc')}</div>

      <div style={{
        marginTop: '0.75rem', padding: '0.6rem 0.75rem',
        background: 'var(--bg-2)', borderRadius: '0.55rem',
        border: '1px solid var(--border)',
      }}>
        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-3)', marginBottom: '0.35rem' }}>
          {t('onboarding.shortcutEditShortcut')}
        </span>
        <HotkeyField
          label={t('settings.pushToTalkLabel')}
          value={settings.pushToTalkHotkey}
          fallbackValue={defaultPushToTalkHotkey}
          onCommit={(v) => void updateSettings({ pushToTalkHotkey: v })}
        />
      </div>

      <AnimatePresence>
        {shortcutTested && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.75rem', color: 'var(--status-ok)', fontWeight: 600,
            }}
          >
            <CheckCircle size={14} /> {t('onboarding.shortcutIsWorking')}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* -- Step 6: Push-to-Talk Demo -------------------------------------------- */

const StepPushToTalk = ({
  settings, session, done, onDone, updateSettings,
}: {
  settings: Settings
  session: DictationSession | null
  done: boolean
  onDone: () => void
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
}) => {
  const { t } = useTranslation()
  const status = session?.status ?? 'idle'

  const demoStatusLabel: Partial<Record<string, string>> = {
    idle: t('onboarding.demoWaiting'),
    notice: t('onboarding.demoWaiting'),
    arming: t('onboarding.demoArming'),
    listening: t('onboarding.demoListening'),
    processing: t('onboarding.demoProcessing'),
    streaming: t('onboarding.demoStreaming'),
    completed: t('onboarding.demoCompleted'),
    error: t('onboarding.demoError'),
  }

  const isRelevant = session?.activationMode === 'push-to-talk' && status !== 'idle' && status !== 'notice'

  useEffect(() => {
    if (session?.activationMode === 'push-to-talk' && status === 'completed' && !done) {
      onDone()
    }
  }, [status, session?.activationMode, done, onDone])

  const statusColor = isRelevant
    ? (demoStatusColor[status] ?? 'var(--text-3)')
    : done ? 'var(--status-ok)' : 'var(--text-3)'

  const statusText = done && !isRelevant
    ? t('onboarding.demoSuccess')
    : isRelevant
      ? (demoStatusLabel[status] ?? status)
      : t('onboarding.demoInstruction')

  return (
    <div>
      <div className="wizard-step-label"><Zap size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 7, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.tryPushToTalk')}</div>
      <div className="wizard-desc">{t('onboarding.tryPushToTalkDesc')}</div>

      <div style={{
        marginTop: '0.75rem', padding: '0.6rem 0.75rem',
        background: 'var(--bg-2)', borderRadius: '0.55rem',
        border: '1px solid var(--border)',
      }}>
        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-3)', marginBottom: '0.35rem' }}>
          {t('onboarding.pushToTalkShortcut')}
        </span>
        <HotkeyField
          label={t('settings.pushToTalkLabel')}
          value={settings.pushToTalkHotkey}
          fallbackValue={defaultPushToTalkHotkey}
          onCommit={(v) => void updateSettings({ pushToTalkHotkey: v })}
        />
      </div>

      <div className="wizard-demo-zone" data-status={isRelevant ? status : done ? 'completed' : 'idle'}
        style={{
          marginTop: '0.75rem', borderRadius: '0.6rem',
          border: '1px solid var(--border)', overflow: 'hidden',
        }}
      >
        <div className="wizard-demo-status-bar" style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.4rem 0.7rem', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)',
        }}>
          <StatusDot color={statusColor} pulse={isRelevant && status === 'listening'} />
          <AnimatePresence mode="wait">
            <motion.span
              key={statusText}
              style={{ color: statusColor, flex: 1, fontSize: '0.72rem', fontWeight: 500 }}
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
        <div style={{ padding: '0.5rem 0.75rem' }}>
          <div className="wizard-demo-instruction" style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
            {t('onboarding.holdAndSpeak', { hotkey: formatHotkeyForDisplay(settings.pushToTalkHotkey) })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* -- Step 7: Select & Transform ------------------------------------------ */

const StepSelectTransform = ({
  settings, session, onDone, onNoSelection, noSelectionBlocked,
}: {
  settings: Settings
  session: DictationSession | null
  onDone: () => void
  onNoSelection: () => void
  noSelectionBlocked: boolean
}) => {
  const { t } = useTranslation()
  const status = session?.status ?? 'idle'
  // Only react to sessions that started after this step was shown
  const entrySessionIdRef = useRef<string | null | undefined>(session?.id)
  const isNewSession = session?.id !== entrySessionIdRef.current

  useEffect(() => {
    if (!isNewSession) return
    if (session?.activationMode === 'push-to-talk' && status === 'completed') {
      if (session.context.selectedText) {
        onDone()
      } else {
        onNoSelection()
      }
    }
  }, [isNewSession, status, session?.activationMode, session?.context.selectedText, onDone, onNoSelection])

  return (
    <div>
      <div className="wizard-step-label"><Repeat size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 8, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.trySelectTransform')}</div>

      {/* Description swaps to selection hint when no-selection is detected */}
      <AnimatePresence mode="wait">
        {noSelectionBlocked ? (
          <motion.div
            key="blocked"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="wizard-desc" style={{ color: 'var(--text-1)', fontWeight: 500 }}>
              {t('onboarding.selectFirstHint')}
            </div>
            <div style={{
              marginTop: '0.6rem', padding: '0.5rem 0.65rem',
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: '0.5rem', fontSize: '0.72rem', color: 'var(--text-3)',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
              <Zap size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {t('onboarding.selectTransformUsing', { hotkey: formatHotkeyForDisplay(settings.pushToTalkHotkey) })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="normal"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="wizard-desc">{t('onboarding.trySelectTransformDesc')}</div>
            <div style={{
              marginTop: '0.75rem', padding: '0.6rem 0.75rem',
              background: 'var(--accent-muted)', border: '1px solid rgba(210,175,110,0.2)',
              borderRadius: '0.5rem', fontSize: '0.72rem', color: 'var(--text-2)', lineHeight: 1.55,
            }}>
              {t('onboarding.selectTransformTip')}
            </div>
            <div style={{
              marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.7rem', color: 'var(--text-3)',
            }}>
              <Zap size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {t('onboarding.selectTransformUsing', { hotkey: formatHotkeyForDisplay(settings.pushToTalkHotkey) })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* -- Step 8: Hands-Free -------------------------------------------------- */

const StepHandsFree = () => {
  const { t } = useTranslation()
  const isMacOS = navigator.userAgent.includes('Mac')
  const key2 = isMacOS ? 'Meta' : 'Win'

  return (
    <div>
      <div className="wizard-step-label"><Mic size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 9, total: TOTAL_STEPS })}</div>
      <div className="wizard-title">{t('onboarding.tryHandsFree')}</div>
      <div className="wizard-desc">{t('onboarding.tryHandsFreeDesc')}</div>

      <div className="wizard-double-tap-tip" style={{
        marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.75rem', background: 'var(--bg-2)',
        border: '1px solid var(--border)', borderRadius: '0.5rem',
        fontSize: '0.72rem', color: 'var(--text-2)',
      }}>
        <span className="kbd-badge" style={{
          display: 'inline-flex', background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 5, padding: '0.15rem 0.45rem', fontSize: '0.7rem', fontWeight: 600,
          boxShadow: '0 2px 0 var(--border)',
        }}>Ctrl</span>
        <span style={{ opacity: 0.5 }}>+</span>
        <span className="kbd-badge" style={{
          display: 'inline-flex', background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 5, padding: '0.15rem 0.45rem', fontSize: '0.7rem', fontWeight: 600,
          boxShadow: '0 2px 0 var(--border)',
        }}>{key2}</span>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>×2</span>
        <span style={{ color: 'var(--text-3)' }}>— {t('onboarding.doubleTapTip')}</span>
      </div>
    </div>
  )
}

/* -- Step 9: Ready -------------------------------------------------------- */

const StepReady = ({ settings }: { settings: Settings }) => {
  const { t } = useTranslation()
  const rows = [
    { label: t('overview.apiKey'),   value: settings.apiKeyPresent ? t('common.configured') : t('common.notSet'), warn: !settings.apiKeyPresent },
    { label: t('overview.model'),    value: settings.modelId.split('/').at(-1) ?? settings.modelId },
    { label: t('common.pushToTalk'), value: formatHotkeyForDisplay(settings.pushToTalkHotkey) },
    { label: 'Hands-free',           value: `${t('onboarding.doubleTapHandsFree').split(' ').slice(0, 2).join(' ')} ${formatHotkeyForDisplay(settings.pushToTalkHotkey)}` },
  ]

  return (
    <div>
      <div className="wizard-step-label"><Sparkles size={11} className="inline -mt-px mr-1" />{t('common.stepOf', { step: 10, total: TOTAL_STEPS })}</div>
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

/* -- Main wizard ---------------------------------------------------------- */

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
  isUpgradeOnboarding = false,
  initialStep = 0,
}: WizardProps) => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [step, setStep] = useState(initialStep)
  const [direction, setDirection] = useState(1)
  const [apiKeySaved, setApiKeySaved] = useState(settings.apiKeyPresent)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [shortcutTested, setShortcutTested] = useState(false)
  const [pushTalkDone, setPushTalkDone] = useState(false)
  const [selectTransformDone, setSelectTransformDone] = useState(false)
  const [noSelectionBlocked, setNoSelectionBlocked] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const isMacOS = navigator.userAgent.includes('Mac')

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

  // Auto-mark shortcut tested when session activates (shortcut test is now step 5)
  useEffect(() => {
    if (step === 5 && session != null && session.status !== 'idle' && !shortcutTested) {
      setShortcutTested(true)
    }
  }, [step, session, shortcutTested])

  // Reset no-selection blocked state when leaving step 7 (SelectTransform)
  useEffect(() => {
    if (step !== 7) {
      setNoSelectionBlocked(false)
    }
  }, [step])

  const canProceed = () => {
    if (finishing) return false
    if (step === 4) return apiKeySaved || pendingApiKey.trim().length > 0  // API Key
    if (step === 7 && noSelectionBlocked && !selectTransformDone) return false
    return true
  }

  const handleNext = () => {
    if (step === 4 && pendingApiKey.trim()) { void handleSaveApiKey(); return }
    if (step === 9) {
      setFinishing(true)
      void (async () => {
        try {
          await finishOnboarding()
        } catch {
          setFinishing(false)
        }
      })()
      return
    }
    goNext()
  }

  // step 4 = API Key — no skip (force save first)
  // step 0,1 = Welcome, Appearance — no skip button needed (free Continue)
  const showSkip = step > 1 && step !== 4 && step < 9

  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 22 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -22 }),
  }

  const rightSlideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 16 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -16 }),
  }

  return (
    <motion.div
      className="wizard-backdrop"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={reducedMotion ? undefined : { opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ display: 'flex' }}
    >
      {/* LEFT PANEL */}
      <div className="wizard-left" style={{
        width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column',
        padding: '2rem', overflowY: 'auto',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Progress dots */}
        <div className="wizard-nav" style={{ display: 'flex', gap: '0.3rem', marginBottom: '1.5rem' }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <motion.div
              key={i}
              className="wizard-nav-dot"
              data-active={i === step ? 'true' : undefined}
              data-done={i < step ? 'true' : undefined}
              layout
              transition={{ duration: 0.25, ease: easeOutExpo }}
              style={{
                height: 4, borderRadius: 2, flexShrink: 0,
                background: i === step ? 'var(--accent)' : i < step ? 'rgba(210,175,110,0.4)' : 'var(--border)',
                width: i === step ? 20 : 8,
                transition: 'width 250ms, background 250ms',
              }}
            />
          ))}
        </div>

        {/* Back button */}
        {step > 0 && (
          <button
            className="wizard-back button-ghost"
            type="button"
            onClick={goPrev}
            disabled={finishing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.72rem', marginBottom: '0.5rem', alignSelf: 'flex-start',
            }}
          >
            <ArrowLeft size={13} /> {t('common.back')}
          </button>
        )}

        {/* Animated step content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={reducedMotion ? undefined : slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: easeOutExpo }}
            style={{ flex: 1 }}
          >
            {/* Step order: 0=Welcome, 1=Appearance, 2=Whisper, 3=Microphone,
                            4=ApiKey, 5=ShortcutTest, 6=PTT, 7=SelectTransform, 8=HandsFree, 9=Ready */}
          {step === 0 && <StepWelcome isUpgradeOnboarding={isUpgradeOnboarding} />}
            {step === 1 && <StepAppearance settings={settings} updateSettings={updateSettings} />}
            {step === 2 && <StepWhisper />}
            {step === 3 && (
              <StepMicrophone
                settings={settings}
                updateSettings={updateSettings}
                microphoneRefreshKey={microphoneRefreshKey}
                refreshMicrophones={refreshMicrophones}
              />
            )}
            {step === 4 && (
              <StepApiKey
                settings={settings}
                pendingApiKey={pendingApiKey}
                setPendingApiKey={setPendingApiKey}
                apiKeySaved={apiKeySaved}
                apiKeyError={apiKeyError}
                updateSettings={updateSettings}
              />
            )}
            {step === 5 && (
              <StepShortcutTest
                settings={settings}
                updateSettings={updateSettings}
                shortcutTested={shortcutTested}
              />
            )}
            {step === 6 && (
              <StepPushToTalk
                settings={settings}
                session={session}
                done={pushTalkDone}
                onDone={() => setPushTalkDone(true)}
                updateSettings={updateSettings}
              />
            )}
            {step === 7 && (
              <StepSelectTransform
                settings={settings}
                session={session}
                onDone={() => { setSelectTransformDone(true); setNoSelectionBlocked(false) }}
                onNoSelection={() => setNoSelectionBlocked(true)}
                noSelectionBlocked={noSelectionBlocked}
              />
            )}
            {step === 8 && <StepHandsFree />}
            {step === 9 && <StepReady settings={settings} />}
          </motion.div>
        </AnimatePresence>

        <div className="wizard-spacer" style={{ flex: 1 }} />

        {/* Actions */}
        <div className="wizard-actions" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem',
          marginTop: '1.5rem',
        }}>
          {showSkip && (
            <button
              className="button-ghost"
              type="button"
              onClick={goNext}
              style={{ fontSize: '0.72rem' }}
            >
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
              : step === 4 && !apiKeySaved && pendingApiKey.trim() ? t('common.saveAndContinue')
              : step === 9 ? <><Check size={14} /> {t('common.finishSetup')}</>
              : <>{t('common.continue')} <ArrowRight size={14} /></>}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="wizard-right" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={reducedMotion ? undefined : rightSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: easeOutExpo }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <OnboardingWizardRightPane
              step={step}
              settings={settings}
              session={session}
              onConfirmMic={goNext}
              onTestShortcut={() => setShortcutTested(true)}
              isMacOS={isMacOS}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}


