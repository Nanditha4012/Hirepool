import { useEffect, useRef, useState } from 'react'

export interface FormRequirement {
  /** Stable identity for the row. */
  key: string
  label: string
  /** Recomputed on every keystroke by the owning form. */
  done: boolean
  /** What "done" means, for anything not obvious from the label. */
  hint?: string
}

interface FormProgressProps {
  requirements: FormRequirement[]
  /** Heading above the ring. */
  title?: string
  /** Shown once every requirement is met. */
  completeMessage?: string
  className?: string
}

const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * A live readiness meter for a long form: a ring, a count, and the list of
 * what is still outstanding.
 *
 * The problem it solves is that the profile builder is a wall of ~15 inputs
 * spread over four cards, and until you pressed Submit nothing on screen knew
 * or said whether you were finished. The only feedback was a 400 from the
 * server — "Missing required fields: domainId, resumeLink" — after the fact,
 * naming database columns rather than the labels next to the boxes. So the
 * form was answering "are you done?" only at the moment you tried to be.
 *
 * Here the answer is on screen the whole time and moves as you type: the ring
 * fills, met requirements strike through and fade, and what is left is a
 * short, plain-English list. The owning form derives `requirements` straight
 * from its own state, so this component holds no rules of its own — it just
 * renders whatever the form currently believes.
 *
 * The ring is a stroked SVG circle animated through stroke-dashoffset, which
 * transitions on the GPU, rather than a re-laid-out width. `prefers-reduced-
 * motion` users get the same numbers with the movement removed, via the
 * motion-reduce variants.
 */
export default function FormProgress({
  requirements,
  title = 'Ready to submit?',
  completeMessage = 'Everything required is filled in.',
  className = '',
}: FormProgressProps) {
  const total = requirements.length
  const doneCount = requirements.filter((r) => r.done).length
  const percent = total === 0 ? 100 : Math.round((doneCount / total) * 100)
  const complete = doneCount === total

  // Starts empty and animates to the real value on mount, so the ring is seen
  // filling rather than appearing already full — the same reason the count
  // below it is worth watching at all.
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(percent))
    return () => cancelAnimationFrame(id)
  }, [percent])

  // Fires once, on the transition from incomplete to complete — not on every
  // render while complete, which would leave the card permanently pulsing.
  const wasComplete = useRef(complete)
  const [justCompleted, setJustCompleted] = useState(false)
  useEffect(() => {
    const crossedOver = complete && !wasComplete.current
    wasComplete.current = complete
    if (!crossedOver) return

    setJustCompleted(true)
    const id = setTimeout(() => setJustCompleted(false), 900)
    return () => clearTimeout(id)
  }, [complete])

  const outstanding = requirements.filter((r) => !r.done)

  return (
    <div
      className={[
        'rounded-card border p-5 transition-colors duration-500',
        complete ? 'border-verified/40 bg-verified/5' : 'border-line bg-card shadow-soft',
        className,
      ].join(' ')}
    >
      <div className="flex items-center gap-4">
        <div className={['relative flex-shrink-0', justCompleted ? 'animate-scale-in' : ''].join(' ')}>
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
            <circle
              cx="32"
              cy="32"
              r={RADIUS}
              fill="none"
              strokeWidth="6"
              className="stroke-line"
            />
            <circle
              cx="32"
              cy="32"
              r={RADIUS}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE - (CIRCUMFERENCE * drawn) / 100}
              className={[
                'transition-[stroke-dashoffset,stroke] duration-700 ease-out motion-reduce:transition-none',
                complete ? 'stroke-verified' : 'stroke-primary',
              ].join(' ')}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink">
            {percent}%
          </span>
        </div>

        <div className="min-w-0">
          <p className="font-semibold text-ink">{complete ? 'All set' : title}</p>
          <p className="mt-0.5 text-sm text-ink/60">
            {complete ? completeMessage : `${doneCount} of ${total} required items done.`}
          </p>
        </div>
      </div>

      {outstanding.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4">
          {outstanding.map((requirement) => (
            <li key={requirement.key} className="flex items-start gap-2.5 text-sm">
              <span
                className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-boost"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="font-medium text-ink/80">{requirement.label}</span>
                {requirement.hint && (
                  <span className="block text-xs text-ink/40">{requirement.hint}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Met requirements, collapsed into ticks. Present so progress is
          visible as accumulation rather than as a list that only ever gets
          shorter, but small enough not to compete with what's left. */}
      {doneCount > 0 && !complete && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {requirements
            .filter((r) => r.done)
            .map((requirement) => (
              <span
                key={requirement.key}
                className="inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-xs font-medium text-verified"
              >
                ✓ {requirement.label}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
