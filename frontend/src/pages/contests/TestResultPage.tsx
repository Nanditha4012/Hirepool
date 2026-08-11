import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import PageHero, { HeroStat } from '@/components/ui/PageHero'
import SupportNote from '@/components/ui/SupportNote'
import {
  COMPLEXITY_META,
  CONTEST_TYPE_META,
  getAttemptResult,
  type AttemptResult,
  type AttemptResultQuestion,
} from '@/lib/contestApi'

const SECTION_LABELS: Record<string, string> = {
  math: 'Math',
  reasoning: 'Logical Reasoning',
  english: 'English',
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/** Horizontal score meter. */
function Meter({ percent, tone }: { percent: number; tone: 'verified' | 'boost' | 'danger' }) {
  const colour = tone === 'verified' ? 'bg-verified' : tone === 'boost' ? 'bg-boost' : 'bg-danger'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${colour}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  )
}

function toneFor(percent: number): 'verified' | 'boost' | 'danger' {
  if (percent >= 70) return 'verified'
  if (percent >= 40) return 'boost'
  return 'danger'
}

function QuestionResult({ question, index }: { question: AttemptResultQuestion; index: number }) {
  const correct = question.isCorrect
  const partial = !correct && question.earned > 0

  return (
    <div
      className={[
        'rounded-card border p-4',
        correct
          ? 'border-verified/30 bg-verified/5'
          : partial
            ? 'border-boost/30 bg-boost/5'
            : 'border-danger/25 bg-danger/5',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">Q{index + 1}</span>
          {question.topicTag && <Badge tone="neutral">{question.topicTag}</Badge>}
          {question.section && <Badge tone="neutral">{SECTION_LABELS[question.section]}</Badge>}
        </div>
        <Badge tone={correct ? 'verified' : partial ? 'boost' : 'danger'}>
          {question.earned}/{question.points}
          {correct ? ' ✓' : partial ? ' partial' : question.answered ? ' ✗' : ' skipped'}
        </Badge>
      </div>

      {question.type === 'coding' ? (
        <>
          <p className="mt-2 line-clamp-2 text-sm text-ink/70">{question.statement}</p>
          {question.codeRunResults ? (
            <p className="mt-2 text-sm font-medium text-ink">
              {question.codeRunResults.passedCount} / {question.codeRunResults.totalCount} hidden test
              cases passed
              {question.codeRunResults.compileError && ' — compilation failed'}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink/50">Not submitted for judging.</p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium text-ink">{question.question}</p>
          {question.options && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {question.options.map((option, optionIndex) => {
                const isCorrectOption = (question.correctAnswer as { index?: number } | null)?.index === optionIndex
                const isYours = (question.yourResponse as { index?: number } | null)?.index === optionIndex
                return (
                  <li
                    key={optionIndex}
                    className={[
                      'rounded px-2.5 py-1.5 text-sm',
                      isCorrectOption
                        ? 'bg-verified/15 font-semibold text-ink'
                        : isYours
                          ? 'bg-danger/10 text-ink'
                          : 'text-ink/60',
                    ].join(' ')}
                  >
                    {option}
                    {isCorrectOption && <span className="ml-2 text-xs text-verified">correct answer</span>}
                    {isYours && !isCorrectOption && (
                      <span className="ml-2 text-xs text-danger">your answer</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {/* Non-MCQ interactive questions have no option list to mark up, so
              the answer key is shown as raw values instead. */}
          {!question.options && question.correctAnswer && (
            <div className="mt-3 rounded bg-verified/10 px-3 py-2 text-sm">
              <span className="font-semibold text-ink">Correct answer: </span>
              <span className="font-mono text-ink/80">
                {Object.values(question.correctAnswer).flat().join(', ')}
              </span>
            </div>
          )}
          {question.explanation && (
            <p className="mt-3 border-t border-line pt-2 text-sm text-ink/60">
              <span className="font-semibold text-ink/80">Why: </span>
              {question.explanation}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function TestResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await getAttemptResult(attemptId)
        if (!cancelled) setResult(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your result')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attemptId])

  if (loading) return <PageLoader label="Scoring your test…" />

  if (error || !result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Result not available.'}</p>
        </Card>
        <SupportNote className="mt-6" />
      </div>
    )
  }

  const { attempt, contest, analysis } = result
  const tone = toneFor(attempt.percent)
  const sectionEntries = Object.entries(attempt.sectionScores)

  return (
    <div className="mx-auto max-w-app-narrow px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow={CONTEST_TYPE_META[contest.type].label}
        title={`${attempt.score} / ${attempt.maxScore}`}
        subtitle={`${contest.title} — ${attempt.percent}% scored`}
        meta={
          <>
            <Badge tone={COMPLEXITY_META[contest.complexity].tone}>
              {COMPLEXITY_META[contest.complexity].label}
            </Badge>
            <Badge tone={tone}>{attempt.percent}%</Badge>
            {result.rank === 1 && <Badge tone="boost">🏆 Rank #1</Badge>}
          </>
        }
        actions={
          <>
            <Link to={`/contests/${contest.type}`}>
              <Button variant="outlineInverse" size="sm">
                More tests
              </Button>
            </Link>
            <Link to={`/contests/leaderboard?type=${contest.type}`}>
              <Button variant="inverse" size="sm">
                Leaderboard
              </Button>
            </Link>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat label="Score" value={`${attempt.percent}%`} hint={`${attempt.score} of ${attempt.maxScore}`} />
          <HeroStat
            label="Time taken"
            value={formatDuration(attempt.timeTakenSeconds)}
            hint={`of ${contest.timeLimitMinutes}m`}
          />
          <HeroStat label="Rank" value={`#${result.rank}`} hint={`of ${result.totalParticipants}`} />
          <HeroStat
            label="Correct"
            value={`${result.questions.filter((q) => q.isCorrect).length}/${result.questions.length}`}
          />
        </div>
      </PageHero>

      {/* Section breakdown — Quant only, since only its questions carry a section. */}
      {sectionEntries.length > 0 && (
        <Card className="mt-8">
          <h2 className="text-lg font-semibold text-ink">Section breakdown</h2>
          <div className="mt-4 flex flex-col gap-4">
            {sectionEntries.map(([section, scores]) => {
              const percent = scores.max > 0 ? Math.round((scores.score / scores.max) * 100) : 0
              return (
                <div key={section}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-ink">
                      {SECTION_LABELS[section] ?? section}
                    </p>
                    <p className="text-sm text-ink/60">
                      {scores.score}/{scores.max}{' '}
                      <span className="font-semibold text-ink">({percent}%)</span>
                    </p>
                  </div>
                  <div className="mt-1.5">
                    <Meter percent={percent} tone={toneFor(percent)} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Strengths / weak areas */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Strengths &amp; weak areas</h2>
        {analysis.strengths.length === 0 && analysis.weaknesses.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">
            Not enough questions per topic in this test to call a strength or a weakness yet — take a
            few more and this fills in.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {analysis.strengths.length > 0 && (
              <p className="text-sm text-ink/80">
                <span className="font-semibold text-verified">Strong in:</span>{' '}
                {analysis.strengths.join(', ')}
              </p>
            )}
            {analysis.weaknesses.length > 0 && (
              <p className="text-sm text-ink/80">
                <span className="font-semibold text-danger">Needs work:</span>{' '}
                {analysis.weaknesses.join(', ')}
              </p>
            )}
          </div>
        )}

        {analysis.byTopic.length > 0 && (
          <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
            {analysis.byTopic.map((topic) => (
              <div key={topic.topic}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-ink">{topic.topic}</p>
                  <p className="text-xs text-ink/50">
                    {topic.percent}% · {topic.questions} question{topic.questions === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="mt-1">
                  <Meter percent={topic.percent} tone={toneFor(topic.percent)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Per-question */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Question by question</h2>
        <p className="mt-1 text-sm text-ink/60">
          Answers and explanations are released now that the test is submitted.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {result.questions.map((question, index) => (
            <QuestionResult key={question.id} question={question} index={index} />
          ))}
        </div>
      </Card>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={`/contests/${contest.type}`}>
          <Button variant="secondary">Take another test</Button>
        </Link>
        <Link to={`/contests/leaderboard?type=${contest.type}`}>
          <Button>View full leaderboard</Button>
        </Link>
      </div>

      <SupportNote className="mt-8">Think a question was scored wrongly?</SupportNote>
    </div>
  )
}
