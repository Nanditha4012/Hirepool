interface SkeletonProps {
  className?: string
}

/**
 * A shimmering placeholder block, for list/table rows where holding the
 * layout steady matters more than showing the brand loader.
 *
 * The sweep is an absolutely-positioned gradient translated across an
 * `overflow-hidden` parent, rather than an animated `background-position` —
 * transform animations stay on the compositor, so a table of thirty of these
 * doesn't cause layout thrash.
 */
export default function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={['relative overflow-hidden rounded-card bg-surface', className].join(' ')}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  )
}
