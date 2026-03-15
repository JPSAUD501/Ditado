import { motion } from 'framer-motion'

export const OnboardingPanel = ({
  finishOnboarding,
  openSettings,
  reducedMotion,
  sectionMotion,
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
  <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
    <section className="surface-panel px-5 py-5 md:px-7 md:py-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] md:items-end">
        <div className="min-w-0">
          <div className="eyebrow">First-use path</div>
          <h2 className="section-title mt-3">Trust is built in five short moves.</h2>
        </div>
        <p className="copy-soft min-w-0 text-sm md:text-[0.98rem]">
          The onboarding teaches confidence: where permissions matter, where recovery lives, and how to begin fast.
        </p>
      </div>
      <div className="ornament-line my-6" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          'Add your OpenRouter API key so Ditado can call the selected model.',
          'Grant microphone access and keep the app available in the tray.',
          'Choose one hotkey you can remember and one you can hold comfortably.',
          'Speak naturally; the model rewrites speech into final text, not raw transcript.',
          'If insertion cannot complete cleanly, Ditado keeps the latest result in the clipboard and tells you what happened.',
        ].map((item, index) => (
          <div key={item} className="surface-muted rounded-[1.45rem] px-5 py-5">
            <div className="eyebrow">Step 0{index + 1}</div>
            <p className="copy-soft mt-4 text-sm">{item}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="button-primary" type="button" onClick={finishOnboarding}>
          Finish onboarding
        </button>
        <button className="button-secondary" type="button" onClick={openSettings}>
          Open settings
        </button>
      </div>
    </section>
  </motion.div>
)
