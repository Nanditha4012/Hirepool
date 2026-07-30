import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import CodeEditor from '@/components/contests/CodeEditor'
import InteractiveQuestion from '@/components/contests/InteractiveQuestion'
import {
  resumeAttempt,
  runCode,
  saveResponse,
  submitAttempt,
  submitCode,
  type ContestQuestionView,
  type ContestSection,
  type RunCodeResponse,
  type StartAttemptResponse,
} from '@/lib/contestApi'

const SECTION_LABELS: Record<ContestSection, string> = {
  math: 'Math',
  reasoning: 'Reasoning',
  english: 'English',
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

type ResponseMap = Record<string, Record<string, unknown> | null>

export default function TestRunnerPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // startAttempt already returned the whole payload, so the common path
  // (clicking Start) needs no second request. A refresh loses that state, and
  // falls back to the resume endpoint.
  const seeded = (location.state as { started?: StartAttemptResponse } | null)?.started ?? null

  const [data, setData] = useState<StartAttemptResponse | null>(seeded)
  const [loading, setLoading] = useState(!seeded)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [current, setCurrent] = useState(0)
  const [responses, setResponses] = useState<ResponseMap>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [navOpen, setNavOpen] = useState(false)

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Coding-question state, keyed by question id so switching questions and
  // coming back doesn't lose the editor contents.
  const [language, setLanguage] = useState<Record<string, string>>({})
  const [source, setSource] = useState<Record<string, string>>({})
  const [runResult, setRunResult] = useState<Record<string, RunCodeResponse | null>>({})
  const [running, setRunning] = useState(false)
  const [codeSubmitting, setCodeSubmitting] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [lockedQuestions, setLockedQuestions] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (seeded || !attemptId) return
    let cancelled = false
    ;(async () => {
      try {
        const result = await resumeAttempt(attemptId)
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this test')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attemptId, seeded])

  // Hydrate saved answers and editor contents from the payload.
  useEffect(() => {
    if (!data) return
    setSecondsLeft(data.attempt.secondsRemaining)

    const initialResponses: ResponseMap = {}
    const initialSource: Record<string, string> = {}
    const initialLanguage: Record<string, string> = {}

    for (const question of data.questions) {
      if (question.type === 'coding') {
        const defaultLanguage = data.languages[0]?.id ?? 'python'
        initialLanguage[question.id] = defaultLanguage
        initialSource[question.id] = question.content.starterCode?.[defaultLanguage] ?? ''
      }
    }
    for (const saved of data.savedResponses) {
      initialResponses[saved.questionId] = saved.response
      const code = saved.response as { language?: string; source?: string } | null
      if (code?.source) {
        initialSource[saved.questionId] = code.source
        if (code.language) initialLanguage[saved.questionId] = code.language
      }
    }

    setResponses(initialResponses)
    setSource(initialSource)
    setLanguage(initialLanguage)
  }, [data])

  const questions = useMemo(() => data?.questions ?? [], [data])
  const question: ContestQuestionView | undefined = questions[current]

  // ------------------------------------------------------------------
  // Submission
  // ------------------------------------------------------------------

  // Held in a ref as well as state so the countdown's auto-submit can check
  // "am I already submitting?" without the interval closing over a stale
  // value and firing submit twice.
  const submittingRef = useRef(false)

  const finishAttempt = useCallback(
    async (reason: 'manual' | 'timeout') => {
      if (!attemptId || submittingRef.current) return
      submittingRef.current = true
      setSubmitting(true)
      setSubmitError(null)
      try {
        await submitAttempt(attemptId)
        navigate(`/contests/result/${attemptId}`, { replace: true, state: { reason } })
      } catch (err) {
        submittingRef.current = false
        setSubmitError(err instanceof Error ? err.message : 'Could not submit this test')
        setSubmitting(false)
      }
    },
    [attemptId, navigate],
  )

  // Countdown. Re-derived from a deadline timestamp rather than decremented,
  // so a backgrounded tab (where browsers throttle timers to once a minute)
  // still shows the true remaining time on return instead of a clock that
  // fell minutes behind.
  useEffect(() => {
    if (data === null || secondsLeft === null) return
    const deadline = Date.now() + secondsLeft * 1000

    const id = window.setInterval(() => {
      const remaining = Math.round((deadline - Date.now()) / 1000)
      setSecondsLeft(remaining)
      if (remaining <= 0) {
        window.clearInterval(id)
        void finishAttempt('timeout')
      }
    }, 1000)

    return () => window.clearInterval(id)
    // Deliberately keyed on the attempt, not on secondsLeft — including
    // secondsLeft would tear down and rebuild the interval every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.attempt.id, finishAttempt])

  // Warn on a browser-level navigation away (reload, tab close, back). The
  // in-app Exit button has its own dialog; this covers everything else.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (submittingRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // ------------------------------------------------------------------
  // Answering
  // ------------------------------------------------------------------

  const persist = useCallback(
    async (questionId: string, response: Record<string, unknown> | null) => {
      if (!attemptId) return
      try {
        await saveResponse(attemptId, questionId, response)
      } catch {
        // Saves are best-effort and fire on every interaction; surfacing a
        // toast per failed keystroke would be noise. The final submit is what
        // actually grades, and it reads from the server's stored responses —
        // so a dropped save shows up there, not silently.
      }
    },
    [attemptId],
  )

  const answer = (questionId: string, response: Record<string, unknown> | null) => {
    setResponses((prev) => ({ ...prev, [questionId]: response }))
    void persist(questionId, response)
  }

  const toggleFlag = (questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  // ------------------------------------------------------------------
  // Code run / submit
  // ------------------------------------------------------------------

  const handleRun = async () => {
    if (!attemptId || !question) return
    setRunning(true)
    setCodeError(null)
    try {
      const result = await runCode(
        attemptId,
        question.id,
        language[question.id] ?? 'python',
        source[question.id] ?? '',
      )
      setRunResult((prev) => ({ ...prev, [question.id]: result }))
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Could not run your code')
    } finally {
      setRunning(false)
    }
  }

  const handleSubmitCode = async () => {
    if (!attemptId || !question) return
    setCodeSubmitting(true)
    setCodeError(null)
    try {
      const result = await submitCode(
        attemptId,
        question.id,
        language[question.id] ?? 'python',
        source[question.id] ?? '',
      )
      setRunResult((prev) => ({ ...prev, [question.id]: result }))
      setResponses((prev) => ({
        ...prev,
        [question.id]: { language: language[question.id], source: source[question.id] },
      }))
      // Locks in the score for this question, per spec.
      setLockedQuestions((prev) => new Set(prev).add(question.id))
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Could not submit your code')
    } finally {
      setCodeSubmitting(false)
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) return <PageLoader label="Opening your test…" />

  if (loadError || !data || !question) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-page px-6 text-center">
        <p className="text-danger">{loadError || 'This test could not be opened.'}</p>
        <Button variant="secondary" onClick={() => navigate('/contests')}>
          Back to contests
        </Button>
      </div>
    )
  }

  const answeredCount = questions.filter((q) => {
    const response = responses[q.id]
    return response !== undefined && response !== null && Object.keys(response).length > 0
  }).length

  const isLowTime = secondsLeft !== null && secondsLeft <= 60
  const sections = [...new Set(questions.map((q) => q.section).filter(Boolean))] as ContestSection[]
  const isLocked = lockedQuestions.has(question.id)
  const currentRun = runResult[question.id] ?? null

  const statusFor = (q: ContestQuestionView) => {
    const response = responses[q.id]
    const answered = response !== undefined && response !== null && Object.keys(response).length > 0
    if (flagged.has(q.id)) return 'flagged'
    return answered ? 'answered' : 'unanswered'
  }

  const chipClass = (status: string, isCurrent: boolean) =>
    [
      'flex h-9 w-9 items-center justify-center rounded-card text-sm font-semibold transition-all',
      isCurrent ? 'ring-2 ring-offset-2 ring-primary' : '',
      status === 'answered'
        ? 'bg-verified text-white'
        : status === 'flagged'
          ? 'bg-boost text-white'
          : 'border border-line bg-card text-ink/60 hover:border-primary',
    ].join(' ')

  return (
    // `fixed inset-0` above the app chrome: this is the distraction-free
    // full-screen mode the spec asks for, so the header, footer and bottom nav
    // are all covered rather than merely scrolled past.
    <div className="fixed inset-0 z-[60] flex flex-col bg-page">
      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            aria-expanded={navOpen}
            className="rounded-card border border-line p-2 text-ink lg:hidden"
            aria-label="Toggle question navigator"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{data.contest.title}</p>
            <p className="text-xs text-ink/50">
              Question {current + 1} of {questions.length} · {answeredCount} answered
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          <div
            role="timer"
            aria-live="off"
            className={[
              'rounded-card px-3 py-1.5 font-mono text-lg font-bold tabular-nums',
              isLowTime ? 'animate-pulse bg-danger/10 text-danger' : 'bg-surface text-ink',
            ].join(' ')}
          >
            {secondsLeft === null ? '—' : formatClock(secondsLeft)}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowExitConfirm(true)}>
            Exit
          </Button>
          <Button size="sm" loading={submitting} onClick={() => setShowExitConfirm(true)}>
            Submit
          </Button>
        </div>
      </header>

      {data.hasCodingQuestions && !data.codeExecution.ok && (
        <div className="flex-shrink-0 border-b border-boost/30 bg-boost/10 px-4 py-2 text-xs text-ink/80">
          <span className="font-semibold">Code execution is unavailable.</span>{' '}
          {data.codeExecution.detail} You can still answer every other question — coding questions will
          score 0 until a runner is configured.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Question navigator */}
        <aside
          className={[
            'flex-shrink-0 overflow-y-auto border-r border-line bg-card p-4',
            navOpen ? 'absolute inset-y-0 left-0 z-10 w-64 pt-20' : 'hidden',
            'lg:static lg:block lg:w-56 lg:pt-4',
          ].join(' ')}
        >
          {sections.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">Sections</p>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((section) => {
                  const firstIndex = questions.findIndex((q) => q.section === section)
                  const isActive = question.section === section
                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => {
                        setCurrent(firstIndex)
                        setNavOpen(false)
                      }}
                      className={[
                        'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                        isActive ? 'bg-primary text-white' : 'border border-line text-ink/60 hover:border-primary',
                      ].join(' ')}
                    >
                      {SECTION_LABELS[section]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">Questions</p>
          <div className="grid grid-cols-5 gap-2 lg:grid-cols-4">
            {questions.map((q, index) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setCurrent(index)
                  setNavOpen(false)
                }}
                aria-label={`Question ${index + 1}, ${statusFor(q)}`}
                aria-current={index === current}
                className={chipClass(statusFor(q), index === current)}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <dl className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4 text-xs text-ink/60">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-verified" /> Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-boost" /> Flagged
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-line" /> Not answered
            </div>
          </dl>
        </aside>

        {/* Question body */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {question.type === 'coding' ? (
            // Split screen: statement left, editor right. Stacks on narrow
            // screens, where a side-by-side split leaves neither pane usable.
            <div className="flex h-full flex-col lg:flex-row">
              <section className="min-w-0 overflow-y-auto border-b border-line p-5 lg:w-1/2 lg:border-b-0 lg:border-r">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{question.points} points</Badge>
                  {question.topicTag && <Badge tone="neutral">{question.topicTag}</Badge>}
                  {isLocked && <Badge tone="verified">Submitted</Badge>}
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {question.content.statement}
                </p>
                {question.content.constraints && (
                  <>
                    <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-ink/40">
                      Constraints
                    </h3>
                    <p className="mt-1 font-mono text-sm text-ink/70">{question.content.constraints}</p>
                  </>
                )}

                <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-ink/40">Examples</h3>
                <div className="mt-2 flex flex-col gap-3">
                  {question.sampleTestCases.map((sample, index) => (
                    <div key={index} className="rounded-card border border-line bg-surface p-3 text-sm">
                      <p className="text-xs font-semibold text-ink/50">Input</p>
                      <pre className="mt-0.5 whitespace-pre-wrap font-mono text-ink">{sample.stdin}</pre>
                      <p className="mt-2 text-xs font-semibold text-ink/50">Expected output</p>
                      <pre className="mt-0.5 whitespace-pre-wrap font-mono text-ink">
                        {sample.expectedOutput}
                      </pre>
                      {sample.explanation && (
                        <p className="mt-2 text-xs text-ink/60">{sample.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-ink/40">
                  Submitting runs your code against {question.hiddenTestCount} hidden test case
                  {question.hiddenTestCount === 1 ? '' : 's'} and locks in the score for this question.
                </p>
              </section>

              <section className="flex min-w-0 flex-1 flex-col p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    value={language[question.id] ?? 'python'}
                    onChange={(event) => {
                      const next = event.target.value
                      setLanguage((prev) => ({ ...prev, [question.id]: next }))
                      // Only swap in the new language's starter code if the
                      // candidate hasn't written anything yet — otherwise
                      // changing the dropdown would destroy their solution.
                      const starter = question.content.starterCode?.[next] ?? ''
                      const currentSource = source[question.id] ?? ''
                      const isUntouched = Object.values(question.content.starterCode ?? {}).some(
                        (value) => value === currentSource,
                      )
                      if (!currentSource || isUntouched) {
                        setSource((prev) => ({ ...prev, [question.id]: starter }))
                      }
                    }}
                    disabled={isLocked}
                    className="rounded-card border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink"
                  >
                    {data.languages.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={running}
                      disabled={isLocked}
                      onClick={handleRun}
                    >
                      Run
                    </Button>
                    <Button size="sm" loading={codeSubmitting} disabled={isLocked} onClick={handleSubmitCode}>
                      {isLocked ? 'Submitted' : 'Submit'}
                    </Button>
                  </div>
                </div>

                <CodeEditor
                  className="mt-3 flex-1"
                  readOnly={isLocked}
                  value={source[question.id] ?? ''}
                  onChange={(value) => setSource((prev) => ({ ...prev, [question.id]: value }))}
                />

                {codeError && <p className="mt-2 text-sm text-danger">{codeError}</p>}

                {currentRun && (
                  <div className="mt-3 max-h-56 overflow-y-auto rounded-card border border-line p-3">
                    {currentRun.compileError ? (
                      <>
                        <p className="text-sm font-semibold text-danger">Compilation failed</p>
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-danger">
                          {currentRun.compileError}
                        </pre>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-ink">
                          {currentRun.passedCount} / {currentRun.totalCount} test cases passed
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          {currentRun.cases.map((testCase, index) => (
                            <div
                              key={index}
                              className={[
                                'rounded border p-2 text-xs',
                                testCase.passed
                                  ? 'border-verified/30 bg-verified/5'
                                  : 'border-danger/30 bg-danger/5',
                              ].join(' ')}
                            >
                              <p className={testCase.passed ? 'text-verified' : 'text-danger'}>
                                Test {index + 1}: {testCase.passed ? 'Passed' : 'Failed'}
                                {testCase.hidden && ' (hidden)'}
                              </p>
                              {/* Hidden cases carry no stdin/expected — the
                                  backend strips them, so nothing to show. */}
                              {!testCase.hidden && !testCase.passed && (
                                <div className="mt-1 grid gap-1 font-mono text-ink/70 sm:grid-cols-2">
                                  <div>
                                    <span className="text-ink/40">Expected: </span>
                                    {testCase.expectedOutput}
                                  </div>
                                  <div>
                                    <span className="text-ink/40">Got: </span>
                                    {testCase.actualOutput || '(nothing)'}
                                  </div>
                                </div>
                              )}
                              {testCase.stderr && (
                                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-danger">
                                  {testCase.stderr}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{question.points} point{question.points === 1 ? '' : 's'}</Badge>
                {question.section && <Badge tone="neutral">{SECTION_LABELS[question.section]}</Badge>}
                {question.topicTag && <Badge tone="neutral">{question.topicTag}</Badge>}
              </div>

              <div className="mt-5">
                {question.type === 'mcq' ? (
                  <>
                    <p className="text-lg font-medium text-ink">{question.content.question}</p>
                    <div className="mt-5 flex flex-col gap-2">
                      {question.content.options.map((option, index) => {
                        const selected = (responses[question.id] as { index?: number } | null)?.index === index
                        return (
                          <label
                            key={index}
                            className={[
                              'flex cursor-pointer items-start gap-3 rounded-card border p-3 text-sm transition-colors',
                              selected
                                ? 'border-primary bg-primary/5 text-ink'
                                : 'border-line text-ink/80 hover:border-primary/40',
                            ].join(' ')}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              checked={selected}
                              onChange={() => answer(question.id, { index })}
                              className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                            />
                            <span>{option}</span>
                          </label>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <InteractiveQuestion
                    content={question.content}
                    response={responses[question.id] ?? null}
                    onChange={(response) => answer(question.id, response)}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom bar */}
      <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-line bg-card px-4 py-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={current === 0}
          onClick={() => setCurrent((index) => Math.max(0, index - 1))}
        >
          Previous
        </Button>

        <button
          type="button"
          onClick={() => toggleFlag(question.id)}
          className={[
            'rounded-card px-3 py-1.5 text-sm font-semibold transition-colors',
            flagged.has(question.id)
              ? 'bg-boost/15 text-boost'
              : 'border border-line text-ink/60 hover:border-boost hover:text-boost',
          ].join(' ')}
        >
          {flagged.has(question.id) ? '★ Flagged' : '☆ Flag for review'}
        </button>

        {current === questions.length - 1 ? (
          <Button size="sm" loading={submitting} onClick={() => setShowExitConfirm(true)}>
            Finish test
          </Button>
        ) : (
          <Button size="sm" onClick={() => setCurrent((index) => Math.min(questions.length - 1, index + 1))}>
            Next
          </Button>
        )}
      </footer>

      {showExitConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="exit-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm animate-scale-in rounded-card border border-line bg-card p-6 shadow-lift">
            <h2 id="exit-title" className="text-lg font-bold text-ink">
              Submit and finish?
            </h2>
            <p className="mt-2 text-sm text-ink/70">
              You&apos;ve answered <span className="font-semibold text-ink">{answeredCount}</span> of{' '}
              {questions.length} questions. Leaving submits the test — it can&apos;t be resumed
              afterwards.
            </p>
            {submitError && <p className="mt-3 text-sm text-danger">{submitError}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button loading={submitting} onClick={() => finishAttempt('manual')}>
                Submit test
              </Button>
              <Button variant="secondary" disabled={submitting} onClick={() => setShowExitConfirm(false)}>
                Keep working
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
