import { useEffect, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { useAuth } from '@/lib/authStore'
import {
  CONTEST_TYPE_META,
  getCandidateContestPerformance,
  getMyContestPerformance,
  type ContestPerformanceEntry,
} from '@/lib/contestApi'

interface ContestPerformanceProps {
  /** Omit to show the signed-in candidate's own performance. */
  candidateId?: string
  className?: string
}

/**
 * Contest results as seen on a candidate's profile.
 *
 * Unlike achievements and platform badges, nothing here waits on a verifier:
 * these numbers are produced by Hirepool's own judge from real scored
 * attempts, so they are displayed as-is and labelled as auto-verified. That
 * label is the point — it's what tells a company this figure means something
 * different from a self-reported claim.
 *
 * Renders nothing at all when the candidate has no attempts, rather than an
 * empty "no contests" panel, so an unused feature doesn't add noise to every
 * profile.
 */
export default function ContestPerformance({ candidateId, className = '' }: ContestPerformanceProps) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<ContestPerformanceEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Which endpoint to use is decided by the VIEWER, not by whether a
    // candidateId was passed. ProfileCard renders the same card for a company
    // browsing search results and for a candidate previewing their own
    // profile — and the company-scoped route 403s for a candidate, so keying
    // off the prop alone would silently blank this panel on the candidate's
    // own dashboard.
    const fetcher =
      user?.role === 'company' && candidateId
        ? () => getCandidateContestPerformance(candidateId)
        : user?.role === 'candidate'
          ? () => getMyContestPerformance()
          : null

    // Verifiers and admins have no contest-performance endpoint; render
    // nothing rather than firing a request that will 403.
    if (!fetcher) {
      setFailed(true)
      return
    }

    void (async () => {
      try {
        const result = await fetcher()
        if (!cancelled) setEntries(result.performance)
      } catch {
        // A profile must still render if this one panel can't load — it is
        // supplementary, not load-bearing.
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [candidateId, user?.role])

  if (failed) return null
  if (entries === null) return <Skeleton className={['h-24', className].join(' ')} />
  if (entries.length === 0) return null

  return (
    <section className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink/40">Contest performance</h3>
        <Badge tone="verified">Auto-verified by {'​'}Hirepool</Badge>
      </div>

      {/*
        Breaks at 2-up before 3-up, and only goes 3-up at `xl`.
        This panel lives inside a profile card, which itself sits in a
        two-thirds column on the candidate dashboard and in a search-results
        column for a company — so its real width at `sm` is nowhere near the
        viewport width `sm:grid-cols-3` was reasoning about. Three tiles were
        being squeezed into roughly 130px each, which clipped the rank line
        ("Rank #12 of 340 · 3 tests") and shouldered the 🏆 badge out of its
        row. Same tiles, given room to be read.

        `min-w-0` on the tile is what actually lets the truncation below work:
        a grid item defaults to `min-width: auto`, so its content refuses to
        shrink and overflows the track instead of eliding.
      */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => {
          const meta = CONTEST_TYPE_META[entry.type]
          return (
            <div
              key={entry.type}
              className="flex min-w-0 flex-col rounded-card border border-line bg-card p-3 transition-shadow hover:shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xl leading-none" aria-hidden="true">
                  {meta.icon}
                </span>
                {entry.isTopRank && (
                  <Badge tone="boost">
                    <span className="whitespace-nowrap">🏆 #1</span>
                  </Badge>
                )}
              </div>

              <p className="mt-2 truncate text-xs font-semibold text-ink/60">
                {/* "DSA Coding Contest" is too long for a tile. */}
                {meta.label.replace(' Contest', '')}
              </p>

              <p className="mt-1 text-2xl font-bold leading-none text-ink">
                {entry.bestScorePercent}%
              </p>

              {/* Two lines, not one: at tile width the rank and the attempt
                  count together always wrapped mid-number or got cut. */}
              <p className="mt-1.5 truncate text-xs text-ink/50">
                Rank #{entry.rank} of {entry.totalParticipants}
              </p>
              <p className="truncate text-xs text-ink/40">
                {entry.testsCompleted} test{entry.testsCompleted === 1 ? '' : 's'} completed
              </p>

              {/* A proportional bar so the three scores can be compared
                  without reading three numbers. */}
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <div
                  className={[
                    'h-full rounded-full transition-[width] duration-700 ease-out',
                    entry.bestScorePercent >= 70 ? 'bg-verified' : 'bg-primary',
                  ].join(' ')}
                  style={{ width: `${Math.min(100, Math.max(0, entry.bestScorePercent))}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
