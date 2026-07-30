import React from 'react'

interface PageHeroProps {
  /** Small all-caps kicker above the title, e.g. "Company portal". */
  eyebrow?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Badges, status pills — sits under the subtitle. */
  meta?: React.ReactNode
  /** Buttons / links, right-aligned on wide screens. */
  actions?: React.ReactNode
  /** Stat tiles or tabs rendered in the hero's lower shelf. */
  children?: React.ReactNode
  className?: string
}

/**
 * The standard top-of-page banner for every signed-in surface.
 *
 * Two things drove this. First, the interior pages all opened with a bare
 * `<h1>` on the page background — technically fine, but next to the landing
 * page they read as a form, not a product. Second, and the actual bug: the
 * decorative bands that *did* exist were built from literal white/near-white
 * fills, so in dark mode the top of the page stayed bright while everything
 * below it went slate — the "hero doesn't work at night" problem.
 *
 * This fixes both by construction. The panel is a **dark** brand gradient in
 * both themes with white text on it, so its contrast never depends on which
 * theme is active; there is no `dark:` variant to keep in sync and no
 * theme-dependent surface colour underneath the copy. Only the outer page
 * background around it changes with the theme, which is exactly what should.
 */
export default function PageHero({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  children,
  className = '',
}: PageHeroProps) {
  return (
    <section
      className={[
        'relative isolate overflow-hidden rounded-card bg-gradient-to-br from-primary-dark via-primary to-accent shadow-lift',
        className,
      ].join(' ')}
    >
      {/* Soft light blooms. pointer-events-none so they can never intercept a
          click meant for the buttons layered above them. */}
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />

      <div className="relative px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">{eyebrow}</p>
            )}
            <h1 className="on-photo mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="on-photo mt-2 max-w-2xl text-sm text-white/80">{subtitle}</p>}
            {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>

          {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {children && <div className="mt-7">{children}</div>}
      </div>
    </section>
  )
}

/**
 * A single figure inside a hero's lower shelf. Translucent white on the
 * gradient rather than a `bg-card` tile, for the same reason as above: it
 * must not need a theme-dependent colour to stay legible.
 */
export function HeroStat({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-card border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-white/60">{hint}</p>}
    </div>
  )
}
