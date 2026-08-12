import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { HeroStat } from '@/components/ui/PageHero'
import { type SegmentedTabOption } from '@/components/ui/SegmentedTabs'
import SupportNote from '@/components/ui/SupportNote'
import TabWorkspace from '@/components/layout/TabWorkspace'
import SectionRoadmap, { type RoadmapStep } from '@/components/layout/SectionRoadmap'
import SectionArtwork from '@/components/layout/SectionArtwork'
import SubTabs, { type SubTabOption } from '@/components/ui/SubTabs'
import ListSkeleton from '@/components/ui/ListSkeleton'
import {
  COMPLEXITY_META,
  CONTEST_TYPES,
  CONTEST_TYPE_META,
  getContestHub,
  isContestType,
  listContests,
  startAttempt,
  type ContestComplexity,
  type ContestHubEntry,
  type ContestListEntry,
  type ContestType,
} from '@/lib/contestApi'

const COMPLEXITIES: ContestComplexity[] = ['easy', 'medium', 'hard']

/**
 * Contests — DSA, Domain and Quant as three tabs of one screen.
 *
 * They used to be a hub of three cards that *pushed* a separate route per
 * type, which made this the odd surface out: the Walk-in Pedia and the Job
 * Book are tabs (see FeedPage), so switching between them keeps you on the
 * page, keeps the hero in place and costs nothing. Picking a contest type did
 * the opposite — full page transition, hero swapped, a "back to all contests"
 * button to get home again — for what is the same "two views of one thing"
 * relationship. This is now the same control, the same query-string tab
 * convention and the same layout as `/feed`.
 *
 * The tab lives in the query string (`/contests?tab=domain`) so a link can
 * point at one, and so Back returns to the tab you were on rather than the
 * default. `/contests/:type` still resolves — see ContestTypeRedirect.
 */
export default function ContestHubPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: ContestType = isContestType(tabParam) ? tabParam : 'dsa'

  const [entries, setEntries] = useState<ContestHubEntry[]>([])
  const [entryFee, setEntryFee] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setTab = (next: ContestType) => {
    // `replace` so flipping tabs doesn't stack history entries a reader then
    // has to press Back through to leave the page — same rule as FeedPage.
    setSearchParams(next === 'dsa' ? {} : { tab: next }, { replace: true })
  }

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

  const byType = useMemo(() => new Map(entries.map((e) => [e.type, e])), [entries])

  const active = byType.get(tab) ?? null
  const meta = CONTEST_TYPE_META[tab]

  const tabs: SegmentedTabOption<ContestType>[] = CONTEST_TYPES.map((type) => {
    const entry = byType.get(type)
    const count = entry?.testCount ?? 0
    return {
      value: type,
      label: CONTEST_TYPE_META[type].label.replace(/ Contest$/, ''),
      // While the hub summary is still loading there is no count to state,
      // and inventing "0 tests" reads as an answer rather than as a wait.
      hint: loading ? '…' : `${count} test${count === 1 ? '' : 's'}`,
    }
  })

  return (
    <TabWorkspace
      eyebrow="Contests"
      title={
        <>
          <span className="mr-2" aria-hidden="true">
            {meta.icon}
          </span>
          {meta.label}
        </>
      }
      subtitle={meta.blurb}
      meta={
        entryFee === 0 ? (
          <Badge tone="verified">Free for all candidates</Badge>
        ) : (
          <Badge tone="boost">₹{entryFee} per contest</Badge>
        )
      }
      stats={
        <div className="grid grid-cols-3 gap-2">
          <HeroStat label="Tests" value={loading ? '—' : (active?.testCount ?? 0)} />
          <HeroStat label="Attempted" value={loading ? '—' : (active?.attemptedCount ?? 0)} />
          <HeroStat
            label="Best"
            value={
              loading || active === null || active.bestScorePercent === null
                ? '—'
                : `${active.bestScorePercent}%`
            }
          />
        </div>
      }
      actions={
        <Link to={`/contests/leaderboard?type=${tab}`}>
          <Button variant="inverse" size="sm">
            Leaderboard
          </Button>
        </Link>
      }
      artwork={<SectionArtwork scene={`contest-${tab}` as const} />}
      rail={<SectionRoadmap steps={ROADMAP} />}
      tabsAriaLabel="Contest type"
      value={tab}
      onChange={setTab}
      tabs={tabs}
    >
      {error ? (
        <>
          <Card>
            <p className="text-danger">{error}</p>
          </Card>
          <SupportNote className="mt-6" />
        </>
      ) : (
        <>
          {/* Keyed on the tab so the panel re-mounts — and so its entrance
              animation replays — when you switch contest. The workspace shell
              around it stays mounted throughout, so this is a panel swap
              rather than the full page transition it used to be. */}
          <ContestTypePanel key={tab} type={tab} />
          <SupportNote className="mt-10">
            Spotted a wrong answer key, or a test that won&apos;t load?
          </SupportNote>
        </>
      )}
    </TabWorkspace>
  )
}

/** How a contest turns into something a company can see. See SectionRoadmap. */
const ROADMAP: RoadmapStep[] = [
  {
    icon: '🎯',
    title: 'Pick a difficulty',
    detail: 'Easy, Medium or Hard. Start where you are — the score is what counts, not the level.',
  },
  {
    icon: '⏱️',
    title: 'Take the test',
    detail: 'Timed, in one sitting. Your answers save as you go, so a refresh will not lose them.',
  },
  {
    icon: '⚡',
    title: 'Scored instantly',
    detail: 'Code runs against hidden test cases. No verifier sign-off, no waiting.',
  },
  {
    icon: '🏅',
    title: 'It lands on your profile',
    detail: 'Companies see the score and your rank — proof rather than a claim.',
  },
]

// ---------------------------------------------------------------------------
// One contest type's tests, split by difficulty
// ---------------------------------------------------------------------------

function ContestTypePanel({ type }: { type: ContestType }) {
  const navigate = useNavigate()

  const [complexity, setComplexity] = useState<ContestComplexity>('easy')
  const [contests, setContests] = useState<ContestListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Every complexity is fetched once and split client-side, so switching
      // difficulty is instant rather than a round trip per tab.
      const result = await listContests(type)
      setContests(result.contests)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tests')
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => {
    void load()
  }, [load])

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

  // The second level of tabs, deliberately NOT the pill track used for the
  // contest type above it — see components/ui/SubTabs.
  const difficultyTabs: SubTabOption<ContestComplexity>[] = COMPLEXITIES.map((level) => ({
    value: level,
    label: COMPLEXITY_META[level].label,
    count: loading ? undefined : (byComplexity.get(level)?.length ?? 0),
    tone: COMPLEXITY_META[level].tone,
  }))

  const rows = byComplexity.get(complexity) ?? []

  return (
    <div className="animate-fade-up">
      <SubTabs
        aria-label="Difficulty"
        options={difficultyTabs}
        value={complexity}
        onChange={setComplexity}
      />

      {startError && (
        <Card className="mt-6 border border-danger/30 bg-danger/5">
          <p className="text-sm text-danger">{startError}</p>
        </Card>
      )}

      {/* Skeleton rows, not a spinner: the tabs above stay put and the list
          area keeps its height, so arriving here is a fill-in rather than a
          page swapping itself out. */}
      {loading && <ListSkeleton className="mt-6" rows={3} />}

      {error && <p className="mt-6 text-danger">{error}</p>}

      {!loading && !error && (
        <div className="mt-6 flex flex-col gap-4">
          {rows.length === 0 ? (
            <Card className="text-center">
              <p className="font-semibold text-ink">
                No {COMPLEXITY_META[complexity].label.toLowerCase()} tests published yet.
              </p>
              <p className="mt-1 text-sm text-ink/60">
                Try another difficulty — or another contest above.
              </p>
            </Card>
          ) : (
            rows.map((contest, index) => (
              <TestRow
                key={contest.id}
                contest={contest}
                index={index}
                starting={startingId === contest.id}
                onStart={handleStart}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TestRow({
  contest,
  index,
  onStart,
  starting,
}: {
  contest: ContestListEntry
  index: number
  onStart: (id: string) => void
  starting: boolean
}) {
  const meta = COMPLEXITY_META[contest.complexity]
  const best = contest.bestAttempt

  return (
    <Card
      // A short stagger down the list, so a difficulty switch reads as the
      // new set arriving rather than the old one being swapped underneath you.
      // Capped at 6 so a long list doesn't leave the last rows visibly late.
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
      className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
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
