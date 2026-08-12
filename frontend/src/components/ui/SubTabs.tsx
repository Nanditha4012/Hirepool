export interface SubTabOption<T extends string> {
  value: T
  label: string
  /** Count shown in the pill beside the label. Omit to hide it. */
  count?: number
  /** Small dot colour, for options that carry a status meaning. */
  tone?: 'primary' | 'verified' | 'boost' | 'danger' | 'neutral'
}

interface SubTabsProps<T extends string> {
  options: SubTabOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  'aria-label'?: string
}

const toneDot: Record<NonNullable<SubTabOption<string>['tone']>, string> = {
  primary: 'bg-primary',
  verified: 'bg-verified',
  boost: 'bg-boost',
  danger: 'bg-danger',
  neutral: 'bg-ink/30',
}

/**
 * The second level of tabs, on screens that have two.
 *
 * Contests has contest type over difficulty; the Walk-in Pedia has the board
 * over when a drive is happening. Both levels were drawn with SegmentedTabs —
 * the same pill track, the same sliding thumb, the same weight — so the two
 * rows read as one confused control and it was genuinely unclear which one
 * you had just clicked.
 *
 * This is deliberately a different object rather than a smaller copy of the
 * first level: an underlined row of labels with a count pill, no enclosing
 * track and no sliding thumb. Where SegmentedTabs says "these are different
 * places", this says "this is the same place, filtered" — which is what a
 * second level actually means on both screens.
 *
 * The count is the reason the labels are not just links: "Today 3" and
 * "Upcoming 14" tell you where to click before you click, and the old stacked
 * sections buried that below the fold.
 */
export default function SubTabs<T extends string>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: SubTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'flex w-full items-stretch gap-1 overflow-x-auto border-b border-line',
        className,
      ].join(' ')}
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={[
              'group relative flex flex-shrink-0 items-center gap-2 whitespace-nowrap px-3 pb-2.5 pt-1.5 text-sm font-semibold transition-colors sm:px-4',
              'focus:outline-none focus-visible:rounded-card focus-visible:ring-2 focus-visible:ring-primary',
              isActive ? 'text-ink' : 'text-ink/45 hover:text-ink/75',
            ].join(' ')}
          >
            {option.tone && (
              <span
                className={[
                  'h-1.5 w-1.5 flex-shrink-0 rounded-full transition-opacity',
                  toneDot[option.tone],
                  isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-70',
                ].join(' ')}
                aria-hidden="true"
              />
            )}

            {option.label}

            {option.count !== undefined && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'bg-surface text-ink/40',
                ].join(' ')}
              >
                {option.count}
              </span>
            )}

            {/* The underline. scale-x rather than width so it grows from the
                centre without re-laying out the row. */}
            <span
              aria-hidden="true"
              className={[
                'absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-transform duration-300 ease-out',
                isActive ? 'scale-x-100' : 'scale-x-0',
              ].join(' ')}
            />
          </button>
        )
      })}
    </div>
  )
}
