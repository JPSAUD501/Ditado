import { defaultPermissionState, defaultSettings } from '@shared/defaults'
import { historyEntrySchema } from '@shared/contracts'
import type {
  ActivationMode,
  DashboardViewModel,
  DeviceInfo,
  DictationSession,
  DictationStatus,
  OverlayViewModel,
  PermissionState,
  Settings,
  TelemetryRecord,
} from '@shared/contracts'

const overlayState: OverlayViewModel = {
  session: null,
  settings: defaultSettings,
  permissions: defaultPermissionState,
}

const dashboardState: DashboardViewModel = {
  session: null,
  settings: defaultSettings,
  history: [],
  telemetryTail: [],
  permissions: defaultPermissionState,
  updateState: {
    enabled: true,
    channel: 'stable',
    lastCheckedAt: null,
    status: 'idle',
    downloadProgress: null,
  },
  appVersion: '0.0.0-mock',
}

const overlayListeners = new Set<(state: OverlayViewModel) => void>()
const dashboardListeners = new Set<(state: DashboardViewModel) => void>()
const audioLevelListeners = new Set<(rms: number) => void>()

// Fresh object on every notify so React state updates are not skipped by reference equality
const notifyOverlay = (): void => {
  const snapshot = { ...overlayState }
  for (const listener of overlayListeners) {
    listener(snapshot)
  }
}

const notifyDashboard = (): void => {
  const snapshot = { ...dashboardState }
  for (const listener of dashboardListeners) {
    listener(snapshot)
  }
}

const updateSettings = async (patch: Partial<Settings>): Promise<Settings> => {
  Object.assign(overlayState.settings, patch)
  Object.assign(dashboardState.settings, patch)
  notifyOverlay()
  notifyDashboard()
  return dashboardState.settings
}

const noopPermission = async (): Promise<PermissionState> => defaultPermissionState
const noopTelemetry = async (): Promise<TelemetryRecord[]> => []
const noopDevices = async (): Promise<DeviceInfo[]> => []
const noopDictation = async (): Promise<void> => undefined

/* ── Browser-only demo: cycles the overlay through every status ──────
 * Open the renderer in a plain browser (vite dev) with
 *   /?window=overlay&demo=1            → toggle mode
 *   /?window=overlay&demo=1&mode=ptt   → push-to-talk mode
 *   /?window=overlay&demo=manual       → no auto-cycle; drive it from devtools with
 *                                          window.__ditadoDemoSet({ status: "listening", ms: 0 })
 * The mock drives session state and synthetic mic levels so the pill's
 * transitions can be reviewed without launching Electron.
 */

type DemoStep = { status: DictationStatus | null; ms: number; notice?: string; selectedText?: string }

const demoScript: DemoStep[] = [
  { status: 'arming', ms: 700 },
  { status: 'listening', ms: 3200, selectedText: 'selected text' },
  { status: 'processing', ms: 2000, selectedText: 'selected text' },
  { status: 'streaming', ms: 2400, selectedText: 'selected text' },
  { status: 'completed', ms: 1200, selectedText: 'selected text' },
  { status: null, ms: 900 },
  { status: 'arming', ms: 600 },
  { status: 'listening', ms: 1800 },
  { status: 'processing', ms: 1200 },
  { status: 'error', ms: 1200 },
  { status: null, ms: 900 },
  { status: 'notice', ms: 1600, notice: 'notices.ready' },
  { status: null, ms: 700 },
  { status: 'notice', ms: 1600, notice: 'notices.doubleTapToToggle' },
  { status: null, ms: 1200 },
]

const buildDemoSession = (
  step: DemoStep,
  mode: ActivationMode,
  processingStartedAt: string | null,
): DictationSession => {
  const now = new Date().toISOString()
  return {
    id: 'demo-session',
    activationMode: mode,
    status: step.status ?? 'idle',
    captureIntent: 'none',
    startedAt: now,
    finishedAt: null,
    processingStartedAt,
    targetApp: 'Visual Studio Code',
    context: {
      appName: 'Visual Studio Code',
      windowTitle: null,
      selectedText: step.selectedText ?? '',
      permissionsGranted: true,
      confidence: 'high',
      capturedAt: now,
    },
    partialText: '',
    finalText: '',
    insertionPlan: { strategy: 'insert-at-cursor', targetApp: 'Visual Studio Code', capability: 'automation' },
    errorMessage: step.status === 'error' ? 'Demo error' : null,
    noticeMessage: step.notice ?? null,
  }
}

declare global {
  interface Window {
    /** Browser-only demo hook: jump the overlay to a given step (see startOverlayDemo). */
    __ditadoDemoSet?: (step: DemoStep) => void
  }
}

const startOverlayDemo = (mode: ActivationMode, manual: boolean): void => {
  let index = 0
  let processingStartedAt: string | null = null
  let levelTimer: number | null = null

  const stopLevels = (): void => {
    if (levelTimer !== null) {
      window.clearInterval(levelTimer)
      levelTimer = null
    }
  }

  const startLevels = (): void => {
    stopLevels()
    let t = 0
    levelTimer = window.setInterval(() => {
      t += 1
      // Rough "speech" envelope: bursts of syllables with short pauses
      const syllable = Math.max(0, Math.sin(t / 2.2)) * (0.55 + 0.45 * Math.sin(t / 9))
      const pause = Math.sin(t / 23) > 0.7 ? 0 : 1
      const rms = pause * (0.04 + syllable * 0.16 + Math.random() * 0.02)
      for (const listener of audioLevelListeners) listener(rms)
    }, 50)
  }

  const apply = (step: DemoStep): void => {
    if (step.status === 'processing' && processingStartedAt === null) {
      processingStartedAt = new Date().toISOString()
    }
    if (step.status === null || step.status === 'arming' || step.status === 'listening' || step.status === 'notice') {
      processingStartedAt = null
    }

    overlayState.session = step.status === null ? null : buildDemoSession(step, mode, processingStartedAt)
    dashboardState.session = overlayState.session
    notifyOverlay()
    notifyDashboard()

    if (step.status === 'listening') startLevels()
    else stopLevels()
  }

  const advance = (): void => {
    const step = demoScript[index % demoScript.length]
    index += 1
    apply(step)
    window.setTimeout(advance, step.ms)
  }

  window.__ditadoDemoSet = apply
  if (!manual) advance()
}

/* ── Browser-only seed: realistic history + completed setup ──────────
 * /?window=dashboard&seed=1 fills the dashboard with sample dictations so
 * the Overview/History/Settings screens can be reviewed with real content.
 */

const seedSamples: Array<{ app: string; title: string; text: string; secs: number; mode: 'push-to-talk' | 'toggle'; ago: number; error?: string; ctx?: boolean }> = [
  { app: 'Slack', title: '#eng-platform', text: 'Consegui reproduzir o bug do atalho no Windows depois do lock. Vou abrir um PR hoje ainda com o fix e os testes.', secs: 9, mode: 'push-to-talk', ago: 4 },
  { app: 'Visual Studio Code', title: 'dictationSessionOrchestrator.ts', text: 'Refatora o orquestrador para separar a captura de contexto da submissão, mantendo a mesma interface pública.', secs: 7, mode: 'push-to-talk', ago: 22, ctx: true },
  { app: 'Gmail', title: 'Re: Proposta Q4', text: 'Oi Marina, obrigado pelo retorno. Faz sentido adiar o kickoff para a segunda semana de outubro. Confirmo com o time e volto até quinta.', secs: 14, mode: 'toggle', ago: 65 },
  { app: 'Notion', title: 'Roadmap 2026', text: 'Prioridade do trimestre: reduzir a latência do primeiro token abaixo de um segundo e estabilizar a inserção no Linux.', secs: 11, mode: 'toggle', ago: 140 },
  { app: 'Microsoft Teams', title: 'Chat com Rafael', text: 'Pode mandar o link da gravação? Quero revisar a parte da demo antes da reunião de amanhã.', secs: 5, mode: 'push-to-talk', ago: 200 },
  { app: 'Visual Studio Code', title: 'README.md', text: '', secs: 3, mode: 'push-to-talk', ago: 260, error: 'Nenhuma fala detectada no áudio.' },
  { app: 'WhatsApp', title: 'Família', text: 'Chego por volta das oito, não precisa esperar pra jantar.', secs: 4, mode: 'push-to-talk', ago: 1440 },
  { app: 'Slack', title: '#design', text: 'A pill nova ficou bem melhor sem o glow. Só ajustaria o espaçamento entre o equalizador e o badge de contexto.', secs: 8, mode: 'push-to-talk', ago: 1500, ctx: true },
  { app: 'Obsidian', title: 'Daily note', text: 'Ideias para o onboarding: mostrar o atalho em uso real logo na primeira tela, sem explicar antes de deixar tentar.', secs: 12, mode: 'toggle', ago: 2900 },
  { app: 'Gmail', title: 'Fatura setembro', text: '', secs: 6, mode: 'toggle', ago: 3100, error: 'OpenRouter respondeu 429 (rate limit). Tente novamente em alguns segundos.' },
  { app: 'Linear', title: 'DIT-142', text: 'Quando a janela do overlay perde o foco durante o streaming, o cursor volta para o app errado. Reproduz em 1 de cada 5 tentativas.', secs: 10, mode: 'push-to-talk', ago: 4400 },
  { app: 'Figma', title: 'Ditado · Dashboard', text: 'Comentário: o card de status poderia virar uma faixa fina no topo, hoje ele ocupa espaço demais quando está ocioso.', secs: 9, mode: 'push-to-talk', ago: 5800, ctx: true },
  { app: 'Slack', title: '#eng-platform', text: 'Release 0.1.58 publicada com instaladores Windows e Linux. O runner do Windows foi pinado em 2022 por causa do VS 2026.', secs: 8, mode: 'toggle', ago: 7300 },
  { app: 'Notion', title: 'Retro sprint 31', text: 'O que funcionou: pareamento nas tardes. O que não funcionou: revisar PR grande na sexta.', secs: 7, mode: 'push-to-talk', ago: 8700 },
]

const seedDashboard = (empty = false): void => {
  const now = Date.now()
  dashboardState.history = empty ? [] : seedSamples.map((s, i) => historyEntrySchema.parse({
    id: `seed-${i}`,
    createdAt: new Date(now - s.ago * 60_000).toISOString(),
    outcome: s.error ? 'error' : 'completed',
    appName: s.app,
    windowTitle: s.title,
    activationMode: s.mode,
    modelId: defaultSettings.modelId,
    outputText: s.text,
    errorMessage: s.error ?? null,
    audioDurationMs: s.secs * 1000,
    audioBytes: s.secs * 32_000,
    audioMimeType: 'audio/wav',
    submittedContext: s.ctx ? { appName: s.app, windowTitle: s.title, selectedText: 'trecho selecionado no app', permissionsGranted: true, confidence: 'high', capturedAt: new Date(now - s.ago * 60_000).toISOString() } : null,
    usedContext: Boolean(s.ctx),
    latencyMs: 900 + (i * 173) % 1400,
    audioProcessingMs: 60 + (i * 31) % 90,
    audioSendMs: 180 + (i * 47) % 220,
    timeToFirstTokenMs: 500 + (i * 131) % 700,
    timeToCompleteMs: 1400 + (i * 211) % 1900,
    insertionStrategy: s.ctx ? 'replace-selection' : 'insert-at-cursor',
    requestedMode: 'letter-by-letter',
    effectiveMode: i % 4 === 3 ? 'all-at-once' : 'letter-by-letter',
    insertionMethod: i % 4 === 3 ? 'clipboard-all-at-once' : 'enigo-letter',
    fallbackUsed: i % 4 === 3,
  }))
  const patch = { onboardingCompleted: true, apiKeyPresent: true, pendingUpgradeOnboardingVersion: null, language: 'pt-BR' as const }
  Object.assign(dashboardState.settings, patch)
  Object.assign(overlayState.settings, patch)
  dashboardState.permissions = { microphone: 'granted', accessibility: 'granted' }
  dashboardState.appVersion = '0.1.58'
  dashboardState.updateState = { ...dashboardState.updateState, status: 'idle', lastCheckedAt: new Date(now - 30 * 60_000).toISOString() }
}

export const ensureMockDesktopApi = (): void => {
  if (window.ditado) {
    return
  }

  window.ditado = {
    getOverlayState: async () => overlayState,
    getDashboardState: async () => dashboardState,
    subscribeOverlayState: (listener) => {
      overlayListeners.add(listener)
      listener(overlayState)
      return () => overlayListeners.delete(listener)
    },
    subscribeDashboardState: (listener) => {
      dashboardListeners.add(listener)
      listener(dashboardState)
      return () => dashboardListeners.delete(listener)
    },
    subscribeDashboardTabRequests: () => () => undefined,
    startPushToTalk: noopDictation,
    stopPushToTalk: noopDictation,
    toggleDictation: noopDictation,
    cancelDictation: async () => undefined,
    notifyRecorderStarted: async () => undefined,
    notifyRecorderFailed: async () => undefined,
    notifyRecorderReady: async () => undefined,
    notifyRecorderWarmupFinished: async () => undefined,
    updateSettings,
    setApiKey: async () => {
      dashboardState.settings.apiKeyPresent = true
      overlayState.settings.apiKeyPresent = true
      notifyOverlay()
      notifyDashboard()
      return dashboardState.settings
    },
    setHotkeyCaptureActive: async () => undefined,
    getShortcutStatus: async () => ({ captureActive: false, uiohookRunning: true }),
    subscribeHotkeyCapture: () => () => undefined,
    listMicrophones: noopDevices,
    requestMicrophoneAccess: noopPermission,
    getPermissions: noopPermission,
    openDashboardTab: async () => undefined,
    clearHistory: async () => {
      dashboardState.history = []
      notifyDashboard()
    },
    deleteHistoryEntry: async (entryId: string) => {
      dashboardState.history = dashboardState.history.filter((e) => e.id !== entryId)
      notifyDashboard()
    },
    getHistoryAudio: async () => null,
    getTelemetryTail: noopTelemetry,
    checkForUpdates: async () => undefined,
    downloadUpdate: async () => undefined,
    installUpdate: async () => undefined,
    openExternalUrl: async (url: string) => { window.open(url, '_blank') },
    sendAudioLevel: (rms: number) => {
      for (const listener of audioLevelListeners) listener(rms)
    },
    subscribeAudioLevel: (listener) => {
      audioLevelListeners.add(listener)
      return () => audioLevelListeners.delete(listener)
    },
  }

  const params = new URLSearchParams(window.location.search)
  if (params.get('seed') === '1') seedDashboard()
  if (params.get('seed') === 'empty') seedDashboard(true)
  const demo = params.get('demo')
  if (demo === '1' || demo === 'manual') {
    startOverlayDemo(params.get('mode') === 'ptt' ? 'push-to-talk' : 'toggle', demo === 'manual')
  }
}
