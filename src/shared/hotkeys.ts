const modifierOrder = ['Ctrl', 'Shift', 'Alt', 'Meta'] as const

type ModifierLabel = (typeof modifierOrder)[number]

type KeyboardLikeEvent = {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const normalizeModifierLabel = (token: string): ModifierLabel | null => {
  const normalized = token.trim().toUpperCase()

  if (normalized === 'CTRL' || normalized === 'CONTROL') {
    return 'Ctrl'
  }

  if (normalized === 'COMMANDORCONTROL') {
    return process.platform === 'darwin' ? 'Meta' : 'Ctrl'
  }

  if (normalized === 'ALT' || normalized === 'OPTION') {
    return 'Alt'
  }

  if (normalized === 'SHIFT') {
    return 'Shift'
  }

  if (normalized === 'META' || normalized === 'CMD' || normalized === 'COMMAND') {
    return 'Meta'
  }

  return null
}

const normalizeMainKey = (token: string): string | null => {
  const normalized = token.trim()
  if (token === ' ') {
    return 'Space'
  }

  if (!normalized) {
    return null
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase()
  }

  const upper = normalized.toUpperCase()
  if (upper === 'SPACE') {
    return 'Space'
  }

  if (/^F([1-9]|1[0-2])$/.test(upper)) {
    return upper
  }

  return normalized[0].toUpperCase() + normalized.slice(1).toLowerCase()
}

export const normalizeHotkey = (value: string): string | null => {
  const tokens = value.split('+').map((token) => token.trim()).filter(Boolean)
  if (!tokens.length) {
    return null
  }

  const modifiers = new Set<ModifierLabel>()
  let mainKey: string | null = null

  for (const token of tokens) {
    const modifier = normalizeModifierLabel(token)
    if (modifier) {
      modifiers.add(modifier)
      continue
    }

    const candidate = normalizeMainKey(token)
    if (!candidate || mainKey) {
      return null
    }
    mainKey = candidate
  }

  if (!modifiers.size && !mainKey) {
    return null
  }

  const orderedModifiers = modifierOrder.filter((modifier) => modifiers.has(modifier))
  return [...orderedModifiers, ...(mainKey ? [mainKey] : [])].join('+')
}

export const isModifierOnlyHotkey = (value: string): boolean => {
  const normalized = normalizeHotkey(value)
  if (!normalized) {
    return false
  }

  return normalized.split('+').every((token) => modifierOrder.includes(token as ModifierLabel))
}

export const isSupportedHotkey = (value: string): boolean => {
  const normalized = normalizeHotkey(value)
  if (!normalized) {
    return false
  }

  return normalized.split('+').some((token) => modifierOrder.includes(token as ModifierLabel))
}

export const hotkeyFromKeyboardEvent = (event: KeyboardLikeEvent): string | null => {
  const modifiers = [
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    event.metaKey ? 'Meta' : null,
  ].filter((value): value is ModifierLabel => Boolean(value))

  const key = normalizeMainKey(event.key)
  const mainKey =
    key && key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta' ? key : null

  if (!modifiers.length && !mainKey) {
    return null
  }

  return normalizeHotkey([...modifiers, ...(mainKey ? [mainKey] : [])].join('+'))
}
