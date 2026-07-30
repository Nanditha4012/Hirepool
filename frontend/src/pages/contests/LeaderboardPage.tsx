import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import PageLoader from '@/components/ui/PageLoader'
import PageHero from '@/components/ui/PageHero'
import SegmentedTabs, { type SegmentedTabOption } from '@/components/ui/SegmentedTabs'
import SupportNote from '@/components/ui/SupportNote'
import {
  CONTEST_TYPE_META,
  getLeaderboard,
  type ContestType,
  type LeaderboardRow,
} from '@/lib/contestApi'

const TYPES: ContestType[] = ['dsa', 'domain', 'quant']

const tabs: SegmentedTabOption<ContestType>[] = [
  { value: 'dsa', label: 'DSA' },
  { value: 'domain', label: 'Domain' },
  { value: 'quant', label: 'Quant' },
]

function medalFor(rank: number): string | null {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

function Row({ row, sticky = false }: { row: LeaderboardRow; sticky?: boolean }) {
  const medal = medalFor(row.rank)

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3 transition-colors',
        row.isMe ? 'bg-primary/5' : '',
        sticky ? 'rounded-card border-2 border-primary bg-card shadow-lift' : 'border-b border-line last:border-0',
      ].join(' ')}
    >
      <span
        className={[
          'w-12 flex-shrink-0 text-center text-sm font-bold tabular-nums',
          row.rank <= 3 ? 'text-lg' : 'text-ink/60',
        ].join(' ')}
      >
        {medal ?? `#${row.rank}`}
      </span>
      <Avatar name={row.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {row.name}
          {row.isMe && <span className="ml-2 text-xs font-bold text-primary">You</span>}
        </p>
        <p className="text-xs text-ink/50">
          {row.testsCompleted} test{row.testsCompleted === 1 ? '' : 's'} completed
        </p>
      </div>
      <span className="flex-shrink-0 text-right">
        <span className="block text-lg font-bold text-ink tabular-nums">{row.totalScore}</span>
        <span className="block text-xs text-ink/40">points</span>
      </span>
    </div>
  )
}

export default function LeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const type: ContestType = TYPES.includes(typeParam as ContestType) ? (typeParam as ContestType) : 'dsa'

  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [me, setMe] = useState<LeaderboardRow | null>(null)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await getLeaderboard(type)
        if (cancelled) return
        setRows(data.rows)
        setMe(data.me)
        setTotalParticipants(data.totalParticipants)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the leaderboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [type])

  // The viewer's own row is repeated as a sticky footer only when it isn't
  // already visible in the top 50 — otherwise it would appear twice.
  const meInTop = me !== null && rows.some((row) => row.candidateId === me.candidateId)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="Contests"
        title="Leaderboards"
        subtitle="Ranked on the sum of your best score per test within a contest type — so finishing more tests beats replaying one easy test."
        actions={
          <Link to="/contests">
            <Button variant="inverse" size="sm">
              All contests
            </Button>
          </Link>
        }
      >
        <SegmentedTabs
          aria-label="Contest type"
          inverted
          options={tabs}
          value={type}
          onChange={(next) => setSearchParams({ type: next })}
        />
      </PageHero>

      {loading ? (
        // compact, not the full-screen loader: the hero above is already
        // painted and switching tabs shouldn't black the whole page out.
        <PageLoader compact label="Loading leaderboard…" />
      ) : error ? (
        <Card className="mt-8">
          <p className="text-danger">{error}</p>
        </Card>
      ) : (
        <>
          <div className="mt-8 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold text-ink">{CONTEST_TYPE_META[type].label}</h2>
            <p className="text-sm text-ink/50">
              {totalParticipants} participant{totalParticipants === 1 ? '' : 's'}
            </p>
          </div>

          {rows.length === 0 ? (
            <Card className="mt-4 text-center">
              <p className="text-4xl" aria-hidden="true">
                🏁
              </p>
              <p className="mt-3 font-semibold text-ink">Nobody has completed a test here yet</p>
              <p className="mt-1 text-sm text-ink/60">Be the first — you&apos;ll take rank #1.</p>
              <Link to={`/contests/${type}`} className="mt-4 inline-block">
                <Button size="sm">Browse tests</Button>
              </Link>
            </Card>
          ) : (
            <Card className="mt-4 overflow-hidden p-0">
              {rows.map((row) => (
                <Row key={row.candidateId} row={row} />
              ))}
            </Card>
          )}

          {me && !meInTop && (
            <div className="sticky bottom-4 mt-4">
              <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-wide text-ink/40">
                Your position
              </p>
              <Row row={me} sticky />
            </div>
          )}

          {!me && rows.length > 0 && (
            <Card className="mt-4">
              <p className="text-sm text-ink/60">
                You haven&apos;t completed a {CONTEST_TYPE_META[type].label} test yet — finish one and
                you&apos;ll appear here.
              </p>
              <Link to={`/contests/${type}`} className="mt-3 inline-block">
                <Button size="sm" variant="secondary">
                  Browse tests
                </Button>
              </Link>
            </Card>
          )}
        </>
      )}

      <SupportNote className="mt-10" />
    </div>
  )
}
