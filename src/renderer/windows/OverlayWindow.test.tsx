import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import i18n from '@renderer/i18n'
import { OverlayWindow } from './OverlayWindow'
import { createTestSession } from '@shared/testFixtures'
import type { DictationSession } from '@shared/contracts'
import {
  installTestDesktopApi,
  renderWithSyncore,
  resetSyncoreTestState,
  updateSyncoreTestState,
} from '@renderer/test/syncoreTestClient'

const createSession = (
  overrides: Partial<DictationSession> = {},
): DictationSession => {
  const idle = createTestSession()
  return {
    ...idle,
    status: 'notice',
    sessionId: 'session-overlay',
    isActive: true,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    noticeMessage: 'Segure para ditar. Toggle: Shift+Alt',
    ...overrides,
  }
}

describe('OverlayWindow with Syncore', () => {
  beforeEach(() => {
    resetSyncoreTestState()
    installTestDesktopApi()
  })

  it('renders translated startup notices from the active session query', async () => {
    updateSyncoreTestState({
      session: createSession({ noticeMessage: 'notices.updating' }),
    })
    renderWithSyncore(<OverlayWindow />)

    expect(await screen.findByText(i18n.t('notices.updating'))).toBeInTheDocument()
    expect(screen.queryByText('notices.updating')).toBeNull()
  })

  it('renders nothing while Syncore has no active session', async () => {
    const { container } = renderWithSyncore(<OverlayWindow />)

    await waitFor(() => {
      expect(container.querySelector('.overlay-shell')).toBeInTheDocument()
      expect(container.querySelector('.overlay-chip')).toBeNull()
    })
  })

  it('shows the activation mode and status reactively', async () => {
    updateSyncoreTestState({
      session: createSession({
        activationMode: 'toggle',
        status: 'listening',
        finishedAt: null,
        noticeMessage: null,
        targetApp: 'VS Code',
      }),
    })
    renderWithSyncore(<OverlayWindow />)

    await waitFor(() => {
      const chip = document.querySelector('.overlay-chip')
      expect(chip).toHaveAttribute('data-mode', 'toggle')
      expect(chip).toHaveAttribute('data-status', 'listening')
    })
  })

  it('normalizes unknown target applications to App', async () => {
    updateSyncoreTestState({
      session: createSession({
        activationMode: 'toggle',
        status: 'listening',
        finishedAt: null,
        noticeMessage: null,
        targetApp: 'Unknown App',
        context: {
          ...createTestSession().context,
          appName: 'Unknown App',
        },
      }),
    })
    renderWithSyncore(<OverlayWindow />)

    expect(await screen.findByText('App')).toBeInTheDocument()
    expect(screen.queryByText('Unknown App')).toBeNull()
  })
})
