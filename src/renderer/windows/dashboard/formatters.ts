import type { HistoryEntry } from '@shared/contracts'

export const formatDate = (value: string | null): string => (value ? new Date(value).toLocaleString() : 'Never')

export const formatAudioDuration = (value: number): string => {
  const totalSeconds = Math.max(Math.round(value / 1000), 0)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const summarizeContext = (entry: HistoryEntry): string => {
  const context = entry.submittedContext
  if (!context) {
    return `App: ${entry.appName}${entry.windowTitle ? ` | Window: ${entry.windowTitle}` : ''}`
  }

  const parts = [
    `App: ${context.appName}`,
    context.windowTitle && `Window: ${context.windowTitle}`,
    context.selectedText && `Selection: ${context.selectedText}`,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' | ') : `App: ${entry.appName}${entry.windowTitle ? ` | Window: ${entry.windowTitle}` : ''}`
}
