import { globalShortcut } from 'electron'
import { UiohookKey, uIOhook, type UiohookKeyboardEvent } from 'uiohook-napi'

import { normalizeHotkey, type HotkeyCapturePayload } from '../../shared/hotkeys.js'
import type { DictationSessionOrchestrator } from '../services/session/dictationSessionOrchestrator.js'
import type { AppStore } from '../services/store/appStore.js'

type ParsedHotkey = {
  mainKey: number | null
  modifiers: Array<'alt' | 'ctrl' | 'meta' | 'shift'>
}

type ModifierState = Pick<UiohookKeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
type ModifierName = ParsedHotkey['modifiers'][number]

const HOTKEY_MAP: Record<string, number> = {
  SPACE: UiohookKey.Space,
  A: UiohookKey.A,
  B: UiohookKey.B,
  C: UiohookKey.C,
  D: UiohookKey.D,
  E: UiohookKey.E,
  F: UiohookKey.F,
  G: UiohookKey.G,
  H: UiohookKey.H,
  I: UiohookKey.I,
  J: UiohookKey.J,
  K: UiohookKey.K,
  L: UiohookKey.L,
  M: UiohookKey.M,
  N: UiohookKey.N,
  O: UiohookKey.O,
  P: UiohookKey.P,
  Q: UiohookKey.Q,
  R: UiohookKey.R,
  S: UiohookKey.S,
  T: UiohookKey.T,
  U: UiohookKey.U,
  V: UiohookKey.V,
  W: UiohookKey.W,
  X: UiohookKey.X,
  Y: UiohookKey.Y,
  Z: UiohookKey.Z,
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F5: UiohookKey.F5,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  F11: UiohookKey.F11,
  F12: UiohookKey.F12,
}

const HOTKEY_TOKEN_BY_KEYCODE = new Map<number, string>([
  [UiohookKey.Space, 'Space'],
  [UiohookKey.A, 'A'],
  [UiohookKey.B, 'B'],
  [UiohookKey.C, 'C'],
  [UiohookKey.D, 'D'],
  [UiohookKey.E, 'E'],
  [UiohookKey.F, 'F'],
  [UiohookKey.G, 'G'],
  [UiohookKey.H, 'H'],
  [UiohookKey.I, 'I'],
  [UiohookKey.J, 'J'],
  [UiohookKey.K, 'K'],
  [UiohookKey.L, 'L'],
  [UiohookKey.M, 'M'],
  [UiohookKey.N, 'N'],
  [UiohookKey.O, 'O'],
  [UiohookKey.P, 'P'],
  [UiohookKey.Q, 'Q'],
  [UiohookKey.R, 'R'],
  [UiohookKey.S, 'S'],
  [UiohookKey.T, 'T'],
  [UiohookKey.U, 'U'],
  [UiohookKey.V, 'V'],
  [UiohookKey.W, 'W'],
  [UiohookKey.X, 'X'],
  [UiohookKey.Y, 'Y'],
  [UiohookKey.Z, 'Z'],
  [UiohookKey.F1, 'F1'],
  [UiohookKey.F2, 'F2'],
  [UiohookKey.F3, 'F3'],
  [UiohookKey.F4, 'F4'],
  [UiohookKey.F5, 'F5'],
  [UiohookKey.F6, 'F6'],
  [UiohookKey.F7, 'F7'],
  [UiohookKey.F8, 'F8'],
  [UiohookKey.F9, 'F9'],
  [UiohookKey.F10, 'F10'],
  [UiohookKey.F11, 'F11'],
  [UiohookKey.F12, 'F12'],
])

const normalizeModifier = (token: string): ParsedHotkey['modifiers'][number] | null => {
  const normalized = token.toUpperCase()
  if (normalized === 'ALT' || normalized === 'OPTION') {
    return 'alt'
  }
  if (normalized === 'SHIFT') {
    return 'shift'
  }
  if (normalized === 'COMMANDORCONTROL' || normalized === 'CTRL' || normalized === 'CONTROL') {
    return process.platform === 'darwin' ? 'meta' : 'ctrl'
  }
  if (normalized === 'COMMAND' || normalized === 'CMD' || normalized === 'META') {
    return 'meta'
  }
  return null
}

const parseHotkey = (hotkey: string): ParsedHotkey | null => {
  const normalizedHotkey = normalizeHotkey(hotkey)
  if (!normalizedHotkey) {
    return null
  }

  const tokens = normalizedHotkey.split('+').map((token) => token.trim()).filter(Boolean)
  if (!tokens.length) {
    return null
  }

  const normalizedTokens = tokens.map((token) => token.toUpperCase())
  const mainToken = normalizedTokens.at(-1) ?? null
  const hasExplicitMainKey = Boolean(mainToken && HOTKEY_MAP[mainToken])

  const modifiers = normalizedTokens
    .slice(0, hasExplicitMainKey ? -1 : normalizedTokens.length)
    .map(normalizeModifier)
    .filter((token): token is ParsedHotkey['modifiers'][number] => Boolean(token))

  if (!hasExplicitMainKey && modifiers.length !== normalizedTokens.length) {
    return null
  }

  if (process.platform === 'win32' && !hasExplicitMainKey && modifiers.length === 1 && modifiers[0] === 'meta') {
    return null
  }

  return {
    mainKey: hasExplicitMainKey && mainToken ? HOTKEY_MAP[mainToken] : null,
    modifiers,
  }
}

const MODIFIER_KEYCODES: Record<ParsedHotkey['modifiers'][number], number[]> = {
  alt: [UiohookKey.Alt, UiohookKey.AltRight],
  ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  meta: [UiohookKey.Meta, UiohookKey.MetaRight],
  shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
}

const isModifierKeycode = (keycode: number): boolean =>
  Object.values(MODIFIER_KEYCODES).some((keycodes) => keycodes.includes(keycode))

const getModifierFromKeycode = (keycode: number): ModifierName | null => {
  if (MODIFIER_KEYCODES.alt.includes(keycode)) {
    return 'alt'
  }
  if (MODIFIER_KEYCODES.ctrl.includes(keycode)) {
    return 'ctrl'
  }
  if (MODIFIER_KEYCODES.meta.includes(keycode)) {
    return 'meta'
  }
  if (MODIFIER_KEYCODES.shift.includes(keycode)) {
    return 'shift'
  }
  return null
}

const createModifierState = (): ModifierState => ({
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
})

const hasModifier = (modifierState: ModifierState, modifier: ModifierName): boolean => {
  if (modifier === 'alt') {
    return modifierState.altKey
  }
  if (modifier === 'ctrl') {
    return modifierState.ctrlKey
  }
  if (modifier === 'meta') {
    return modifierState.metaKey
  }
  return modifierState.shiftKey
}

const includesHotkeyKey = (hotkey: ParsedHotkey | null, keycode: number): boolean => {
  if (!hotkey) {
    return false
  }

  if (hotkey.mainKey === keycode) {
    return true
  }

  return hotkey.modifiers.some((modifier) => MODIFIER_KEYCODES[modifier].includes(keycode))
}

const matchesHotkeyFromEvent = (
  modifierState: ModifierState,
  activeMainKeys: Set<number>,
  hotkey: ParsedHotkey | null,
): boolean => {
  if (!hotkey) {
    return false
  }

  if (hotkey.mainKey && !activeMainKeys.has(hotkey.mainKey)) {
    return false
  }

  return hotkey.modifiers.every((modifier) => hasModifier(modifierState, modifier))
}

const toAccelerator = (hotkey: string): string | null => {
  const parsed = parseHotkey(hotkey)
  if (!parsed?.mainKey) {
    return null
  }

  const normalized = normalizeHotkey(hotkey)
  if (!normalized) {
    return null
  }

  const tokens = normalized.split('+').map((token) => {
    if (token === 'Ctrl') {
      return 'CommandOrControl'
    }
    if (token === 'Meta') {
      return process.platform === 'darwin' ? 'Command' : 'Super'
    }
    return token
  })

  return tokens.join('+')
}

const SHORT_PUSH_TO_TALK_MS = 500
const DOUBLE_TAP_WINDOW_MS = 600
const PUSH_TO_TALK_START_DELAY_MS = 180
const META_STALE_RECOVERY_MS = 350
const META_ALONE_UNSUPPORTED_ON_WINDOWS = process.platform === 'win32'

export const registerShortcuts = (
  store: AppStore,
  orchestrator: DictationSessionOrchestrator,
  isCaptureSuspended: () => boolean,
  onHookStatus?: (running: boolean) => void,
  isHotkeyCaptureActive: () => boolean = () => false,
  onHotkeyCapture?: (payload: HotkeyCapturePayload) => void,
): (() => void) => {
  let parsedPushHotkey = parseHotkey(store.getSettings().pushToTalkHotkey)
  let parsedToggleHotkey = parseHotkey(store.getSettings().toggleHotkey)
  let registeredToggleAccelerator: string | null = null
  let registeredPushAccelerator: string | null = null
  let pushActive = false
  let pushStartedAt = 0
  let pushCaptureStarted = false
  let toggleActive = false
  let lastToggleAt = 0
  let lastShortPressAt = 0
  let pendingPushStartTimeout: ReturnType<typeof setTimeout> | null = null
  let pendingShortPressHintTimeout: ReturnType<typeof setTimeout> | null = null
  const activeMainKeys = new Set<number>()
  let modifierState = createModifierState()
  let capturePendingHotkey: string | null = null
  let captureHasUnsupportedKey = false
  let metaRecoveryTimeout: ReturnType<typeof setTimeout> | null = null

  const clearPendingPushStart = (): void => {
    if (pendingPushStartTimeout != null) {
      clearTimeout(pendingPushStartTimeout)
      pendingPushStartTimeout = null
    }
  }

  const clearPendingShortPressHint = (): void => {
    if (pendingShortPressHintTimeout != null) {
      clearTimeout(pendingShortPressHintTimeout)
      pendingShortPressHintTimeout = null
    }
  }

  const clearMetaRecoveryTimeout = (): void => {
    if (metaRecoveryTimeout != null) {
      clearTimeout(metaRecoveryTimeout)
      metaRecoveryTimeout = null
    }
  }

  const emitHotkeyCapture = (payload: HotkeyCapturePayload): void => {
    onHotkeyCapture?.(payload)
  }

  const resetKeyState = (): void => {
    activeMainKeys.clear()
    modifierState = createModifierState()
    clearMetaRecoveryTimeout()
  }

  const resetHotkeyCaptureState = (phase: 'cancel' | null = null): void => {
    resetKeyState()
    capturePendingHotkey = null
    captureHasUnsupportedKey = false
    if (phase) {
      emitHotkeyCapture({ phase, hotkey: null })
    }
  }

  const buildCapturedHotkey = (activeModifiers: ModifierState, activeKeys: Set<number>): string | null => {
    const tokens = [
      hasModifier(activeModifiers, 'ctrl') ? 'Ctrl' : null,
      hasModifier(activeModifiers, 'shift') ? 'Shift' : null,
      hasModifier(activeModifiers, 'alt') ? 'Alt' : null,
      hasModifier(activeModifiers, 'meta') ? 'Meta' : null,
    ].filter((token): token is string => Boolean(token))

    const mainKey = [...activeKeys]
      .find((keycode) => !isModifierKeycode(keycode) && HOTKEY_TOKEN_BY_KEYCODE.has(keycode))

    if (mainKey) {
      tokens.push(HOTKEY_TOKEN_BY_KEYCODE.get(mainKey) ?? '')
    }

    return normalizeHotkey(tokens.join('+'))
  }

  const syncKeyStateFromEvent = (event: UiohookKeyboardEvent, phase: 'keydown' | 'keyup'): void => {
    modifierState = {
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    }

    const modifier = getModifierFromKeycode(event.keycode)
    if (modifier === 'alt') {
      modifierState.altKey = phase === 'keydown'
    } else if (modifier === 'ctrl') {
      modifierState.ctrlKey = phase === 'keydown'
    } else if (modifier === 'meta') {
      modifierState.metaKey = phase === 'keydown'
    } else if (modifier === 'shift') {
      modifierState.shiftKey = phase === 'keydown'
    } else if (phase === 'keydown') {
      activeMainKeys.add(event.keycode)
    } else {
      activeMainKeys.delete(event.keycode)
    }
  }

  const hasOnlyMetaPressed = (): boolean =>
    modifierState.metaKey
    && !modifierState.ctrlKey
    && !modifierState.altKey
    && !modifierState.shiftKey
    && activeMainKeys.size === 0

  const syncMetaRecovery = (): void => {
    if (!META_ALONE_UNSUPPORTED_ON_WINDOWS) {
      return
    }

    if (!hasOnlyMetaPressed()) {
      clearMetaRecoveryTimeout()
      return
    }

    if (metaRecoveryTimeout != null) {
      return
    }

    metaRecoveryTimeout = setTimeout(() => {
      metaRecoveryTimeout = null
      if (!hasOnlyMetaPressed()) {
        return
      }

      if (isHotkeyCaptureActive()) {
        resetHotkeyCaptureState('cancel')
        return
      }

      resetKeyState()
      pushActive = false
      toggleActive = false
      clearPendingPushStart()
    }, META_STALE_RECOVERY_MS)
  }

  const handleCaptureKeydown = (event: UiohookKeyboardEvent): void => {
    if (event.keycode === UiohookKey.Escape) {
      resetHotkeyCaptureState('cancel')
      return
    }

    syncKeyStateFromEvent(event, 'keydown')
    syncMetaRecovery()

    if (!isModifierKeycode(event.keycode) && !HOTKEY_TOKEN_BY_KEYCODE.has(event.keycode)) {
      captureHasUnsupportedKey = true
      capturePendingHotkey = null
      emitHotkeyCapture({ phase: 'preview', hotkey: null })
      return
    }

    if (captureHasUnsupportedKey) {
      return
    }

    const nextHotkey = buildCapturedHotkey(modifierState, activeMainKeys)
    if (!nextHotkey) {
      return
    }

    if (META_ALONE_UNSUPPORTED_ON_WINDOWS && nextHotkey === 'Meta') {
      capturePendingHotkey = null
      emitHotkeyCapture({ phase: 'preview', hotkey: nextHotkey })
      return
    }

    capturePendingHotkey = nextHotkey
    emitHotkeyCapture({ phase: 'preview', hotkey: nextHotkey })
  }

  const handleCaptureKeyup = (event: UiohookKeyboardEvent): void => {
    if (event.keycode === UiohookKey.Escape) {
      resetHotkeyCaptureState('cancel')
      return
    }

    syncKeyStateFromEvent(event, 'keyup')
    syncMetaRecovery()

    if (
      activeMainKeys.size > 0
      || modifierState.altKey
      || modifierState.ctrlKey
      || modifierState.metaKey
      || modifierState.shiftKey
    ) {
      return
    }

    if (
      capturePendingHotkey
      && !captureHasUnsupportedKey
      && !(META_ALONE_UNSUPPORTED_ON_WINDOWS && capturePendingHotkey === 'Meta')
    ) {
      emitHotkeyCapture({ phase: 'commit', hotkey: capturePendingHotkey })
    } else {
      emitHotkeyCapture({ phase: 'cancel', hotkey: null })
    }

    resetHotkeyCaptureState()
  }

  const resetPushState = (): void => {
    pushActive = false
    pushStartedAt = 0
    pushCaptureStarted = false
    clearPendingPushStart()
  }

  const triggerToggle = (): void => {
    const now = Date.now()
    if (now - lastToggleAt < 180) {
      return
    }

    lastToggleAt = now
    void orchestrator.toggleCapture()
  }

  const keydownHandler = (event: UiohookKeyboardEvent): void => {
    if (process.env.DITADO_DEBUG_SHORTCUTS === '1') {
      console.log('[ditado][shortcut][keydown]', JSON.stringify(event))
    }

    if (isHotkeyCaptureActive()) {
      handleCaptureKeydown(event)
      return
    }

    if (isCaptureSuspended()) {
      return
    }

    if (event.keycode === UiohookKey.Escape) {
      resetKeyState()
      resetPushState()
      clearPendingShortPressHint()
      void orchestrator.cancel()
      return
    }

    syncKeyStateFromEvent(event, 'keydown')
    syncMetaRecovery()
    const pushMatches = matchesHotkeyFromEvent(modifierState, activeMainKeys, parsedPushHotkey)
    const toggleMatches = matchesHotkeyFromEvent(modifierState, activeMainKeys, parsedToggleHotkey)
    const shouldStartPushFromHook = !parsedPushHotkey?.mainKey || !registeredPushAccelerator
    const shouldToggleFromHook = !parsedToggleHotkey?.mainKey || !registeredToggleAccelerator

    if (shouldStartPushFromHook && !pushActive && pushMatches) {
      pushActive = true
      pushStartedAt = Date.now()
      // If toggle is currently active, a keydown means the user wants to stop it —
      // don't start a new PTT capture (handled in keyup).
      // If we're in the double-tap window, also defer capture to avoid the pttStart
      // sound + cancel overhead when the double-tap is confirmed on keyup.
      const currentSession = orchestrator.getSession()
      const toggleIsActive = currentSession?.activationMode === 'toggle'
        && ['arming', 'listening'].includes(currentSession.status)
      const inDoubleTapWindow = lastShortPressAt > 0
        && (Date.now() - lastShortPressAt < DOUBLE_TAP_WINDOW_MS)
      if (!toggleIsActive && !inDoubleTapWindow) {
        clearPendingShortPressHint()
        pendingPushStartTimeout = setTimeout(() => {
          pendingPushStartTimeout = null
          if (!pushActive || isCaptureSuspended()) {
            return
          }
          pushCaptureStarted = true
          void orchestrator.startCapture('push-to-talk')
        }, PUSH_TO_TALK_START_DELAY_MS)
      } else {
        pushCaptureStarted = false
      }
    }

    if (shouldToggleFromHook && !toggleActive && toggleMatches) {
      toggleActive = true
      triggerToggle()
    }

  }

  const keyupHandler = (event: UiohookKeyboardEvent): void => {
    if (process.env.DITADO_DEBUG_SHORTCUTS === '1') {
      console.log('[ditado][shortcut][keyup]', JSON.stringify(event))
    }

    if (isHotkeyCaptureActive()) {
      handleCaptureKeyup(event)
      return
    }

    if (isCaptureSuspended()) {
      resetHotkeyCaptureState()
      resetPushState()
      clearPendingShortPressHint()
      return
    }

    syncKeyStateFromEvent(event, 'keyup')
    syncMetaRecovery()

    if (
      pushActive &&
      (includesHotkeyKey(parsedPushHotkey, event.keycode) || !matchesHotkeyFromEvent(modifierState, activeMainKeys, parsedPushHotkey))
    ) {
      pushActive = false
      const heldForMs = Date.now() - pushStartedAt
      pushStartedAt = 0
      const didStartCapture = pushCaptureStarted
      pushCaptureStarted = false
      clearPendingPushStart()

      if (heldForMs < SHORT_PUSH_TO_TALK_MS) {
        const now = Date.now()

        // If we didn't start a capture, check if we were stopping an active toggle session
        if (!didStartCapture) {
          const currentSession = orchestrator.getSession()
          const toggleWasActive = currentSession?.activationMode === 'toggle'
            && ['arming', 'listening', 'processing'].includes(currentSession.status)
          if (toggleWasActive) {
            // Single tap while toggle active → stop it
            orchestrator.requestStop('toggle')
            return
          }
        }

        if (now - lastShortPressAt < DOUBLE_TAP_WINDOW_MS) {
          // Double-tap detected → activate hands-free toggle mode
          // No capture was started for this tap, so directly trigger toggle
          lastShortPressAt = 0
          clearPendingShortPressHint()
          if (didStartCapture) {
            // Rare: capture was started (window expired between keydown and keyup)
            void (async () => { await orchestrator.cancel(); triggerToggle() })()
          } else {
            triggerToggle()
          }
        } else {
          // First short tap — record time and only surface the hint if a
          // second tap never arrives inside the double-tap window.
          lastShortPressAt = now
          clearPendingShortPressHint()
          pendingShortPressHintTimeout = setTimeout(() => {
            pendingShortPressHintTimeout = null
            if (lastShortPressAt !== now) {
              return
            }
            lastShortPressAt = 0
            void orchestrator.showShortPressHint()
          }, DOUBLE_TAP_WINDOW_MS)
        }
        return
      }
      // Long press
      lastShortPressAt = 0
      clearPendingShortPressHint()
      if (didStartCapture) {
        orchestrator.requestStop('push-to-talk')
      } else {
        // Was in double-tap window or stopping toggle at keydown, but held long — start+stop now
        void orchestrator.startCapture('push-to-talk').then(() => orchestrator.requestStop('push-to-talk'))
      }
    }

    if (
      toggleActive &&
      (includesHotkeyKey(parsedToggleHotkey, event.keycode) || !matchesHotkeyFromEvent(modifierState, activeMainKeys, parsedToggleHotkey))
    ) {
      toggleActive = false
    }

  }

  const syncPushRegistration = (): void => {
    const nextPushAccelerator = toAccelerator(store.getSettings().pushToTalkHotkey)

    if (registeredPushAccelerator && registeredPushAccelerator !== nextPushAccelerator) {
      globalShortcut.unregister(registeredPushAccelerator)
      registeredPushAccelerator = null
    }

    if (!nextPushAccelerator || nextPushAccelerator === registeredPushAccelerator) {
      return
    }

    const registered = globalShortcut.register(nextPushAccelerator, async () => {
      if (isCaptureSuspended()) {
        return
      }

      const session = orchestrator.getSession()
      const hasActivePushSession =
        session?.status === 'listening' && session.activationMode === 'push-to-talk'

      if (pushActive || hasActivePushSession) {
        resetPushState()
        orchestrator.requestStop('push-to-talk')
        return
      }

      pushActive = true
      pushStartedAt = Date.now()
      pushCaptureStarted = true
      clearPendingPushStart()
      await orchestrator.startCapture('push-to-talk')
      const nextSession = orchestrator.getSession()
      if (!nextSession || nextSession.status !== 'listening' || nextSession.activationMode !== 'push-to-talk') {
        resetPushState()
      }
    })

    if (!registered) {
      console.error('[ditado][shortcut] failed to register push accelerator', nextPushAccelerator)
      return
    }

    registeredPushAccelerator = nextPushAccelerator
  }

  const syncToggleRegistration = (): void => {
    const nextToggleAccelerator = toAccelerator(store.getSettings().toggleHotkey)

    if (registeredToggleAccelerator && registeredToggleAccelerator !== nextToggleAccelerator) {
      globalShortcut.unregister(registeredToggleAccelerator)
      registeredToggleAccelerator = null
    }

    if (!nextToggleAccelerator || nextToggleAccelerator === registeredToggleAccelerator) {
      return
    }

    const registered = globalShortcut.register(nextToggleAccelerator, () => {
      if (isCaptureSuspended()) {
        return
      }

      triggerToggle()
    })

    if (!registered) {
      console.error('[ditado][shortcut] failed to register toggle accelerator', nextToggleAccelerator)
      return
    }

    registeredToggleAccelerator = nextToggleAccelerator
  }

  uIOhook.on('keydown', keydownHandler)
  uIOhook.on('keyup', keyupHandler)

  try {
    uIOhook.start()
    onHookStatus?.(true)
    if (process.env.DITADO_DEBUG_SHORTCUTS === '1') {
      console.log('[ditado][shortcut] hook started')
      console.log(
        '[ditado][shortcut] configured',
        JSON.stringify({
          pushToTalkHotkey: store.getSettings().pushToTalkHotkey,
          toggleHotkey: store.getSettings().toggleHotkey,
        }),
      )
    }
  } catch (error) {
    onHookStatus?.(false)
    console.error('[ditado][shortcut] failed to start hook', error)
  }
  syncPushRegistration()
  syncToggleRegistration()

  return () => {
    parsedPushHotkey = parseHotkey(store.getSettings().pushToTalkHotkey)
    parsedToggleHotkey = parseHotkey(store.getSettings().toggleHotkey)
    resetHotkeyCaptureState()
    lastShortPressAt = 0
    resetPushState()
    toggleActive = false
    clearPendingShortPressHint()
    syncPushRegistration()
    syncToggleRegistration()
  }
}
