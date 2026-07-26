import React from 'react'

type Tone = 'verified' | 'boost' | 'danger' | 'neutral'

interface BadgeProps {
  tone?: Tone
  children: React.ReactNode
  className?: string
}

const toneClasses: Record<Tone, string> = {
  verified: 'bg-verified/10 text-verified',
  boost: 'bg-boost/10 text-boost',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-surface text-ink/70',
}

export default function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        toneClasses[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
