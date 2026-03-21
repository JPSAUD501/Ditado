import type { ComponentType } from 'react'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

import type { Settings } from '@shared/contracts'

export const StatusDot = ({ color, pulse }: { color: string; pulse: boolean }) => (
  <motion.div
    style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: color }}
    animate={{
      boxShadow: pulse
        ? [`0 0 0 0px ${color}55`, `0 0 0 5px ${color}00`]
        : `0 0 0 0px ${color}00`,
    }}
    transition={pulse ? { duration: 1.1, repeat: Infinity, ease: 'easeOut' } : { duration: 0.25 }}
  />
)

type ThemeCardProps = {
  value: Settings['theme']
  current: Settings['theme']
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  onChange: (value: Settings['theme']) => void
}

export const ThemeCard = ({
  value,
  current,
  icon: Icon,
  label,
  onChange,
}: ThemeCardProps) => {
  const active = current === value

  return (
    <motion.button
      type="button"
      onClick={() => onChange(value)}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.75rem 0.5rem',
        borderRadius: '0.6rem',
        cursor: 'pointer',
        position: 'relative',
        border: `1px solid ${active ? 'rgba(210,175,110,0.4)' : 'var(--border)'}`,
        background: active ? 'var(--accent-muted)' : 'var(--bg-2)',
        color: active ? 'var(--accent)' : 'var(--text-2)',
        transition: 'border-color 150ms ease, background 150ms ease, color 150ms ease',
      }}
      whileTap={{ scale: 0.95 }}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{label}</span>
      {active && (
        <motion.div
          layoutId="theme-check"
          style={{ position: 'absolute', top: 6, right: 6 }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        >
          <Check size={10} />
        </motion.div>
      )}
    </motion.button>
  )
}
