import { globalShortcut } from 'electron'
import { UiohookKey, uIOhook, type UiohookKeyboardEvent } from 'uiohook-napi'

import { normalizeHotkey } from '../../shared/hotkeys.js'
import type { DictationSessionOrchestrator } from '../services/session/dictationSessionOrchestrator.js'
import type { AppStore } from '../services/store/appStore.js'

type ParsedHotkey = {
  mainKey: number | null
  modifiers: Array<'alt' | 'ctrl' | 'meta' | 'shift'>
}

type ModifierState = Pick<UiohookKeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

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

const hasModifier = (pressedKeys: Set<number>, modifier: ParsedHotkey['modifiers'][number]): boolean =>
  MODIFIER_KEYCODES[modifier].some((keycode) => pressedKeys.has(keycode))

const includesHotkeyKey = (hotkey: ParsedHotkey | null, keycode: number): boolean => {
  if (!hotkey) {
    return false
  }

  if (hotkey.mainKey === keycode) {
    return true
  }

  return hotkey.modifiers.some((modifier) => MODIFIER_KEYCODES[modifier].includes(keycode))
}

const hasModifierFromEvent = (
  event: ModifierState,
  modifier: ParsedHotkey['modifiers'][number],
): boolean => {
  if (modifier === 'alt') {
    return event.altKey
  }
  if (modifier === 'ctrl') {
    return event.ctrlKey
  }
  if (modifier === 'meta') {
    return event.metaKey
  }
  return event.shiftKey
}

const matchesHotkeyFromEvent = (
  event: UiohookKeyboardEvent,
  pressedKeys: Set<number>,
  hotkey: ParsedHotkey | null,
): boolean => {
  if (!hotkey) {
    return false
  }

  if (hotkey.mainKey && !(pressedKeys.has(hotkey.mainKey) || event.keycode === hotkey.mainKey)) {
    return false
  }

  return hotkey.modifiers.every((modifier) => hasModifierFromEvent(event, modifier) || hasModifier(pressedKeys, modifier))
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

export const registerShortcuts = (
  store: AppStore,
  orchestrator: DictationSessionOrchestrator,
  isCaptureSuspended: () => boolean,
): (() => void) => {
  let parsedPushHotkey = parseHotkey(store.getSettings().pushToTalkHotkey)
  let parsedToggleHotkey = parseHotkey(store.getSettings().toggleHotkey)
  let registeredToggleAccelerator: string | null = null
  let registeredPushAccelerator: string | null = null
  let pushActive = false
  let pushStartedAt = 0
  let toggleActive = false
  let lastToggleAt = 0
  const pressedKeys = new Set<number>()

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

    if (isCaptureSuspended()) {
      return
    }

    pressedKeys.add(event.keycode)
    const pushMatches = matchesHotkeyFromEvent(event, pressedKeys, parsedPushHotkey)
    const toggleMatches = matchesHotkeyFromEvent(event, pressedKeys, parsedToggleHotkey)

    if (!pushActive && pushMatches) {
      pushActive = true
      pushStartedAt = Date.now()
      void orchestrator.startCapture('push-to-talk')
    }

    if (!toggleActive && toggleMatches) {
      toggleActive = true
      triggerToggle()
    }
  }

  const keyupHandler = (event: UiohookKeyboardEvent): void => {
    if (process.env.DITADO_DEBUG_SHORTCUTS === '1') {
      console.log('[ditado][shortcut][keyup]', JSON.stringify(event))
    }

    if (isCaptureSuspended()) {
      pressedKeys.clear()
      pushActive = false
      toggleActive = false
      return
    }

    pressedKeys.delete(event.keycode)

    if (
      pushActive &&
      (includesHotkeyKey(parsedPushHotkey, event.keycode) || !matchesHotkeyFromEvent(event, pressedKeys, parsedPushHotkey))
    ) {
      pushActive = false
      const heldForMs = Date.now() - pushStartedAt
      pushStartedAt = 0
      if (heldForMs < SHORT_PUSH_TO_TALK_MS) {
        void orchestrator.showShortPressHint()
        return
      }
      orchestrator.requestStop('push-to-talk')
    }

    if (
      toggleActive &&
      (includesHotkeyKey(parsedToggleHotkey, event.keycode) || !matchesHotkeyFromEvent(event, pressedKeys, parsedToggleHotkey))
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
        pushActive = false
        pushStartedAt = 0
        orchestrator.requestStop('push-to-talk')
        return
      }

      pushActive = true
      pushStartedAt = Date.now()
      await orchestrator.startCapture('push-to-talk')
      const nextSession = orchestrator.getSession()
      if (!nextSession || nextSession.status !== 'listening' || nextSession.activationMode !== 'push-to-talk') {
        pushActive = false
        pushStartedAt = 0
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
    console.error('[ditado][shortcut] failed to start hook', error)
  }
  syncPushRegistration()
  syncToggleRegistration()

  return () => {
    parsedPushHotkey = parseHotkey(store.getSettings().pushToTalkHotkey)
    parsedToggleHotkey = parseHotkey(store.getSettings().toggleHotkey)
    pressedKeys.clear()
    pushActive = false
    pushStartedAt = 0
    toggleActive = false
    syncPushRegistration()
    syncToggleRegistration()
  }
}
