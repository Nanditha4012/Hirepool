import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export default function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={['rounded-card bg-white shadow-soft p-6', className].join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
