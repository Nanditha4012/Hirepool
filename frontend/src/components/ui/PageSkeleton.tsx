import Skeleton from './Skeleton'

interface PageSkeletonProps {
  /**
   * `wide` for a full-width working screen (search, dashboards), `narrow` for
   * a single-column form or report.
   */
  width?: 'wide' | 'narrow'
  /** Two-column body, as on the dashboards. */
  columns?: 1 | 2
  /** Number of body blocks in the main column. */
  blocks?: number
  className?: string
}

/**
 * A whole page's worth of placeholder, in the shape of what is arriving.
 *
 * The counterpart to ListSkeleton, for the screens that replaced their entire
 * viewport with a centred `<PageLoader/>` while they fetched. That is what
 * made moving around the app feel like loading a website rather than using
 * one: the header stayed, everything under it vanished, a spinner appeared in
 * the middle of the gap, and then the real page arrived at a different height.
 *
 * These pages are reached from the nav — Home, search, unlocked candidates, a
 * community — so the transition is the common case, not an edge one.
 */
export default function PageSkeleton({
  width = 'wide',
  columns = 1,
  blocks = 3,
  className = '',
}: PageSkeletonProps) {
  return (
    <div
      className={[
        'mx-auto w-full px-4 py-8 sm:px-6 lg:px-8',
        width === 'wide' ? 'max-w-app xl:px-10' : 'max-w-app-narrow',
        className,
      ].join(' ')}
      aria-hidden="true"
    >
      {/* Banner */}
      <Skeleton className="h-40 w-full rounded-card" />

      {columns === 2 ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            {Array.from({ length: blocks }).map((_, index) => (
              <Skeleton key={index} className="h-48 w-full rounded-card" />
            ))}
          </div>
          <div className="flex flex-col gap-5">
            <Skeleton className="h-36 w-full rounded-card" />
            <Skeleton className="h-52 w-full rounded-card" />
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {Array.from({ length: blocks }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full rounded-card" />
          ))}
        </div>
      )}
    </div>
  )
}
