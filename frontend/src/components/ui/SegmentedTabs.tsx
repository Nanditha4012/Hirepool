import { useLayoutEffect, useRef, useState } from 'react'

export interface SegmentedTabOption<T extends string> {
  value: T
  label: string
  /** Small count/qualifier rendered under the label. */
  hint?: string
}

interface SegmentedTabsProps<T extends string> {
  options: SegmentedTabOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Renders light-on-dark, for use inside a PageHero. */
  inverted?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * The store-switcher control — one pill track, with a filled thumb that
 * slides between segments (the Flipkart / Flipkart Minutes pattern at the top
 * of their home page).
 *
 * The thumb is a single absolutely-positioned element measured from the real
 * DOM rather than `width: 100/n %`, because the segments are sized by their
 * own text: "Fresher" and "Experienced" are not the same width, so an evenly
 * divided thumb would sit visibly off-centre on the longer labels.
 *
 * Measured in `useLayoutEffect` so the thumb is in place on the first painted
 * frame — with `useEffect` it visibly jumps in from x=0 on mount. A
 * ResizeObserver re-measures when the container reflows (font load, viewport
 * change, a hint count appearing) so it can't drift out of alignment.
 */
export default function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  inverted = false,
  className = '',
  'aria-label': ariaLabel,
}: SegmentedTabsProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef(new Map<T, HTMLButtonElement>())
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current
      const active = tabRefs.current.get(value)
      if (!track || !active) return
      setThumb({
        left: active.offsetLeft - track.clientLeft,
        width: active.offsetWidth,
      })
    }

    measure()

    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [value, options])

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'relative inline-flex w-full max-w-full gap-1 overflow-x-auto rounded-full p-1 sm:w-auto',
        inverted ? 'border border-white/20 bg-white/10 backdrop-blur-sm' : 'border border-line bg-surface',
        className,
      ].join(' ')}
    >
      {thumb && (
        <span
          aria-hidden="true"
          style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
          className={[
            'absolute left-0 top-1 bottom-1 rounded-full transition-transform duration-300 ease-out',
            inverted ? 'bg-white shadow-soft' : 'bg-primary shadow-lift',
          ].join(' ')}
        />
      )}

      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) tabRefs.current.set(option.value, node)
              else tabRefs.current.delete(option.value)
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={[
              // z-10 lifts the label above the sliding thumb, which is painted
              // in the same stacking context.
              'relative z-10 flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 sm:flex-none sm:px-5',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              inverted
                ? isActive
                  ? 'text-primary focus-visible:ring-white'
                  : 'text-white/75 hover:text-white focus-visible:ring-white'
                : isActive
                  ? 'text-white focus-visible:ring-primary'
                  : 'text-ink/60 hover:text-ink focus-visible:ring-primary',
            ].join(' ')}
          >
            <span className="block">{option.label}</span>
            {option.hint && (
              <span
                className={[
                  'block text-[11px] font-medium',
                  inverted
                    ? isActive
                      ? 'text-primary/70'
                      : 'text-white/50'
                    : isActive
                      ? 'text-white/75'
                      : 'text-ink/40',
                ].join(' ')}
              >
                {option.hint}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
