import Skeleton from './Skeleton'

interface ListSkeletonProps {
  /** How many placeholder rows. Match the usual result count, not the max. */
  rows?: number
  /** Card-shaped rows for a grid, or bar-shaped rows for a list. */
  variant?: 'card' | 'row'
  className?: string
}

/**
 * Placeholder rows in the shape of the content that is coming.
 *
 * Every list in the app used to load behind a centred spinner — `PageLoader`,
 * sometimes the full-screen one. That is why moving between sections felt
 * like a page load rather than a tab switch: the content region emptied, a
 * spinner appeared in the middle of the empty space, and then the real
 * layout arrived at a different height and pushed everything around.
 *
 * These occupy roughly the space the results will, so nothing collapses and
 * nothing jumps. The section's card, roadmap, artwork and tabs stay painted
 * throughout, so the only thing that changes on screen is the part that is
 * genuinely still arriving.
 *
 * Staggered on purpose: identical simultaneous shimmer reads as a broken
 * repeat, a slight cascade reads as loading.
 */
export default function ListSkeleton({
  rows = 3,
  variant = 'row',
  className = '',
}: ListSkeletonProps) {
  return (
    <div className={['flex flex-col gap-4', className].join(' ')} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="animate-fade-in rounded-card border border-line bg-card p-4 shadow-soft"
          style={{ animationDelay: `${index * 90}ms` }}
        >
          {variant === 'card' ? (
            <>
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="mt-2 h-3 w-1/4" />
                </div>
              </div>
              <Skeleton className="mt-4 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-24 flex-shrink-0 rounded-card" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
