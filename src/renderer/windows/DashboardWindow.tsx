import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {  ArrowDown, Clock, Loader2, LayoutDashboard, PackageCheck, RotateCcw, Settings2 } from 'lucide-react'

import type { DashboardTab, Settings, UpdateState } from '@shared/contracts'
import { useUiSounds } from '@renderer/audio/useUiSounds'
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
  const showAction = status !== 'idle' && status !== 'disabled' && status !== 'unsupported'

  return (
    <div className="sidebar-update-widget">
      {/* Version label — clickable to check for updates */}
      <button
        type="button"
        className="sidebar-version-btn"
        onClick={() => { void window.ditado.checkForUpdates() }}
        title={t('updateWidget.checkForUpdates')}
      >
        v{appVersion}
      </button>

      {/* Update action area */}
      {showAction && (
        <motion.div
          className="sidebar-update-action"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {status === 'checking' && (
            <div className="sidebar-update-icon-btn sidebar-update-icon-btn--checking" title={t('updateStatus.checking')}>
              <Loader2 size={14} className="update-spinner" />
            </div>
          )}

          {status === 'installing' && (
            <div className="sidebar-update-icon-btn sidebar-update-icon-btn--checking" title={t('updateWidget.installing')}>
              <Loader2 size={14} className="update-spinner" />
            </div>
          )}

          {status === 'available' && (
            <button
              type="button"
              className="sidebar-update-icon-btn sidebar-update-icon-btn--download"
              onClick={() => { void window.ditado.downloadUpdate() }}
              title={t('updateWidget.downloadUpdate')}
            >
              <ArrowDown size={14} strokeWidth={2.5} />
            </button>
          )}

          {status === 'downloading' && (
            <div
              className="sidebar-update-icon-btn sidebar-update-icon-btn--downloading"
              title={t('updateWidget.downloading', { percent: downloadProgress ?? 0 })}
            >
              <svg viewBox="0 0 36 36" width="30" height="30" className="sidebar-progress-ring">
                <circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-3)" strokeWidth="3" />
                <motion.circle
                  cx="18" cy="18" r="14" fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={Math.PI * 28}
                  initial={{ strokeDashoffset: Math.PI * 28 }}
                  animate={{ strokeDashoffset: Math.PI * 28 * (1 - (downloadProgress ?? 0) / 100) }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <span className="sidebar-progress-text">{downloadProgress ?? 0}</span>
            </div>
          )}

          {status === 'downloaded' && (
            <button
              type="button"
              className="sidebar-update-icon-btn sidebar-update-icon-btn--install"
              onClick={() => { void window.ditado.installUpdate() }}
              title={t('updateWidget.installing')}
            >
              <PackageCheck size={14} strokeWidth={2.2} />
            </button>
          )}

          {status === 'error' && (
            <button
              type="button"
              className="sidebar-update-icon-btn sidebar-update-icon-btn--error"
              onClick={() => { void window.ditado.checkForUpdates() }}
              title={t('updateWidget.retry')}
            >
              <RotateCcw size={13} strokeWidth={2.2} />
            </button>
          )}
        </motion.div>
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
  useUiSounds(state.session)
  const reducedMotion = useReducedMotion()
  const effectiveInitial = initialTab === 'onboarding' ? 'overview' : initialTab
  const [activeTab, setActiveTab] = useState<DashboardTab>(effectiveInitial)
  const [pendingApiKey, setPendingApiKey] = useState('')
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null)
  const [microphoneRefreshKey, setMicrophoneRefreshKey] = useState(0)
  const [forceOnboarding, setForceOnboarding] = useState(false)
  const [requestedOnboarding, setRequestedOnboarding] = useState(initialTab === 'onboarding')
  const latestStateSettings = useRef(state.settings)
  const latestSettingsMutationId = useRef(0)
  useDictationRecorder(state.session, state.settings.preferredMicrophoneId)
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
    setRequestedOnboarding(false)
    setActiveTab('overview')
  }

  /* ── Auto-complete onboarding for existing users who already have an API key ── */
  useEffect(() => {
    if (settings.onboardingCompleted && requestedOnboarding) {
      setRequestedOnboarding(false)
    }
  }, [requestedOnboarding, settings.onboardingCompleted])

  /* ── Onboarding wizard overlay ── */
  if (forceOnboarding || requestedOnboarding || !settings.onboardingCompleted) {
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
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: easeOutExpo }}
              >
                <OverviewPanel
                  state={{ ...state, settings, history: state.history }}
                />
              </motion.div>
            )}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: easeOutExpo }}
              >
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
              <motion.div
                key="history"
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: easeOutExpo }}
              >
                <HistoryPanel
                  history={state.history}
                  retentionDays={settings.historyRetentionDays}
                  reducedMotion={reducedMotion}
                  sectionMotion={sectionMotion}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
