import DancingLogo from './DancingLogo'

interface PageLoaderProps {
  /** Shown under the wordmark, e.g. "Loading your profile". */
  label?: string
  /** Fills the viewport instead of sitting inline in the page body. */
  fullScreen?: boolean
  /**
   * Shrinks the whole thing for use inside a card or section, where the
   * full-page height would push the surrounding layout around.
   */
  compact?: boolean
  className?: string
}

/**
 * The one loading state for the whole app.
 *
 * Every page previously rendered its own bare `<p>Loading…</p>` with slightly
 * different wrapper classes; this replaces all of them so a slow network
 * looks the same everywhere.
 */
export default function PageLoader({
  label,
  fullScreen = false,
  compact = false,
  className = '',
}: PageLoaderProps) {
  const sizing = fullScreen ? 'min-h-screen gap-4' : compact ? 'py-8 gap-2' : 'min-h-[40vh] py-16 gap-4'

  return (
    <div
      // aria-live so a screen reader announces the loading state when it
      // appears mid-navigation, rather than sitting on a silently empty page.
      role="status"
      aria-live="polite"
      className={['flex w-full flex-col items-center justify-center', sizing, className].join(' ')}
    >
      <DancingLogo size={compact ? 'md' : 'lg'} />

      {/* Progress bar with no known duration — an indeterminate sweep rather
          than a percentage we'd have to invent. */}
      <div className={['overflow-hidden rounded-full bg-surface', compact ? 'h-1 w-24' : 'h-1 w-40'].join(' ')}>
        <div className="h-full w-1/3 animate-shimmer rounded-full bg-gradient-to-r from-primary via-accent to-primary" />
      </div>

      {label && <p className="text-sm font-medium text-ink/50">{label}</p>}
    </div>
  )
}
