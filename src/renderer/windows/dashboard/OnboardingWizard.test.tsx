import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { defaultSettings } from '@shared/defaults'
import '@renderer/i18n'
import { OnboardingWizard } from './OnboardingWizard'

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('OnboardingWizard', () => {
  it('calls finishOnboarding from the final step CTA', async () => {
    const finishDeferred = createDeferred<void>()
    const finishOnboarding = vi.fn(() => finishDeferred.promise)

    const { container } = render(
      <OnboardingWizard
        settings={{ ...defaultSettings, apiKeyPresent: true }}
        session={null}
        pendingApiKey=""
        setPendingApiKey={() => undefined}
        saveApiKey={vi.fn(async () => undefined)}
        updateSettings={vi.fn(async () => defaultSettings)}
        microphoneRefreshKey={0}
        refreshMicrophones={() => undefined}
        finishOnboarding={finishOnboarding}
        initialStep={9}
      />,
    )

    const finishButton = container.querySelector('.wizard-actions .button-primary')
    expect(finishButton).not.toBeNull()

    await userEvent.click(finishButton as HTMLButtonElement)

    expect(finishOnboarding).toHaveBeenCalledTimes(1)
    expect((container.querySelector('.wizard-actions .button-primary') as HTMLButtonElement)?.textContent).toMatch(/saving/i)

    finishDeferred.resolve()
  })
})
