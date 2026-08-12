import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { HeroStat } from '@/components/ui/PageHero'
import { type SegmentedTabOption } from '@/components/ui/SegmentedTabs'
import ListSkeleton from '@/components/ui/ListSkeleton'
import SupportNote from '@/components/ui/SupportNote'
import TabWorkspace from '@/components/layout/TabWorkspace'
import SectionRoadmap, { type RoadmapStep } from '@/components/layout/SectionRoadmap'
import SectionArtwork from '@/components/layout/SectionArtwork'
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
    <TabWorkspace
      eyebrow="Contests"
      title="Leaderboards"
      subtitle="Ranked on the sum of your best score per test within a contest type — so finishing more tests beats replaying one easy test."
      stats={
        <div className="grid grid-cols-2 gap-2">
          <HeroStat label="Participants" value={loading ? '—' : totalParticipants} />
          <HeroStat
            label="Your rank"
            value={loading ? '—' : me ? `#${me.rank}` : '—'}
            hint={me ? `${me.testsCompleted} tests` : 'not ranked yet'}
          />
        </div>
      }
      actions={
        <Link to={`/contests?tab=${type}`}>
          <Button variant="inverse" size="sm">
            Browse tests
          </Button>
        </Link>
      }
      artwork={<SectionArtwork scene="leaderboard" />}
      rail={<SectionRoadmap steps={ROADMAP} />}
      tabsAriaLabel="Contest type"
      value={type}
      onChange={(next) => setSearchParams({ type: next })}
      tabs={tabs}
    >
      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <Card>
          <p className="text-danger">{error}</p>
        </Card>
      ) : (
        <div key={type} className="animate-fade-up">
          <div className="flex items-baseline justify-between gap-3">
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
              <Link to={`/contests?tab=${type}`} className="mt-4 inline-block">
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
            // bottom-24 on mobile so this clears CandidateBottomNav's fixed
            // bar (this page is candidate-only) instead of sticking behind
            // it; md+ has no bottom nav, so bottom-4 there sits close to the
            // viewport edge as originally intended.
            <div className="sticky bottom-24 mt-4 md:bottom-4">
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
              <Link to={`/contests?tab=${type}`} className="mt-3 inline-block">
                <Button size="sm" variant="secondary">
                  Browse tests
                </Button>
              </Link>
            </Card>
          )}

          <SupportNote className="mt-10" />
        </div>
      )}
    </TabWorkspace>
  )
}

/** How a rank is earned. See SectionRoadmap. */
const ROADMAP: RoadmapStep[] = [
  {
    icon: '📝',
    title: 'Finish a test',
    detail: 'Only submitted attempts count. An abandoned one scores nothing.',
  },
  {
    icon: '➕',
    title: 'Best score per test, summed',
    detail: 'Your best attempt at each test is counted once — retaking cannot inflate a total.',
  },
  {
    icon: '📈',
    title: 'Breadth beats repetition',
    detail: 'Finishing more tests outranks replaying one easy test until it is perfect.',
  },
  {
    icon: '🏆',
    title: 'Ranked within a contest',
    detail: 'DSA, Domain and Quant are separate boards — strength in one does not carry over.',
  },
]
