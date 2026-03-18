export const uiSoundNames = [
  'pttStart',
  'pttEnd',
  'pttTooShort',
  'tttStart',
  'tttEnd',
  'success',
  'error',
] as const

export type UiSoundName = (typeof uiSoundNames)[number]

export const uiSoundFiles: Record<UiSoundName, string> = {
  pttStart: 'ptt_start.wav',
  pttEnd: 'ptt_end.wav',
  pttTooShort: 'ptt_too_short.wav',
  tttStart: 'ttt_start.wav',
  tttEnd: 'ttt_end.wav',
  success: 'success.wav',
  error: 'error.wav',
}

export const uiSoundCooldownMs: Record<UiSoundName, number> = {
  pttStart: 80,
  pttEnd: 110,
  pttTooShort: 180,
  tttStart: 140,
  tttEnd: 160,
  success: 220,
  error: 220,
}

export const resolveUiSoundAssetUrl = (name: UiSoundName, baseUrl = window.location.href): string =>
  new URL(`audio/ui/${uiSoundFiles[name]}`, baseUrl).toString()
