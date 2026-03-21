import type {
  ContextSnapshot,
  DictationSession,
  InsertionPlan,
  PermissionState,
  Settings,
  UpdateState,
} from './contracts.js'

export const defaultPushToTalkHotkey = 'Ctrl+Meta'
export const defaultToggleHotkey = ''

export const defaultSettings: Settings = {
  launchOnLogin: true,
  pushToTalkHotkey: defaultPushToTalkHotkey,
  toggleHotkey: defaultToggleHotkey,
  preferredMicrophoneId: null,
  sendContextAutomatically: true,
  telemetryEnabled: true,
  autoUpdateEnabled: true,
  updateChannel: 'stable',
  insertionStreamingMode: 'letter-by-letter',
  historyRetentionDays: 365,
  maxHistoryAudioBytes: 512 * 1024 * 1024,
  modelId: 'google/gemini-3-flash-preview',
  apiKeyPresent: false,
  onboardingCompleted: false,
  theme: 'system',
  language: 'system',
  lastSeenAppVersion: null,
  pendingStartupUpdatedNoticeVersion: null,
  pendingUpgradeOnboardingVersion: null,
}

export const emptyContextSnapshot: ContextSnapshot = {
  appName: 'App',
  windowTitle: null,
  selectedText: '',
  permissionsGranted: false,
  confidence: 'low',
  capturedAt: new Date(0).toISOString(),
}

export const defaultInsertionPlan: InsertionPlan = {
  strategy: 'insert-at-cursor',
  targetApp: 'App',
  capability: 'automation',
}

export const defaultPermissionState: PermissionState = {
  microphone: 'unknown',
  accessibility: 'unknown',
}

export const defaultUpdateState: UpdateState = {
  enabled: true,
  channel: 'stable',
  lastCheckedAt: null,
  status: 'idle',
  downloadProgress: null,
}

export const createIdleSession = (): DictationSession => ({
  id: 'idle',
  activationMode: 'toggle',
  status: 'idle',
  captureIntent: 'none',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  processingStartedAt: null,
  targetApp: 'App',
  context: emptyContextSnapshot,
  partialText: '',
  finalText: '',
  insertionPlan: defaultInsertionPlan,
  errorMessage: null,
  noticeMessage: null,
})
