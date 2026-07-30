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

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {entries.map((entry) => {
          const meta = CONTEST_TYPE_META[entry.type]
          return (
            <div key={entry.type} className="rounded-card border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl" aria-hidden="true">
                  {meta.icon}
                </span>
                {entry.isTopRank && <Badge tone="boost">🏆 #1</Badge>}
              </div>
              <p className="mt-2 text-xs font-semibold text-ink/60">
                {/* "DSA Coding Contest" is too long for a 3-up tile. */}
                {meta.label.replace(' Contest', '')}
              </p>
              <p className="mt-1 text-2xl font-bold text-ink">{entry.bestScorePercent}%</p>
              <p className="mt-0.5 text-xs text-ink/50">
                Rank #{entry.rank} of {entry.totalParticipants} · {entry.testsCompleted} test
                {entry.testsCompleted === 1 ? '' : 's'}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
