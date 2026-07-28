import { APP_NAME } from '@/lib/config'

type Size = 'sm' | 'md' | 'lg'

interface LogoProps {
  /** Renders the wordmark light, for dark headers and photo panels. */
  inverted?: boolean
  /** Mark only, no wordmark — for tight spaces. */
  markOnly?: boolean
  size?: Size
  className?: string
}

const markSize: Record<Size, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
}

const textSize: Record<Size, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-3xl',
}

/**
 * The brand lockup: the logo mark image plus the wordmark.
 *
 * The mark is public/favicon.svg — the same artwork the PWA install icons are
 * rasterised from (see scripts/generate-icons.mjs), so the icon in a browser
 * tab, on a home screen, and in the header are one design rather than three.
 * Referenced by URL from /public rather than imported, so it is served as a
 * plain file instead of being inlined into the JS bundle.
 */
export default function Logo({
  inverted = false,
  markOnly = false,
  size = 'md',
  className = '',
}: LogoProps) {
  return (
    <span className={['inline-flex items-center gap-2.5', className].join(' ')}>
      <img
        src="/favicon.svg"
        // The wordmark beside it already names the product, so the image is
        // decorative; markOnly has no text, so there it must carry the name.
        alt={markOnly ? APP_NAME : ''}
        aria-hidden={markOnly ? undefined : 'true'}
        className={[
          markSize[size],
          'flex-shrink-0 rounded-card transition-transform duration-300 group-hover:scale-110',
        ].join(' ')}
      />
      {!markOnly && (
        <span
          className={[
            'font-extrabold tracking-tight',
            textSize[size],
            inverted ? 'text-white' : 'text-ink',
          ].join(' ')}
        >
          {APP_NAME}
        </span>
      )}
    </span>
  )
}
