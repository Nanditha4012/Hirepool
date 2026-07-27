import { APP_NAME } from '@/lib/config'

type Size = 'sm' | 'md' | 'lg'

interface DancingLogoProps {
  size?: Size
  /** Renders light-on-dark, for use over photos and the verifier portal header. */
  inverted?: boolean
  className?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl sm:text-6xl',
}

// Per-letter stagger. 70ms reads as a travelling wave; much less and the
// letters look like they're bouncing in unison, much more and the wave
// visibly breaks apart into separate hops.
const STAGGER_MS = 70

/**
 * The brand wordmark with each letter bouncing on a staggered delay — the
 * app's single loading animation.
 *
 * Letters are split from APP_NAME rather than hardcoded so a rebrand via
 * VITE_APP_NAME still animates. The whole thing is one `aria-label`ed element
 * with the letters hidden from assistive tech, otherwise a screen reader
 * announces "H, i, r, e..." one character at a time.
 */
export default function DancingLogo({
  size = 'md',
  inverted = false,
  className = '',
}: DancingLogoProps) {
  const letters = Array.from(APP_NAME)

  return (
    <span
      role="img"
      aria-label={`${APP_NAME} loading`}
      className={['inline-flex select-none font-extrabold tracking-tight', sizeClasses[size], className].join(' ')}
    >
      {letters.map((letter, index) => (
        <span
          key={`${letter}-${index}`}
          aria-hidden="true"
          className={[
            'inline-block animate-dance',
            // Alternating tint gives the wave a second dimension so it still
            // reads as motion in a screenshot or on a low-refresh display.
            inverted
              ? index % 2 === 0
                ? 'text-white'
                : 'text-white/70'
              : index % 2 === 0
                ? 'text-primary'
                : 'text-accent',
          ].join(' ')}
          style={{ animationDelay: `${index * STAGGER_MS}ms` }}
        >
          {/* A literal space would collapse in an inline-block; APP_NAME is
              one word today but this keeps a two-word rebrand from breaking. */}
          {letter === ' ' ? ' ' : letter}
        </span>
      ))}
    </span>
  )
}
