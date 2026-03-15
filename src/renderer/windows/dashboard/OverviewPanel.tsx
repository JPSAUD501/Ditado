import { motion } from 'framer-motion'

import { StatusPill } from '@renderer/components/StatusPill'
import type { DashboardViewModel } from '@shared/contracts'
import { formatDate } from './formatters'

const StatBlock = ({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) => (
  <div className="stat-block">
    <span className="eyebrow">{label}</span>
    <span className="stat-value mt-3">{value}</span>
    <p className="copy-muted mt-3 text-sm">{description}</p>
  </div>
)

export const OverviewPanel = ({
  state,
  isRecording,
  reducedMotion,
  sectionMotion,
  openSettings,
}: {
  state: DashboardViewModel
  isRecording: boolean
  reducedMotion: boolean | null
  sectionMotion: {
    initial: { opacity: number; y: number }
    animate: { opacity: number; y: number }
    transition: { duration: number; ease: readonly [number, number, number, number] }
  }
  openSettings: () => void
}) => {
  const history = state.history
  const latestEntry = history[0] ?? null
  const sessionStatus = state.session?.status ?? 'idle'

  const stageLabel =
    sessionStatus === 'idle'
      ? 'Standing by'
      : sessionStatus === 'arming'
        ? 'Preparing capture'
      : sessionStatus === 'listening'
        ? 'Capturing speech'
      : sessionStatus === 'processing'
        ? 'Drafting final text'
      : sessionStatus === 'streaming'
        ? 'Writing into field'
      : sessionStatus === 'completed'
        ? 'Last insertion landed'
      : sessionStatus === 'notice'
        ? 'Quick-tip guidance'
      : sessionStatus === 'permission-required'
        ? 'Permission blocked'
      : 'Needs attention'

  const telemetrySample = state.telemetryTail.slice(0, 4)

  return (
    <motion.div {...(reducedMotion ? {} : sectionMotion)} className="grid gap-6">
      <section className="surface-panel surface-glow overflow-hidden px-5 py-5 md:px-7 md:py-7">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
          <div className="min-w-0">
            <div className="eyebrow">Desktop control room</div>
            <h1 className="display-title mt-4">Resident. Quiet. Ready.</h1>
            <p className="copy-soft mt-5 max-w-[42rem] text-[0.98rem] md:text-[1.04rem]">
              Ditado behaves like a desktop utility. You call it, speak naturally, and it returns final writing with a local recovery trail.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="button-primary" type="button" onClick={() => void window.ditado.toggleDictation()}>
                Start toggle dictation
              </button>
              <button className="button-secondary" type="button" onClick={() => void window.ditado.startPushToTalk()}>
                Arm push-to-talk
              </button>
              <button className="button-ghost" type="button" onClick={openSettings}>
                Open settings
              </button>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <StatBlock
                label="Current mode"
                value={isRecording ? 'Hot mic' : 'Ready'}
                description="Capture begins from global shortcuts instead of pulling you into a separate editor."
              />
              <StatBlock
                label="Context"
                value={state.settings.sendContextAutomatically ? 'Selection-aware' : 'Audio only'}
                description="The model receives foreground metadata and selected text only when available."
              />
              <StatBlock
                label="Model"
                value={state.settings.modelId.split('/').at(-1) ?? state.settings.modelId}
                description="User-owned OpenRouter key, editable model id, and silence blocked before a request is sent."
              />
            </div>
          </div>

          <aside className="surface-muted grid gap-4 rounded-[1.6rem] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow">Live stage</div>
                <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">{stageLabel}</div>
              </div>
              <StatusPill status={sessionStatus} />
            </div>
            <div className="ornament-line" />
            <div className="grid gap-3">
              <div className="text-sm font-medium text-[var(--text-1)]">
                {state.session?.targetApp ?? 'Foreground app'}
              </div>
              <p className="copy-soft wrap-safe text-sm">
                {state.session?.partialText?.trim() ||
                  'When the next dictation starts, this panel will show where the text is heading and how the system is responding.'}
              </p>
            </div>
            <div className="surface-muted rounded-[1.2rem] px-4 py-3">
              <div className="eyebrow">Last update check</div>
              <div className="mt-2 text-sm text-[var(--text-1)]">{formatDate(state.updateState.lastCheckedAt)}</div>
              <div className="mt-1 text-sm text-[var(--text-3)]">{state.updateState.status}</div>
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <section className="surface-panel px-5 py-5 md:px-7 md:py-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] md:items-end">
            <div className="min-w-0">
              <div className="eyebrow">Operational signals</div>
              <h2 className="section-title mt-3">The UI stays calm while the system stays explicit.</h2>
            </div>
            <p className="copy-soft min-w-0 text-sm md:text-[0.98rem]">
              The dashboard avoids becoming an editor. It shows state, route-to-recovery, and only the details that change trust.
            </p>
          </div>
          <div className="ornament-line my-6" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="surface-muted rounded-[1.45rem] p-4">
              <div className="eyebrow">Permissions</div>
              <div className="mt-3 text-lg font-semibold text-[var(--text-1)]">{state.permissions.microphone}</div>
              <p className="copy-soft mt-3 text-sm">
                Accessibility is {state.permissions.accessibility}. Ditado keeps the context model simple: app, window and selected text when available.
              </p>
            </div>
            <div className="surface-muted rounded-[1.45rem] p-4">
              <div className="eyebrow">Last output</div>
              <div className="mt-3 text-lg font-semibold text-[var(--text-1)]">{latestEntry?.appName ?? 'No entries yet'}</div>
              <p className="copy-soft wrap-safe mt-3 text-sm">
                {latestEntry?.outputText ||
                  'The history rail will store recent insertions locally, giving you a recoverable trail without turning Ditado into a transcript archive.'}
              </p>
            </div>
          </div>
        </section>

        <section className="surface-panel px-5 py-5">
          <div className="eyebrow">Telemetry tail</div>
          <h2 className="section-title mt-3">Minimal technical trace.</h2>
          <div className="ornament-line my-5" />
          <div className="grid gap-3">
            {telemetrySample.length === 0 ? (
              <div className="copy-soft text-sm">No technical events captured yet.</div>
            ) : (
              telemetrySample.map((event) => (
                <div key={event.id} className="surface-muted rounded-[1.2rem] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-[var(--text-1)]">{event.name}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-3)]">{event.kind}</div>
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-3)]">{formatDate(event.timestamp)}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </motion.div>
  )
}
