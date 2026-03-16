// Legacy onboarding panel — the wizard flow (OnboardingWizard.tsx) is now the primary experience.
// This file is kept for DashboardTab type compatibility. It should not be rendered in normal use.

export const OnboardingPanel = ({
  finishOnboarding,
  openSettings,
}: {
  finishOnboarding: () => void
  openSettings: () => void
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
}) => (
  <div className="surface-panel p-5">
    <div className="eyebrow mb-2">Setup</div>
    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
      Complete the setup wizard to configure Ditado.
    </p>
    <div className="flex gap-2 mt-3">
      <button className="button-primary" type="button" onClick={finishOnboarding}>
        Mark complete
      </button>
      <button className="button-secondary" type="button" onClick={openSettings}>
        Open settings
      </button>
    </div>
  </div>
)
