import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import type { DashboardTab, InsertionBenchmarkResult, Settings } from '@shared/contracts'
import { StatusPill } from '@renderer/components/StatusPill'
import { useDashboardBridge, useDictationRecorder } from '@renderer/hooks/useDitadoBridge'
import { HistoryPanel } from './dashboard/HistoryPanel'
import { OnboardingPanel } from './dashboard/OnboardingPanel'
import { OverviewPanel } from './dashboard/OverviewPanel'
import { SettingsPanel } from './dashboard/SettingsPanel'

const tabs: Array<{ id: DashboardTab; label: string; kicker: string }> = [
  { id: 'overview', label: 'Overview', kicker: 'System view' },
  { id: 'settings', label: 'Settings', kicker: 'Tune behavior' },
  { id: 'history', label: 'History', kicker: 'Recent output' },
  { id: 'onboarding', label: 'Onboarding', kicker: 'First-use path' },
]

const easeOutExpo = [0.16, 1, 0.3, 1] as const
const defaultBenchmarkText =
  'abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz abcdefghijlmnopqrstuvxz'

export const DashboardWindow = ({ initialTab }: { initialTab: DashboardTab }) => {
  const state = useDashboardBridge()
  const reducedMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab)
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
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: easeOutExpo },
  } as const

  const refreshMicrophones = (): void => {
    setMicrophoneRefreshKey((value) => value + 1)
  }

  const finishOnboarding = (): void => {
    void updateSettings({ onboardingCompleted: true }).then(() => {
      setActiveTab('overview')
    })
  }

  const runInsertionBenchmark = (): void => {
    if (benchmarkRunning || benchmarkCountdown !== null) {
      return
    }

    const trimmedBenchmarkText = benchmarkText.trim()
    if (!trimmedBenchmarkText) {
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
        .benchmarkInsertion(settings.insertionStreamingMode, trimmedBenchmarkText)
        .then((result) => {
          setBenchmarkResult(result)
          setBenchmarkError(null)
        })
        .catch((error: unknown) => {
          setBenchmarkError(error instanceof Error ? error.message : 'Benchmark failed.')
        })
        .finally(() => {
          setBenchmarkRunning(false)
        })
    }, 1000)
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <motion.header
          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: easeOutExpo }}
          className="mb-6 grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]"
        >
          <aside className="surface-panel app-rail px-4 py-4 md:px-5 md:py-5">
            <div className="eyebrow">Ditado desktop</div>
            <div className="mt-4 text-[1.25rem] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
              Voice layer
            </div>
            <p className="copy-soft mt-3 text-sm">
              Tray-resident dictation for fields, chats, docs and code.
            </p>
            <div className="ornament-line my-5" />
            <nav className="grid gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className="rail-link"
                  data-active={activeTab === tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-medium text-current">{tab.label}</span>
                    <span className="mt-1 block text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">
                      {tab.kicker}
                    </span>
                  </span>
                  <span className="rail-dot" />
                </button>
              ))}
            </nav>
          </aside>

          <div className="surface-panel app-toolbar px-5 py-5 md:px-7 md:py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="eyebrow">Foreground writing system</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h1 className="text-[1.55rem] font-semibold tracking-[-0.05em] text-[var(--text-1)]">
                    Desktop workspace
                  </h1>
                  <div className="surface-muted rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--text-3)]">
                    {state.session?.targetApp ?? 'Foreground app'}
                  </div>
                </div>
                <p className="copy-soft mt-3 max-w-[42rem] text-[0.95rem]">
                  Hotkeys, permissions, local history and recovery all stay visible without turning the product into an editor.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="button-secondary" type="button" onClick={() => void window.ditado.toggleDictation()}>
                  Toggle
                </button>
                <button className="button-ghost" type="button" onClick={() => void window.ditado.startPushToTalk()}>
                  Push
                </button>
                <StatusPill status={sessionStatus} />
                <div className="surface-muted rounded-full px-4 py-2 text-sm text-[var(--text-2)]">
                  {settings.modelId}
                </div>
              </div>
            </div>
          </div>
        </motion.header>

        <div className="grid gap-6">
          {activeTab === 'overview' && (
            <OverviewPanel
              state={{ ...state, settings, history: state.history }}
              isRecording={isRecording}
              reducedMotion={reducedMotion}
              sectionMotion={sectionMotion}
              openSettings={() => setActiveTab('settings')}
            />
          )}
          {activeTab === 'settings' && (
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
          )}
          {activeTab === 'history' && (
            <HistoryPanel
              history={state.history}
              retentionDays={settings.historyRetentionDays}
              reducedMotion={reducedMotion}
              sectionMotion={sectionMotion}
            />
          )}
          {activeTab === 'onboarding' && (
            <OnboardingPanel
              finishOnboarding={finishOnboarding}
              openSettings={() => setActiveTab('settings')}
              reducedMotion={reducedMotion}
              sectionMotion={sectionMotion}
            />
          )}
        </div>
      </div>
    </div>
  )
}
