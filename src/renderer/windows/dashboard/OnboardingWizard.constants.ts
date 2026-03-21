export const TOTAL_STEPS = 10
export const easeOutExpo = [0.16, 1, 0.3, 1] as const

export const demoStatusColor: Partial<Record<string, string>> = {
  listening: 'var(--status-listen)',
  processing: 'var(--status-process)',
  streaming: 'var(--status-write)',
  completed: 'var(--status-ok)',
  error: 'var(--status-error)',
}
