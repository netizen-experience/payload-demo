import clsx from 'clsx'
import React from 'react'

interface Props {
  className?: string
  loading?: 'lazy' | 'eager'
  priority?: 'auto' | 'high' | 'low'
}

export const Logo = (props: Props) => {
  const { className } = props

  return (
    <div className={clsx('flex flex-col leading-none select-none', className)}>
      <span
        className="text-2xl font-bold tracking-tight"
        style={{ color: 'var(--brand-red, #C41E3A)', fontFamily: 'var(--font-geist-sans)' }}
      >
        松壽司
      </span>
      <span
        className="text-xs tracking-[0.2em] uppercase font-medium"
        style={{ color: 'var(--brand-dark, #1A1A1A)' }}
      >
        Matsu-Sushi
      </span>
    </div>
  )
}
