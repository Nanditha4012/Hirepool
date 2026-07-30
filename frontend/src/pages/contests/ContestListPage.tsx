import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import PageHero from '@/components/ui/PageHero'
import SegmentedTabs, { type SegmentedTabOption } from '@/components/ui/SegmentedTabs'
import SupportNote from '@/components/ui/SupportNote'
import {
  COMPLEXITY_META,
  CONTEST_TYPE_META,
  listContests,
  startAttempt,
  type ContestComplexity,
  type ContestListEntry,
  type ContestType,
} from '@/lib/contestApi'

const COMPLEXITIES: ContestComplexity[] = ['easy', 'medium', 'hard']

function isContestType(value: string | undefined): value is ContestType {
  return value === 'dsa' || value === 'domain' || value === 'quant'
}

function TestRow({
  contest,
  onStart,
  starting,
}: {
  contest: ContestListEntry
  onStart: (id: string) => void
  starting: boolean
}) {
  const meta = COMPLEXITY_META[contest.complexity]
  const best = contest.bestAttempt

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">{contest.title}</h3>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {best && (
            <Badge tone={best.percent >= 70 ? 'verified' : 'neutral'}>Best {best.percent}%</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-ink/60">
          {contest.questionCount} question{contest.questionCount === 1 ? '' : 's'} ·{' '}
          {contest.timeLimitMinutes} min
          {contest.attemptCount > 0 && (
            <>
              {' '}
              · {contest.attemptCount} attempt{contest.attemptCount === 1 ? '' : 's'}
            </>
          )}
        </p>
        {best && (
          <p className="mt-0.5 text-xs text-ink/40">
            Best {best.score}/{best.maxScore} on {new Date(best.submittedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {best && (
          <Link to={`/contests/result/${best.id}`}>
            <Button variant="secondary" size="sm">
              View result
            </Button>
          </Link>
        )}
        <Button size="sm" loading={starting} onClick={() => onStart(contest.id)}>
          {/* Wording follows the spec: a completed test offers a retake. */}
          {best ? 'Retake' : 'Start Test'}
        </Button>
      </div>
    </Card>
  )
}

export default function ContestListPage() {
  const { type } = useParams<{ type: string }>()
  const navigate = useNavigate()

  const [complexity, setComplexity] = useState<ContestComplexity>('easy')
  const [contests, setContests] = useState<ContestListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const validType = isContestType(type) ? type : null

  useEffect(() => {
    if (!validType) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // Every complexity is fetched once and split client-side, so switching
        // tabs is instant rather than a round trip per tab.
        const result = await listContests(validType)
        if (!cancelled) setContests(result.contests)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tests')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [validType])

  const byComplexity = useMemo(() => {
    const map = new Map<ContestComplexity, ContestListEntry[]>()
    for (const level of COMPLEXITIES) {
      map.set(
        level,
        contests.filter((c) => c.complexity === level),
      )
    }
    return map
  }, [contests])

  const tabs: SegmentedTabOption<ContestComplexity>[] = COMPLEXITIES.map((level) => ({
    value: level,
    label: COMPLEXITY_META[level].label,
    hint: `${byComplexity.get(level)?.length ?? 0} tests`,
  }))

  const handleStart = async (contestId: string) => {
    setStartingId(contestId)
    setStartError(null)
    try {
      const started = await startAttempt(contestId)
      navigate(`/contests/attempt/${started.attempt.id}`, { state: { started } })
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start this test')
    } finally {
      setStartingId(null)
    }
  }

  if (!validType) return <Navigate to="/contests" replace />
  if (loading) return <PageLoader label="Loading tests…" />

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error}</p>
        </Card>
        <SupportNote className="mt-6" />
      </div>
    )
  }

  const meta = CONTEST_TYPE_META[validType]
  const rows = byComplexity.get(complexity) ?? []

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="Contests"
        title={meta.label}
        subtitle={meta.blurb}
        actions={
          <>
            <Link to="/contests">
              <Button variant="outlineInverse" size="sm">
                All contests
              </Button>
            </Link>
            <Link to={`/contests/leaderboard?type=${validType}`}>
              <Button variant="inverse" size="sm">
                Leaderboard
              </Button>
            </Link>
          </>
        }
      >
        <SegmentedTabs
          aria-label="Difficulty"
          inverted
          options={tabs}
          value={complexity}
          onChange={setComplexity}
        />
      </PageHero>

      {startError && (
        <Card className="mt-6 border border-danger/30 bg-danger/5">
          <p className="text-sm text-danger">{startError}</p>
        </Card>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {rows.length === 0 ? (
          <Card>
            <p className="text-ink/60">No {COMPLEXITY_META[complexity].label} tests published yet.</p>
          </Card>
        ) : (
          rows.map((contest) => (
            <TestRow
              key={contest.id}
              contest={contest}
              starting={startingId === contest.id}
              onStart={handleStart}
            />
          ))
        )}
      </div>

      <SupportNote className="mt-10" />
    </div>
  )
}
