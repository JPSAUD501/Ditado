import type { DictationStatus } from '@shared/contracts'

const labels: Record<DictationStatus, string> = {
  idle: 'Idle',
  arming: 'Arming',
  listening: 'Listening',
  processing: 'Thinking',
  streaming: 'Writing',
  completed: 'Done',
  notice: 'Tip',
  error: 'Error',
  'permission-required': 'Permission',
}

export const StatusPill = ({ status }: { status: DictationStatus }) => (
  <span className="status-pill" data-status={status}>
    <span className="status-dot" />
    {labels[status]}
  </span>
)
