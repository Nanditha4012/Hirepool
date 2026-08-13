import React, { useId, useState } from 'react'

/**
 * A foldable, self-scoring section of a long form.
 *
 * The profile builder used to be one unbroken column of cards: every field of
 * every category on screen at once, no sense of where you were in it, and the
 * only way to find the one thing you came back to change was to scroll past
 * everything you had already done. This is the unit that replaces it — one
 * per section, collapsed by default once it is complete, carrying its own
 * "how much of this is left" so the answer is visible without opening it.
 *
 * Three things it does that a plain `<details>` does not:
 *
 *   - Scores itself. `done`/`total` drive a ring in the header, so a folded
 *     section still says whether it needs attention.
 *   - Colours itself. Each section owns an accent, so the six of them read as
 *     six places rather than six identical boxes — which is what makes
 *     scanning back to "Education" a glance instead of a search.
 *   - Animates open honestly. `grid-template-rows: 0fr → 1fr` transitions to
 *     the content's real height with no measuring, no ResizeObserver, and no
 *     max-height guess that clips a section once it grows past it.
 */

export type SectionAccent = 'primary' | 'accent' | 'verified' | 'boost' | 'danger'

interface AccentTokens {
  /** Header wash behind the title row. */
  wash: string
  /** Icon chip. */
  chip: string
  text: string
  ring: string
  border: string
}

/**
 * Written out per accent rather than interpolated (`bg-${accent}/10`):
 * Tailwind scans source text for complete class names, so a constructed
 * string produces no CSS at all and the section renders unstyled.
 */
const ACCENTS: Record<SectionAccent, AccentTokens> = {
  primary: {
    wash: 'from-primary/10 to-transparent',
    chip: 'bg-primary/12 text-primary',
    text: 'text-primary',
    ring: 'stroke-primary',
    border: 'border-primary/30',
  },
  accent: {
    wash: 'from-accent/10 to-transparent',
    chip: 'bg-accent/12 text-accent',
    text: 'text-accent',
    ring: 'stroke-accent',
    border: 'border-accent/30',
  },
  verified: {
    wash: 'from-verified/10 to-transparent',
    chip: 'bg-verified/12 text-verified',
    text: 'text-verified',
    ring: 'stroke-verified',
    border: 'border-verified/30',
  },
  boost: {
    wash: 'from-boost/10 to-transparent',
    chip: 'bg-boost/12 text-boost',
    text: 'text-boost',
    ring: 'stroke-boost',
    border: 'border-boost/30',
  },
  danger: {
    wash: 'from-danger/10 to-transparent',
    chip: 'bg-danger/12 text-danger',
    text: 'text-danger',
    ring: 'stroke-danger',
    border: 'border-danger/30',
  },
}

interface SectionCardProps {
  /** Shown in the icon chip. An emoji or a single glyph. */
  icon: string
  title: string
  /** One line under the title, visible whether open or folded. */
  subtitle?: string
  accent?: SectionAccent
  /** Position in the sequence, e.g. 2 of 6. Purely for orientation. */
  step?: number
  stepCount?: number
  /** Requirements met, out of requirements that exist. Drives the ring. */
  done?: number
  total?: number
  /**
   * Whether the section starts open. Sections a candidate has finished
   * default closed and unfinished ones default open, which is what turns a
   * returning visit into "here are the two things left" rather than a wall.
   */
  defaultOpen?: boolean
  /** Rendered in the header, right of the score. Stops click propagation. */
  headerAside?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function SectionCard({
  icon,
  title,
  subtitle,
  accent = 'primary',
  step,
  stepCount,
  done,
  total,
  defaultOpen,
  headerAside,
  children,
  className = '',
}: SectionCardProps) {
  const tokens = ACCENTS[accent]
  const hasScore = typeof done === 'number' && typeof total === 'number' && total > 0
  const complete = hasScore && done >= total

  // Uncontrolled: which sections a candidate has open is a transient reading
  // position, not state any parent needs. `defaultOpen` falling back to
  // "open unless already complete" is the behaviour described above.
  const [open, setOpen] = useState(defaultOpen ?? !complete)
  const contentId = useId()

  return (
    <section
      className={[
        'group overflow-hidden rounded-card border bg-card shadow-soft transition-all duration-300',
        open ? `${tokens.border} shadow-lift` : 'border-line hover:border-line hover:shadow-lift',
        className,
      ].join(' ')}
    >
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={contentId}
          className={[
            'relative flex w-full items-center gap-4 bg-gradient-to-r px-5 py-4 text-left transition-colors sm:px-6',
            tokens.wash,
          ].join(' ')}
        >
          {/* Decorative wash, matched to the accent. Pointer-events-none so it
              never eats the click that opens the section. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-current opacity-[0.06] blur-2xl"
          />

          <span
            aria-hidden="true"
            className={[
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-xl transition-transform duration-300 group-hover:scale-105',
              tokens.chip,
            ].join(' ')}
          >
            {icon}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {typeof step === 'number' && (
                <span className={['text-xs font-black tracking-wider', tokens.text].join(' ')}>
                  {String(step).padStart(2, '0')}
                  {typeof stepCount === 'number' && (
                    <span className="text-ink/30"> / {String(stepCount).padStart(2, '0')}</span>
                  )}
                </span>
              )}
              <span className="truncate text-base font-semibold text-ink sm:text-lg">{title}</span>
              {complete && (
                <span className="inline-flex items-center gap-1 rounded-full bg-verified/12 px-2 py-0.5 text-xs font-semibold text-verified">
                  <span aria-hidden="true">✓</span> Done
                </span>
              )}
            </span>
            {subtitle && <span className="mt-0.5 block truncate text-sm text-ink/55">{subtitle}</span>}
          </span>

          {headerAside && (
            // The aside frequently holds a button of its own (an "Add" action).
            // Swallowing the click here stops that button from also folding
            // the section it is trying to add to.
            <span
              className="hidden shrink-0 sm:block"
              onClick={(e) => e.stopPropagation()}
              role="presentation"
            >
              {headerAside}
            </span>
          )}

          {hasScore && !complete && <ProgressRing done={done} total={total} ringClass={tokens.ring} />}

          <span
            aria-hidden="true"
            className={[
              'shrink-0 text-ink/40 transition-transform duration-300 motion-reduce:transition-none',
              open ? 'rotate-180' : '',
            ].join(' ')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 7.5 10 12.5 15 7.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      </h2>

      {/* 0fr → 1fr on a grid row is the one way to transition to `auto`
          height. The inner div must own `overflow-hidden` for it to clip
          while the row collapses. `invisible` when closed keeps the folded
          content out of the tab order without `display: none`, which would
          kill the transition outright. */}
      <div
        id={contentId}
        className={[
          'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
      >
        <div className={['overflow-hidden', open ? '' : 'invisible'].join(' ')}>
          <div className="border-t border-line px-5 py-5 sm:px-6">{children}</div>
        </div>
      </div>
    </section>
  )
}

/**
 * The folded-state score: a ring that fills as the section is completed.
 *
 * A ring rather than "2/3" alone because the number is the detail and the
 * shape is the glance — six of these down a page tell you where the gaps are
 * without reading any of them. The count sits inside it for when you do read.
 */
function ProgressRing({
  done,
  total,
  ringClass,
}: {
  done: number
  total: number
  ringClass: string
}) {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const ratio = Math.max(0, Math.min(1, done / total))

  return (
    <span
      className="relative hidden shrink-0 sm:inline-flex"
      title={`${done} of ${total} complete`}
    >
      <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
        <circle cx="19" cy="19" r={radius} fill="none" strokeWidth="3" className="stroke-line" />
        <circle
          cx="19"
          cy="19"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={['transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none', ringClass].join(' ')}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink/60">
        {done}/{total}
      </span>
    </span>
  )
}
