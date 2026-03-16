import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, ArrowDown, Clock, Loader2, LayoutDashboard, PackageCheck, RotateCcw, Settings2 } from 'lucide-react'

import type { DashboardTab, Settings, UpdateState } from '@shared/contracts'
import { StatusPill } from '@renderer/components/StatusPill'
import { useDashboardBridge, useDictationRecorder } from '@renderer/hooks/useDitadoBridge'
import { useThemeAndLanguage } from '@renderer/hooks/useThemeAndLanguage'
import { HistoryPanel } from './dashboard/HistoryPanel'
import { OnboardingWizard } from './dashboard/OnboardingWizard'
import { OverviewPanel } from './dashboard/OverviewPanel'
import { SettingsPanel } from './dashboard/SettingsPanel'

const UpdateWidget = ({ updateState, appVersion }: { updateState: UpdateState; appVersion: string }) => {
  const { t } = useTranslation()
  const { status, downloadProgress } = updateState

  return (
    <div className="sidebar-update-widget">
      <span className="sidebar-version">v{appVersion}</span>

      {status === 'checking' && (
        <div className="sidebar-update-row">
          <Loader2 size={10} className="update-spinner" />
          <span className="sidebar-update-label">{t('updateStatus.checking')}</span>
        </div>
      )}

      {status === 'available' && (
        <button
          type="button"
          className="sidebar-update-btn sidebar-update-btn--download"
          onClick={() => { void window.ditado.downloadUpdate() }}
          title={t('updateWidget.downloadUpdate')}
        >
          <ArrowDown size={10} strokeWidth={2.2} />
          <span>{t('updateWidget.downloadUpdate')}</span>
        </button>
      )}

      {status === 'downloading' && (
        <div className="sidebar-update-progress-wrap" title={t('updateWidget.downloading', { percent: downloadProgress ?? 0 })}>
          <div className="sidebar-update-progress-bar">
            <motion.div
              className="sidebar-update-progress-fill"
              initial={{ width: '0%' }}
              animate={{ width: `${downloadProgress ?? 0}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="sidebar-update-label">{downloadProgress ?? 0}%</span>
        </div>
      )}

      {status === 'downloaded' && (
        <button
          type="button"
          className="sidebar-update-btn sidebar-update-btn--install"
          onClick={() => { void window.ditado.installUpdate() }}
          title={t('updateWidget.installing')}
        >
          <PackageCheck size={10} strokeWidth={2.2} />
          <span>{t('updateWidget.installing')}</span>
        </button>
      )}

      {status === 'error' && (
        <button
          type="button"
          className="sidebar-update-btn sidebar-update-btn--error"
          onClick={() => { void window.ditado.checkForUpdates() }}
          title={t('updateWidget.retry')}
        >
          <AlertCircle size={10} strokeWidth={2.2} />
          <span>{t('updateWidget.retry')}</span>
        </button>
      )}

      {status === 'idle' && (
        <button
          type="button"
          className="sidebar-update-btn sidebar-update-btn--idle"
          onClick={() => { void window.ditado.checkForUpdates() }}
          title={t('updateWidget.checkForUpdates')}
        >
          <RotateCcw size={9} strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
}

const navTabs: Array<{ id: DashboardTab; labelKey: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }> = [
  { id: 'overview', labelKey: 'common.overview', Icon: LayoutDashboard },
  { id: 'settings', labelKey: 'common.settings', Icon: Settings2 },
  { id: 'history', labelKey: 'common.history', Icon: Clock },
]

const easeOutExpo = [0.16, 1, 0.3, 1] as const
const areSettingsEqual = (left: Settings, right: Settings): boolean => JSON.stringify(left) === JSON.stringify(right)

export const DashboardWindow = ({ initialTab }: { initialTab: DashboardTab }) => {
  const state = useDashboardBridge()
  const reducedMotion = useReducedMotion()
  const effectiveInitial = initialTab === 'onboarding' ? 'overview' : initialTab
  const [activeTab, setActiveTab] = useState<DashboardTab>(effectiveInitial)
  const [pendingApiKey, setPendingApiKey] = useState('')
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null)
  const [microphoneRefreshKey, setMicrophoneRefreshKey] = useState(0)
  const [forceOnboarding, setForceOnboarding] = useState(false)
  const latestStateSettings = useRef(state.settings)
  const latestSettingsMutationId = useRef(0)
  const { isRecording } = useDictationRecorder(state.session, state.settings.preferredMicrophoneId)
  const { t } = useTranslation()
  const settings = draftSettings ?? state.settings
  useThemeAndLanguage(settings)
  const sessionStatus = state.session?.status ?? 'idle'

  // Keep the ref in sync with the current settings (draft or state).
  // This must run after every render to ensure async operations have the latest value.
  useEffect(() => {
    latestStateSettings.current = draftSettings ?? state.settings
  }, [draftSettings, state.settings])

  useEffect(() => {
    // When the server confirms a new state, clear the optimistic draft only if it
    // already matches (meaning all in-flight mutations have been acknowledged).
    setDraftSettings((currentDraft) => {
      if (!currentDraft || areSettingsEqual(currentDraft, state.settings)) {
        return null
      }
      return currentDraft
    })
  }, [state.settings])

  const applySettingsMutation = async (
    applyOptimisticUpdate: (base: Settings) => Settings,
    commit: () => Promise<Settings>,
  ): Promise<Settings> => {
    const mutationId = ++latestSettingsMutationId.current
    setDraftSettings((currentDraft) => applyOptimisticUpdate(currentDraft ?? latestStateSettings.current))
    try {
      const nextSettings = await commit()
      if (mutationId === latestSettingsMutationId.current) {
        setDraftSettings(nextSettings)
      }
      return nextSettings
    } catch (error) {
      if (mutationId === latestSettingsMutationId.current) {
        setDraftSettings(latestStateSettings.current)
      }
      throw error
    }
  }

  const updateSettings = async (patch: Partial<Settings>) => applySettingsMutation(
    (baseSettings) => ({ ...baseSettings, ...patch }),
    () => window.ditado.updateSettings(patch),
  )

  const saveApiKey = async (): Promise<void> => {
    await applySettingsMutation(
      (baseSettings) => ({ ...baseSettings, apiKeyPresent: Boolean(pendingApiKey.trim()) }),
      () => window.ditado.setApiKey(pendingApiKey),
    )
    setPendingApiKey('')
  }

  const sectionMotion = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25, ease: easeOutExpo },
  } as const

  const refreshMicrophones = (): void => {
    setMicrophoneRefreshKey((v) => v + 1)
  }

  const finishOnboarding = async (): Promise<void> => {
    await updateSettings({ onboardingCompleted: true })
    setForceOnboarding(false)
  }

  /* ── Auto-complete onboarding for existing users who already have an API key ── */
  const autoOnboardingDone = useRef(false)
  useEffect(() => {
    if (!settings.onboardingCompleted && settings.apiKeyPresent && !autoOnboardingDone.current) {
      autoOnboardingDone.current = true
      void updateSettings({ onboardingCompleted: true }).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateSettings is stable for this onboarding check
  }, [settings.onboardingCompleted, settings.apiKeyPresent])

  /* ── Onboarding wizard overlay ── */
  if (forceOnboarding || (!settings.onboardingCompleted && !settings.apiKeyPresent)) {
    return (
      <OnboardingWizard
        settings={settings}
        session={state.session}
        pendingApiKey={pendingApiKey}
        setPendingApiKey={setPendingApiKey}
        saveApiKey={saveApiKey}
        updateSettings={updateSettings}
        microphoneRefreshKey={microphoneRefreshKey}
        refreshMicrophones={refreshMicrophones}
        finishOnboarding={finishOnboarding}
      />
    )
  }

  const activeTabMeta = navTabs.find((tab) => tab.id === activeTab)

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo" aria-label="Ditado">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="7.5" y="2" width="5" height="8" rx="2.5" fill="currentColor" />
            <path d="M5 10c0 3.5 2.5 6.2 5 6.2s5-2.7 5-6.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            <line x1="10" y1="16.2" x2="10" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="7" y1="18" x2="13" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="sidebar-nav">
          {navTabs.map(({ id, labelKey, Icon }) => (
            <button
              key={id}
              className="sidebar-icon"
              data-active={activeTab === id}
              data-tooltip={t(labelKey)}
              type="button"
              aria-label={t(labelKey)}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={17} strokeWidth={1.8} />
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <UpdateWidget updateState={state.updateState} appVersion={state.appVersion} />
        </div>
      </nav>

      {/* Main */}
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{activeTabMeta ? t(activeTabMeta.labelKey) : 'Ditado'}</span>
          {state.session?.targetApp ? (
            <>
              <span className="topbar-sep">/</span>
              <span className="topbar-target">{state.session.targetApp}</span>
            </>
          ) : null}
          <div className="topbar-actions">
            <StatusPill status={sessionStatus} />
          </div>
        </div>

        <div className="content-area">
          {activeTab === 'overview' && (
            <motion.div key="overview" {...(reducedMotion ? {} : sectionMotion)}>
              <OverviewPanel
                state={{ ...state, settings, history: state.history }}
                isRecording={isRecording}
                reducedMotion={reducedMotion}
                sectionMotion={sectionMotion}
              />
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div key="settings" {...(reducedMotion ? {} : sectionMotion)}>
              <SettingsPanel
                settings={settings}
                pendingApiKey={pendingApiKey}
                setPendingApiKey={setPendingApiKey}
                saveApiKey={saveApiKey}
                updateSettings={updateSettings}
                microphoneRefreshKey={microphoneRefreshKey}
                refreshMicrophones={refreshMicrophones}
                onRestartOnboarding={() => setForceOnboarding(true)}
                reducedMotion={reducedMotion}
                sectionMotion={sectionMotion}
              />
            </motion.div>
          )}
          {activeTab === 'history' && (
            <motion.div key="history" {...(reducedMotion ? {} : sectionMotion)}>
              <HistoryPanel
                history={state.history}
                retentionDays={settings.historyRetentionDays}
                reducedMotion={reducedMotion}
                sectionMotion={sectionMotion}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
