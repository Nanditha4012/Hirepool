import DancingLogo from './DancingLogo'

interface PageLoaderProps {
  /** Shown under the wordmark, e.g. "Loading your profile". */
  label?: string
  /**
   * Opt out of the fixed viewport overlay and render inline instead, for the
   * few places where a loader sits *inside* a card that is itself already on
   * screen (a section refreshing under a page that's otherwise usable).
   */
  compact?: boolean
  className?: string
}

/**
 * The one loading state for the whole app: the dancing wordmark, pinned to the
 * exact centre of the viewport.
 *
 * `position: fixed` against the viewport rather than centring inside whatever
 * container happens to wrap it. Every caller used to supply its own wrapper —
 * `max-w-3xl py-16 text-center` here, `min-h-[40vh]` there — so the logo
 * landed in a different spot on every page, and on a page whose wrapper was
 * short it sat near the top rather than centred at all. Now the callers'
 * wrappers are irrelevant: it is always dead centre, on every screen, at every
 * size.
 *
 * The backdrop is opaque `bg-page` so whatever is mid-render underneath can't
 * show through as a half-drawn page behind the logo.
 */
export default function PageLoader({ label, compact = false, className = '' }: PageLoaderProps) {
  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={['flex w-full flex-col items-center justify-center gap-2 py-8', className].join(' ')}
      >
        <DancingLogo size="md" />
        {label && <p className="text-sm font-medium text-ink/50">{label}</p>}
      </div>
    )
  }

  return (
    <div
      // aria-live so a screen reader announces the loading state when it
      // appears mid-navigation, rather than sitting on a silently empty page.
      role="status"
      aria-live="polite"
      // z-40: above page content, deliberately below the session-timeout
      // dialog (z-100) and the header's own z-50 stacking.
      className={[
        'fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-page',
        className,
      ].join(' ')}
    >
      {/* The dancing wordmark is the whole loading state. There used to be an
          indeterminate progress bar under it as well; two competing motions
          reading as one loader looked like a stuck button spinner sitting
          under the logo, so the bar is gone and the letters carry it. */}
      <DancingLogo size="lg" />

      {label && <p className="text-sm font-medium text-ink/50">{label}</p>}
    </div>
  )
}
