import { APP_NAME } from '@/lib/config'

type Size = 'sm' | 'md' | 'lg'

interface LogoProps {
  /** Renders the wordmark light, for dark headers and photo panels. */
  inverted?: boolean
  size?: Size
  className?: string
}

const textSize: Record<Size, string> = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
}

/**
 * The brand lockup — the wordmark, and only the wordmark.
 *
 * There used to be a mark beside it: public/favicon.svg, an arrow arriving at
 * a bar ("companies come to you"). Next to a word at 28-36px it did not read
 * as a logo, it read as a download button — people took it for a control and
 * tried to click it, on the header and again on the forgot-password screen.
 * A brand mark that is consistently mistaken for an affordance is not doing
 * its job, so it is gone from the interface entirely.
 *
 * The artwork itself is untouched and still ships as the app icon — the
 * browser-tab favicon, the PWA install icons rasterised from it by
 * scripts/generate-icons.mjs, and the apple-touch-icon. In those places it
 * stands alone at small sizes with no wordmark competing with it and no
 * neighbouring buttons to be confused with, which is the context it was drawn
 * for. There is deliberately no prop to bring it back into the UI: the last
 * version had `markOnly`/`wordOnly` flags, and the mark kept reappearing on
 * new screens because showing it was the default.
 */
export default function Logo({ inverted = false, size = 'md', className = '' }: LogoProps) {
  return (
    <span
      className={[
        'inline-flex select-none items-center font-extrabold tracking-tight',
        textSize[size],
        inverted ? 'text-white' : 'text-ink',
        className,
      ].join(' ')}
    >
      {/* The tail of the word carries the brand colour, so the wordmark still
          reads as a logo now that nothing sits beside it. Falls back to plain
          text for a name too short to split. */}
      {APP_NAME.length > 4 ? (
        <>
          {APP_NAME.slice(0, -4)}
          <span className={inverted ? 'text-white/70' : 'text-primary'}>{APP_NAME.slice(-4)}</span>
        </>
      ) : (
        APP_NAME
      )}
    </span>
  )
}
