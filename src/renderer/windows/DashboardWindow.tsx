import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Clock, LayoutDashboard, Settings2 } from 'lucide-react'

import type { DashboardTab, InsertionBenchmarkResult, Settings } from '@shared/contracts'
import { StatusPill } from '@renderer/components/StatusPill'
import { useDashboardBridge, useDictationRecorder } from '@renderer/hooks/useDitadoBridge'
import { HistoryPanel } from './dashboard/HistoryPanel'
import { OnboardingWizard } from './dashboard/OnboardingWizard'
import { OverviewPanel } from './dashboard/OverviewPanel'
import { SettingsPanel } from './dashboard/SettingsPanel'

const navTabs: Array<{ id: DashboardTab; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'settings', label: 'Settings', Icon: Settings2 },
  { id: 'history', label: 'History', Icon: Clock },
]

const easeOutExpo = [0.16, 1, 0.3, 1] as const
const defaultBenchmarkText =
  'abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz'

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
  const { isRecording } = useDictationRecorder(state.session, state.settings.preferredMicrophoneId)
  const settings = draftSettings ?? state.settings
  const sessionStatus = state.session?.status ?? 'idle'

  const updateSettings = async (patch: Partial<Settings>) => {
    const optimisticSettings = { ...settings, ...patch }
    setDraftSettings(optimisticSettings)
    try {
      const nextSettings = await window.ditado.updateSettings(patch)
      setDraftSettings(nextSettings)
      return nextSettings
    } catch (error) {
      setDraftSettings(state.settings)
      throw error
    }
  }

  const saveApiKey = async (): Promise<void> => {
    const optimisticSettings = { ...settings, apiKeyPresent: Boolean(pendingApiKey.trim()) }
    setDraftSettings(optimisticSettings)
    try {
      const nextSettings = await window.ditado.setApiKey(pendingApiKey)
      setDraftSettings(nextSettings)
      setPendingApiKey('')
    } catch (error) {
      setDraftSettings(state.settings)
      throw error
    }
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

  const activeTabMeta = navTabs.find((t) => t.id === activeTab)

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">D</div>
        <div className="sidebar-nav">
          {navTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              className="sidebar-icon"
              data-active={activeTab === id}
              data-tooltip={label}
              type="button"
              aria-label={label}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={17} strokeWidth={1.8} />
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="session-dot" data-status={sessionStatus} title={sessionStatus} />
          <span className="sidebar-label">
            {sessionStatus === 'idle' ? 'Idle' : sessionStatus === 'listening' ? 'Rec' : sessionStatus}
          </span>
        </div>
      </nav>

      {/* Main */}
      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{activeTabMeta?.label ?? 'Ditado'}</span>
          {state.session?.targetApp ? (
            <>
              <span className="topbar-sep">/</span>
              <span className="topbar-target">{state.session.targetApp}</span>
            </>
          ) : null}
          <div className="topbar-actions">
            <StatusPill status={sessionStatus} />
            <button className="button-ghost" type="button" onClick={() => void window.ditado.toggleDictation()}>Toggle</button>
            <button className="button-ghost" type="button" onClick={() => void window.ditado.startPushToTalk()}>Push</button>
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
                openSettings={() => setActiveTab('settings')}
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
