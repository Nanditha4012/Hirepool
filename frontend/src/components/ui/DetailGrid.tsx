import React from 'react'

/**
 * Read-back layout for a saved profile.
 *
 * The pages this replaces rendered a submitted profile as the same stack of
 * `<input>`s used to create it — a form pretending to be a record. These are
 * label/value pairs instead: nothing looks editable until the user actually
 * asks to edit.
 */
export function DetailGrid({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <dl className={['grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2', className].join(' ')}>
      {children}
    </dl>
  )
}

export function Detail({
  label,
  value,
  /** Spans both columns — for long values like a skill list. */
  wide = false,
}: {
  label: string
  value: React.ReactNode
  wide?: boolean
}) {
  // `value` is React content, so a plain falsiness check would also blank out
  // a legitimate 0 (years of experience, team size). Only genuinely absent
  // values fall back to the em dash.
  const isEmpty = value === null || value === undefined || value === ''

  return (
    <div
      className={[
        'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-0',
        wide ? 'sm:col-span-2' : '',
      ].join(' ')}
    >
      <dt className="text-sm text-ink/50">{label}</dt>
      <dd className={['text-right text-sm font-medium', isEmpty ? 'text-ink/30' : 'text-ink'].join(' ')}>
        {isEmpty ? '—' : value}
      </dd>
    </div>
  )
}

/** A titled panel inside a profile card. */
export function DetailSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-line pt-6 first:border-0 first:pt-0">
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink/40">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink/60">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * The pencil control that turns a read-back card into an editable form.
 * Icon-plus-label rather than a bare glyph — an unlabelled pencil is a guess,
 * and this is the only way back into a submitted profile.
 */
export function EditIconButton({
  onClick,
  label = 'Edit',
  className = '',
}: {
  onClick: () => void
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        'inline-flex items-center gap-1.5 rounded-card border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className,
      ].join(' ')}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
      {label}
    </button>
  )
}
