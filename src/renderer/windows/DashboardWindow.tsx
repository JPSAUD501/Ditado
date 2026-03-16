import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Clock, LayoutDashboard, Settings2 } from 'lucide-react'

import type { DashboardTab, InsertionBenchmarkResult, Settings } from '@shared/contracts'
import { StatusPill } from '@renderer/components/StatusPill'
import { useDashboardBridge, useDictationRecorder } from '@renderer/hooks/useDitadoBridge'
import { useThemeAndLanguage } from '@renderer/hooks/useThemeAndLanguage'
import { HistoryPanel } from './dashboard/HistoryPanel'
import { OnboardingWizard } from './dashboard/OnboardingWizard'
import { OverviewPanel } from './dashboard/OverviewPanel'
import { SettingsPanel } from './dashboard/SettingsPanel'

const navTabs: Array<{ id: DashboardTab; labelKey: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }> = [
  { id: 'overview', labelKey: 'common.overview', Icon: LayoutDashboard },
  { id: 'settings', labelKey: 'common.settings', Icon: Settings2 },
  { id: 'history', labelKey: 'common.history', Icon: Clock },
]

const easeOutExpo = [0.16, 1, 0.3, 1] as const
const defaultBenchmarkText =
  'abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz'
const areSettingsEqual = (left: Settings, right: Settings): boolean => JSON.stringify(left) === JSON.stringify(right)

export const DashboardWindow = ({ initialTab }: { initialTab: DashboardTab }) => {
  const state = useDashboardBridge()
  const reducedMotion = useReducedMotion()
  const effectiveInitial = initialTab === 'onboarding' ? 'overview' : initialTab
  const [activeTab, setActiveTab] = useState<DashboardTab>(effectiveInitial)
  const [pendingApiKey, setPendingApiKey] = useState('')
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null)
  const [microphoneRefreshKey, setMicrophoneRefreshKey] = useState(0)
  const [benchmarkText, setBenchmarkText] = useState(defaultBenchmarkText)
  const [benchmarkCountdown, setBenchmarkCountdown] = useState<number | null>(null)
  const [benchmarkRunning, setBenchmarkRunning] = useState(false)
  const [benchmarkResult, setBenchmarkResult] = useState<InsertionBenchmarkResult | null>(null)
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null)
  const latestStateSettings = useRef(state.settings)
  // Always keep in sync during render — never rely on useEffect for this ref,
  // because effects run *after* paint and a fast second mutation would read stale data.
  latestStateSettings.current = draftSettings ?? state.settings
  const latestSettingsMutationId = useRef(0)
  const { isRecording } = useDictationRecorder(state.session, state.settings.preferredMicrophoneId)
  const { t } = useTranslation()
  const settings = draftSettings ?? state.settings
  useThemeAndLanguage(settings)
  const sessionStatus = state.session?.status ?? 'idle'

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
  }

  const runInsertionBenchmark = (): void => {
    if (benchmarkRunning || benchmarkCountdown !== null) return

    const trimmed = benchmarkText.trim()
    if (!trimmed) {
      setBenchmarkResult(null)
      setBenchmarkError('Enter benchmark text before running the test.')
      return
    }

    setBenchmarkError(null)
    setBenchmarkResult(null)
    setBenchmarkCountdown(3)

    let remaining = 3
    const interval = window.setInterval(() => {
      remaining -= 1
      if (remaining > 0) {
        setBenchmarkCountdown(remaining)
        return
      }
      window.clearInterval(interval)
      setBenchmarkCountdown(null)
      setBenchmarkRunning(true)
      void window.ditado
        .benchmarkInsertion(settings.insertionStreamingMode, trimmed)
        .then((result) => { setBenchmarkResult(result); setBenchmarkError(null) })
        .catch((err: unknown) => { setBenchmarkError(err instanceof Error ? err.message : 'Benchmark failed.') })
        .finally(() => { setBenchmarkRunning(false) })
    }, 1000)
  }

  /* ── Auto-complete onboarding for existing users who already have an API key ── */
  const autoOnboardingDone = useRef(false)
  useEffect(() => {
    if (!settings.onboardingCompleted && settings.apiKeyPresent && !autoOnboardingDone.current) {
      autoOnboardingDone.current = true
      void updateSettings({ onboardingCompleted: true }).catch(() => undefined)
    }
  }, [settings.onboardingCompleted, settings.apiKeyPresent])

  /* ── Onboarding wizard overlay ── */
  if (!settings.onboardingCompleted && !settings.apiKeyPresent) {
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
          <div className="session-dot" data-status={sessionStatus} title={sessionStatus} />
          <span className="sidebar-label">
            {sessionStatus === 'idle' ? t('common.idle') : sessionStatus === 'listening' ? t('sidebar.rec') : sessionStatus}
          </span>
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
                benchmarkText={benchmarkText}
                setBenchmarkText={setBenchmarkText}
                resetBenchmarkText={() => setBenchmarkText(defaultBenchmarkText)}
                benchmarkCountdown={benchmarkCountdown}
                benchmarkRunning={benchmarkRunning}
                benchmarkResult={benchmarkResult}
                benchmarkError={benchmarkError}
                runInsertionBenchmark={runInsertionBenchmark}
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
