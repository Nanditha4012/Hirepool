import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import PageHero, { HeroStat } from '@/components/ui/PageHero'
import SupportNote from '@/components/ui/SupportNote'
import {
  CONTEST_TYPE_META,
  getContestHub,
  type ContestHubEntry,
  type ContestType,
} from '@/lib/contestApi'

/** Order is fixed and matches the spec's card order. */
const ORDER: ContestType[] = ['dsa', 'domain', 'quant']

function ContestCard({ entry }: { entry: ContestHubEntry }) {
  const meta = CONTEST_TYPE_META[entry.type]
  const attempted = entry.attemptedCount > 0

  return (
    <Card interactive className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <span className="text-4xl" aria-hidden="true">
          {meta.icon}
        </span>
        {attempted && entry.bestScorePercent !== null && (
          <Badge tone={entry.bestScorePercent >= 70 ? 'verified' : 'boost'}>
            Best {entry.bestScorePercent}%
          </Badge>
        )}
      </div>

      <h2 className="mt-4 text-xl font-bold text-ink">{meta.label}</h2>
      <p className="mt-2 flex-1 text-sm text-ink/60">{meta.blurb}</p>

      <dl className="mt-4 flex gap-6 border-t border-line pt-4">
        <div>
          <dt className="text-xs text-ink/50">Tests</dt>
          <dd className="text-lg font-bold text-ink">{entry.testCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/50">Attempted</dt>
          <dd className="text-lg font-bold text-ink">{entry.attemptedCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/50">Best score</dt>
          <dd className="text-lg font-bold text-ink">
            {entry.bestScorePercent === null ? '—' : `${entry.bestScorePercent}%`}
          </dd>
        </div>
      </dl>

      <Link to={`/contests/${entry.type}`} className="mt-5">
        <Button className="w-full">View Tests</Button>
      </Link>
    </Card>
  )
}

export default function ContestHubPage() {
  const [entries, setEntries] = useState<ContestHubEntry[]>([])
  const [entryFee, setEntryFee] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getContestHub()
        if (cancelled) return
        setEntries(result.contests)
        setEntryFee(result.entryFeeInr)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load contests')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <PageLoader label="Loading contests…" />

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error}</p>
        </Card>
        <SupportNote className="mt-6" />
      </div>
    )
  }

  const byType = new Map(entries.map((e) => [e.type, e]))
  const totalTests = entries.reduce((sum, e) => sum + e.testCount, 0)
  const totalAttempted = entries.reduce((sum, e) => sum + e.attemptedCount, 0)
  const bestOverall = entries.reduce<number | null>((best, e) => {
    if (e.bestScorePercent === null) return best
    return best === null ? e.bestScorePercent : Math.max(best, e.bestScorePercent)
  }, null)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="Contests"
        title="Prove it with a score, not a claim"
        subtitle="Every contest here is scored automatically by Hirepool and shown on your profile to hiring companies — no verifier sign-off needed."
        meta={
          entryFee === 0 ? (
            <Badge tone="verified">Free for all candidates</Badge>
          ) : (
            <Badge tone="boost">₹{entryFee} per contest</Badge>
          )
        }
        actions={
          <Link to="/contests/leaderboard">
            <Button variant="inverse" size="sm">
              Leaderboards
            </Button>
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeroStat label="Tests available" value={totalTests} />
          <HeroStat label="Attempted" value={totalAttempted} hint="by you" />
          <HeroStat label="Best score" value={bestOverall === null ? '—' : `${bestOverall}%`} />
        </div>
      </PageHero>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {ORDER.map((type) => {
          const entry = byType.get(type)
          if (!entry) return null
          return <ContestCard key={type} entry={entry} />
        })}
      </div>

      <SupportNote className="mt-10">Spotted a wrong answer key, or a test that won&apos;t load?</SupportNote>
    </div>
  )
}
