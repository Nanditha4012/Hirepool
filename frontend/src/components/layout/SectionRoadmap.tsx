import { useEffect, useState } from 'react'

export interface RoadmapStep {
  title: string
  detail: string
  icon: string
}

interface SectionRoadmapProps {
  title?: string
  steps: RoadmapStep[]
  /**
   * Which step the current tab corresponds to, if any. Highlighted rather
   * than treated as progress — this is a map of how the section works, not a
   * checklist the reader is partway through.
   */
  activeIndex?: number
  className?: string
}

/**
 * "How this section works", as an animated vertical roadmap in the left rail.
 *
 * Every tabbed screen in the app opened the same way: a banner, a row of tabs,
 * then a wall of rows. Nothing on any of them said what the section was *for*
 * or what you were expected to do with it — a candidate landing on the Walk-in
 * Pedia for the first time got a filter bar and a list of company names.
 *
 * The steps draw themselves in on mount (a staggered fade down the line, with
 * the connecting rule growing between them), so the rail reads as a path
 * rather than as another static list beside the real one. It is decorative in
 * the sense that nothing here is a control — but it is the only place that
 * explains the section, so it is not filler.
 *
 * Respects `prefers-reduced-motion` through the motion-reduce variants: the
 * same content, arriving at once instead of in sequence.
 */
export default function SectionRoadmap({
  title = 'How it works',
  steps,
  activeIndex,
  className = '',
}: SectionRoadmapProps) {
  // Drives the draw-in. Kept in state rather than done purely in CSS so the
  // animation replays when the caller swaps the step list for another tab's.
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    setDrawn(false)
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [steps])

  return (
    <div className={['rounded-card border border-line bg-card p-5 shadow-soft', className].join(' ')}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/40">{title}</p>

      <ol className="mt-4">
        {steps.map((step, index) => {
          const isActive = index === activeIndex
          const isLast = index === steps.length - 1

          return (
            <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
              {/* Rail + node */}
              <div className="flex flex-col items-center">
                <span
                  style={{ transitionDelay: `${index * 110}ms` }}
                  className={[
                    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base transition-all duration-500',
                    'motion-reduce:transition-none',
                    drawn ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
                    isActive
                      ? 'bg-primary text-white shadow-lift ring-4 ring-primary/15'
                      : 'bg-surface text-ink/60',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {step.icon}
                </span>

                {!isLast && (
                  <span className="relative mt-1 w-0.5 flex-1 overflow-hidden rounded-full bg-line">
                    {/* Grows downward as the step above lands, which is what
                        makes the list read as a single connected path. */}
                    <span
                      style={{ transitionDelay: `${index * 110 + 220}ms` }}
                      className={[
                        'absolute inset-x-0 top-0 rounded-full bg-primary/40 transition-[height] duration-500 ease-out',
                        'motion-reduce:transition-none',
                        drawn ? 'h-full' : 'h-0',
                      ].join(' ')}
                    />
                  </span>
                )}
              </div>

              <div
                style={{ transitionDelay: `${index * 110 + 60}ms` }}
                className={[
                  'min-w-0 pt-1 transition-all duration-500 motion-reduce:transition-none',
                  drawn ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                ].join(' ')}
              >
                <p
                  className={[
                    'text-sm font-semibold',
                    isActive ? 'text-primary' : 'text-ink',
                  ].join(' ')}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/50">{step.detail}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
