import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardWindow } from './DashboardWindow'
import { defaultSettings } from '@shared/defaults'
import { createTestSession } from '@shared/testFixtures'
import type { HistoryEntry } from '@shared/contracts'
import {
  installTestDesktopApi,
  renderWithSyncore,
  resetSyncoreTestState,
  syncoreTestCalls,
} from '@renderer/test/syncoreTestClient'

const createHistoryEntry = (): HistoryEntry => {
  const audit = createTestSession()
  const createdAt = new Date().toISOString()
  return {
    _id: 'historyEntries:test' as HistoryEntry['_id'],
    _creationTime: Date.now(),
    sessionId: 'session-history',
    createdAt,
    createdAtMs: Date.now(),
    outcome: 'completed',
    appName: 'VS Code',
    windowTitle: 'prompt.ts',
    activationMode: 'toggle',
    modelId: defaultSettings.modelId,
    outputText: 'expanded output',
    errorMessage: null,
    context: {
      ...audit.context,
      appName: 'VS Code',
      windowTitle: 'prompt.ts',
      selectedText: 'selected context for expansion',
      permissionsGranted: true,
      confidence: 'high',
      capturedAt: createdAt,
    },
    timing: audit.timing,
    audio: {
      ...audit.audio,
      durationMs: 1_400,
      mimeType: 'audio/wav',
      bytes: 2_048,
      speechDetected: true,
    },
    llm: { ...audit.llm, usedContext: true },
    insertion: audit.insertion,
    searchText: 'expanded output VS Code selected context for expansion',
  }
}

describe('DashboardWindow with Syncore', () => {
  beforeEach(() => {
    resetSyncoreTestState()
    installTestDesktopApi()
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:history-audio'),
      configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    })
  })

  it('opens onboarding from reactive Syncore settings', async () => {
    resetSyncoreTestState({
      settings: {
        ...defaultSettings,
        apiKeyPresent: true,
        onboardingCompleted: false,
      },
    })
    installTestDesktopApi()

    renderWithSyncore(<DashboardWindow initialTab="onboarding" />)

    expect(await screen.findByText(/meet ditado/i)).toBeInTheDocument()
    expect(window.ditado.setOnboardingDictationEnabled).toHaveBeenCalled()
  })

  it('keeps settings available when the API key is missing', async () => {
    resetSyncoreTestState({
      settings: { ...defaultSettings, onboardingCompleted: true, apiKeyPresent: false },
    })
    installTestDesktopApi()

    renderWithSyncore(<DashboardWindow initialTab="settings" />)

    expect(await screen.findByRole('textbox', { name: /model id/i })).toBeInTheDocument()
  })

  it('persists settings with the Syncore mutation', async () => {
    renderWithSyncore(<DashboardWindow initialTab="settings" />)

    const toggle = await screen.findByRole('button', { name: /send context automatically/i })
    await userEvent.click(toggle)

    await waitFor(() => {
      expect(syncoreTestCalls.settingsUpdate).toHaveBeenCalledWith({
        sendContextAutomatically: false,
      })
    })
  })

  it('stores the API key through the Syncore action', async () => {
    renderWithSyncore(<DashboardWindow initialTab="settings" />)

    const input = await screen.findByPlaceholderText('sk-or-v1-...')
    await userEvent.type(input, 'sk-or-v1-demo')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(syncoreTestCalls.secretSet).toHaveBeenCalledWith('sk-or-v1-demo')
    })
  })

  it('loads history audio through the Syncore storage query only after expansion', async () => {
    resetSyncoreTestState({ history: [createHistoryEntry()] })
    installTestDesktopApi()
    renderWithSyncore(<DashboardWindow initialTab="history" />)

    await userEvent.click(await screen.findByRole('button', { name: /expanded output/i }))

    expect(await screen.findByText('selected context for expansion')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument()
  })
})
