import clsx from 'clsx'

import type { DictationStatus } from '@shared/contracts'

const labels: Record<DictationStatus, string> = {
  idle: 'Ready',
  arming: 'Arming',
  listening: 'Listening',
  processing: 'Thinking',
  streaming: 'Writing',
  completed: 'Done',
  notice: 'Tip',
  error: 'Error',
  'permission-required': 'Permission required',
}

export const StatusPill = ({ status }: { status: DictationStatus }) => (
  <span
    className={clsx(
      'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em]',
      status === 'arming' && 'border-[rgba(224,198,162,0.22)] bg-[rgba(214,188,147,0.1)] text-[rgba(252,245,234,0.9)]',
      status === 'listening' && 'border-[rgba(224,198,162,0.3)] bg-[rgba(214,188,147,0.14)] text-[rgba(252,245,234,0.96)]',
      status === 'processing' && 'border-[rgba(156,170,128,0.26)] bg-[rgba(156,170,128,0.12)] text-[rgba(237,244,228,0.92)]',
      status === 'streaming' && 'border-[rgba(140,189,132,0.28)] bg-[rgba(140,189,132,0.14)] text-[rgba(237,248,234,0.94)]',
      status === 'completed' && 'border-[rgba(145,189,143,0.24)] bg-[rgba(145,189,143,0.12)] text-[rgba(238,248,236,0.94)]',
      status === 'notice' && 'border-[rgba(213,182,136,0.3)] bg-[rgba(213,182,136,0.12)] text-[rgba(255,245,231,0.94)]',
      status === 'error' && 'border-[rgba(210,125,108,0.3)] bg-[rgba(210,125,108,0.12)] text-[rgba(255,235,232,0.94)]',
      status === 'permission-required' && 'border-[rgba(219,176,98,0.3)] bg-[rgba(219,176,98,0.12)] text-[rgba(255,243,225,0.94)]',
      status === 'idle' && 'border-[rgba(246,236,222,0.12)] bg-[rgba(255,249,240,0.05)] text-[rgba(241,232,220,0.7)]',
    )}
  >
    <span className="size-1.5 rounded-full bg-current" />
    {labels[status]}
  </span>
)
