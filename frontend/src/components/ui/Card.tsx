import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  /** Lifts on hover. Opt-in — a static content card shouldn't move under the cursor. */
  interactive?: boolean
}

export default function Card({ className = '', interactive = false, children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'rounded-card border border-line bg-card p-6 shadow-soft transition-shadow duration-200',
        interactive ? 'hover:-translate-y-0.5 hover:shadow-lift' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
