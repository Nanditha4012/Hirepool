import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import PageLoader from '@/components/ui/PageLoader'
import SegmentedTabs, { type SegmentedTabOption } from '@/components/ui/SegmentedTabs'
import {
  COMPLEXITY_META,
  CONTEST_TYPE_META,
  adminCreateContest,
  adminCreateQuestion,
  adminDeleteContest,
  adminDeleteQuestion,
  adminListContests,
  adminListQuestions,
  adminUpdateContest,
  adminUpdateQuestion,
  type AdminContest,
  type AdminQuestion,
  type ContestComplexity,
  type ContestQuestionType,
  type ContestType,
} from '@/lib/contestApi'

const TYPE_TABS: SegmentedTabOption<ContestType>[] = [
  { value: 'dsa', label: 'DSA' },
  { value: 'domain', label: 'Domain' },
  { value: 'quant', label: 'Quant' },
]

const COMPLEXITIES: ContestComplexity[] = ['easy', 'medium', 'hard']

const emptyContest = {
  title: '',
  description: '',
  timeLimitMinutes: 30,
  complexity: 'easy' as ContestComplexity,
  published: false,
}

/**
 * Blank question forms per type.
 *
 * `content` and `correctAnswer` are typed loosely here because they genuinely
 * differ per question type; the backend validates each shape as a
 * discriminated union (see adminContestController), so a malformed one is
 * rejected with a specific message rather than silently stored.
 */
type QuestionDraft = {
  id?: string
  type: ContestQuestionType
  topicTag: string
  section: string
  points: number
  sortOrder: number
  // coding
  statement: string
  constraints: string
  sampleTestCases: { stdin: string; expectedOutput: string }[]
  hiddenTestCases: { stdin: string; expectedOutput: string }[]
  // mcq
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  // interactive
  interactiveKind: 'drag_drop' | 'fill_blank' | 'scenario'
  items: string[]
  correctOrder: string[]
  snippet: string
  blanks: string[]
}

function blankQuestion(type: ContestQuestionType): QuestionDraft {
  return {
    type,
    topicTag: '',
    section: '',
    points: type === 'coding' ? 10 : type === 'interactive' ? 2 : 1,
    sortOrder: 0,
    statement: '',
    constraints: '',
    sampleTestCases: [{ stdin: '', expectedOutput: '' }],
    hiddenTestCases: [{ stdin: '', expectedOutput: '' }],
    question: '',
    options: ['', ''],
    correctIndex: 0,
    explanation: '',
    interactiveKind: 'drag_drop',
    items: ['', ''],
    correctOrder: [],
    snippet: '',
    blanks: [''],
  }
}

function questionToDraft(question: AdminQuestion): QuestionDraft {
  const content = question.content as Record<string, unknown>
  const answer = (question.correctAnswer ?? {}) as Record<string, unknown>
  const draft = blankQuestion(question.type)

  return {
    ...draft,
    id: question.id,
    type: question.type,
    topicTag: question.topicTag ?? '',
    section: question.section ?? '',
    points: question.points,
    sortOrder: question.sortOrder,
    statement: (content.statement as string) ?? '',
    constraints: (content.constraints as string) ?? '',
    sampleTestCases: question.sampleTestCases.length
      ? question.sampleTestCases.map((c) => ({ stdin: c.stdin, expectedOutput: c.expectedOutput }))
      : draft.sampleTestCases,
    hiddenTestCases: question.hiddenTestCases.length
      ? question.hiddenTestCases
      : draft.hiddenTestCases,
    question: (content.question as string) ?? '',
    options: (content.options as string[]) ?? draft.options,
    correctIndex: (answer.index as number) ?? 0,
    explanation: (content.explanation as string) ?? '',
    interactiveKind: (content.interactiveKind as QuestionDraft['interactiveKind']) ?? 'drag_drop',
    items: (content.items as string[]) ?? draft.items,
    correctOrder: (answer.order as string[]) ?? [],
    snippet: (content.snippet as string) ?? '',
    blanks: (answer.blanks as string[]) ?? [''],
  }
}

/** Shapes a draft into the payload the backend's zod schemas expect. */
function draftToBody(draft: QuestionDraft): Record<string, unknown> {
  const base = {
    topicTag: draft.topicTag || undefined,
    section: draft.section || null,
    points: draft.points,
    sortOrder: draft.sortOrder,
  }

  if (draft.type === 'coding') {
    return {
      ...base,
      type: 'coding',
      content: { statement: draft.statement, constraints: draft.constraints || undefined },
      sampleTestCases: draft.sampleTestCases.filter((c) => c.stdin !== '' || c.expectedOutput !== ''),
      hiddenTestCases: draft.hiddenTestCases.filter((c) => c.stdin !== '' || c.expectedOutput !== ''),
    }
  }

  if (draft.type === 'mcq') {
    return {
      ...base,
      type: 'mcq',
      content: {
        question: draft.question,
        options: draft.options.filter((o) => o.trim() !== ''),
        explanation: draft.explanation || undefined,
      },
      correctAnswer: { index: draft.correctIndex },
    }
  }

  const content: Record<string, unknown> = {
    interactiveKind: draft.interactiveKind,
    question: draft.question,
    explanation: draft.explanation || undefined,
  }
  const correctAnswer: Record<string, unknown> = {}

  if (draft.interactiveKind === 'drag_drop') {
    const items = draft.items.filter((i) => i.trim() !== '')
    content.items = items
    // The answer key defaults to the order the admin typed the items in,
    // which is almost always the correct order they had in mind.
    correctAnswer.order = draft.correctOrder.length === items.length ? draft.correctOrder : items
  } else if (draft.interactiveKind === 'fill_blank') {
    content.snippet = draft.snippet
    correctAnswer.blanks = draft.blanks.filter((b) => b.trim() !== '')
  } else {
    content.parts = [{ prompt: draft.question, options: draft.options.filter((o) => o.trim() !== '') }]
    correctAnswer.answers = [draft.correctIndex]
  }

  return { ...base, type: 'interactive', content, correctAnswer }
}

function ListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="mt-1 flex flex-col gap-2">
        {values.map((value, index) => (
          <div key={index} className="flex gap-2">
            <Input
              className="flex-1"
              value={value}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...values]
                next[index] = e.target.value
                onChange(next)
              }}
            />
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
              className="rounded-card border border-line px-3 text-ink/50 hover:border-danger hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="mt-2 text-sm font-semibold text-primary hover:underline"
      >
        + Add
      </button>
    </div>
  )
}

function TestCaseEditor({
  label,
  hint,
  cases,
  onChange,
}: {
  label: string
  hint: string
  cases: { stdin: string; expectedOutput: string }[]
  onChange: (next: { stdin: string; expectedOutput: string }[]) => void
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink/50">{hint}</p>
      <div className="mt-2 flex flex-col gap-2">
        {cases.map((testCase, index) => (
          <div key={index} className="flex gap-2">
            <textarea
              value={testCase.stdin}
              placeholder="stdin"
              rows={2}
              onChange={(e) => {
                const next = [...cases]
                next[index] = { ...next[index], stdin: e.target.value }
                onChange(next)
              }}
              className="flex-1 rounded-card border border-line bg-card p-2 font-mono text-xs text-ink"
            />
            <textarea
              value={testCase.expectedOutput}
              placeholder="expected output"
              rows={2}
              onChange={(e) => {
                const next = [...cases]
                next[index] = { ...next[index], expectedOutput: e.target.value }
                onChange(next)
              }}
              className="flex-1 rounded-card border border-line bg-card p-2 font-mono text-xs text-ink"
            />
            <button
              type="button"
              aria-label="Remove test case"
              onClick={() => onChange(cases.filter((_, i) => i !== index))}
              className="rounded-card border border-line px-3 text-ink/50 hover:border-danger hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...cases, { stdin: '', expectedOutput: '' }])}
        className="mt-2 text-sm font-semibold text-primary hover:underline"
      >
        + Add test case
      </button>
    </div>
  )
}

export default function AdminContestsPage() {
  const [type, setType] = useState<ContestType>('dsa')
  const [contests, setContests] = useState<AdminContest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newContest, setNewContest] = useState(emptyContest)

  const [openContestId, setOpenContestId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [draft, setDraft] = useState<QuestionDraft | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminListContests()
      setContests(result.contests)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => contests.filter((c) => c.type === type), [contests, type])

  const openQuestions = async (contestId: string) => {
    if (openContestId === contestId) {
      setOpenContestId(null)
      return
    }
    setOpenContestId(contestId)
    setDraft(null)
    setQuestionsLoading(true)
    try {
      const result = await adminListQuestions(contestId)
      setQuestions(result.questions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load questions')
    } finally {
      setQuestionsLoading(false)
    }
  }

  const handleTogglePublish = async (contest: AdminContest) => {
    setBusy(contest.id)
    try {
      await adminUpdateContest(contest.id, { published: !contest.published })
      setContests((prev) =>
        prev.map((c) => (c.id === contest.id ? { ...c, published: !c.published } : c)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteContest = async (contest: AdminContest) => {
    // Deleting cascades to every attempt candidates have already made against
    // this test, so it is confirmed explicitly and Unpublish is offered as the
    // non-destructive alternative right next to it.
    if (
      !window.confirm(
        `Delete "${contest.title}"? This also deletes ${contest.stats.attempts} candidate attempt(s). Unpublish instead if you only want to hide it.`,
      )
    ) {
      return
    }
    setBusy(contest.id)
    try {
      await adminDeleteContest(contest.id)
      setContests((prev) => prev.filter((c) => c.id !== contest.id))
      if (openContestId === contest.id) setOpenContestId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(null)
    }
  }

  const handleCreateContest = async () => {
    setBusy('new')
    setSaveError(null)
    try {
      await adminCreateContest({ ...newContest, type })
      setNewContest(emptyContest)
      setCreating(false)
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setBusy(null)
    }
  }

  const handleSaveQuestion = async () => {
    if (!draft || !openContestId) return
    setBusy('question')
    setSaveError(null)
    try {
      const body = draftToBody(draft)
      if (draft.id) await adminUpdateQuestion(draft.id, body)
      else await adminCreateQuestion(openContestId, body)
      const result = await adminListQuestions(openContestId)
      setQuestions(result.questions)
      setDraft(null)
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save question')
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this question?')) return
    setBusy(questionId)
    try {
      await adminDeleteQuestion(questionId)
      setQuestions((prev) => prev.filter((q) => q.id !== questionId))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete question')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PageLoader label="Loading contests…" />

  return (
    <div className="mx-auto max-w-app px-4 py-8 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Contests</h1>
          <p className="mt-1 text-sm text-ink/60">
            Create tests and questions, publish or unpublish them, and see how candidates are doing.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((open) => !open)}>
          {creating ? 'Cancel' : 'New test'}
        </Button>
      </div>

      {error && (
        <Card className="mt-4 border border-danger/30 bg-danger/5">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      <div className="mt-6">
        <SegmentedTabs aria-label="Contest type" options={TYPE_TABS} value={type} onChange={setType} />
      </div>

      {creating && (
        <Card className="mt-6">
          <h2 className="font-semibold text-ink">New {CONTEST_TYPE_META[type].label}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              value={newContest.title}
              onChange={(e) => setNewContest({ ...newContest, title: e.target.value })}
            />
            <Select
              label="Complexity"
              options={COMPLEXITIES.map((c) => ({ value: c, label: COMPLEXITY_META[c].label }))}
              value={newContest.complexity}
              onChange={(e) =>
                setNewContest({ ...newContest, complexity: e.target.value as ContestComplexity })
              }
            />
            <Input
              label="Time limit (minutes)"
              type="number"
              min={1}
              value={String(newContest.timeLimitMinutes)}
              onChange={(e) =>
                setNewContest({ ...newContest, timeLimitMinutes: Number(e.target.value) || 30 })
              }
            />
            <Input
              label="Description"
              value={newContest.description}
              onChange={(e) => setNewContest({ ...newContest, description: e.target.value })}
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={newContest.published}
              onChange={(e) => setNewContest({ ...newContest, published: e.target.checked })}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            Publish immediately
          </label>
          {saveError && <p className="mt-2 text-sm text-danger">{saveError}</p>}
          <Button
            className="mt-4"
            size="sm"
            loading={busy === 'new'}
            disabled={!newContest.title.trim()}
            onClick={handleCreateContest}
          >
            Create test
          </Button>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {visible.length === 0 && (
          <Card>
            <p className="text-ink/60">No {CONTEST_TYPE_META[type].label} tests yet.</p>
          </Card>
        )}

        {visible.map((contest) => (
          <Card key={contest.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{contest.title}</h3>
                  <Badge tone={COMPLEXITY_META[contest.complexity].tone}>
                    {COMPLEXITY_META[contest.complexity].label}
                  </Badge>
                  <Badge tone={contest.published ? 'verified' : 'neutral'}>
                    {contest.published ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink/60">
                  {contest.questionCount} questions · {contest.timeLimitMinutes} min
                </p>
                <p className="mt-0.5 text-xs text-ink/40">
                  {contest.stats.attempts} attempt{contest.stats.attempts === 1 ? '' : 's'} · avg score{' '}
                  {contest.stats.avgScore} · avg time {Math.round(contest.stats.avgSeconds / 60)}m
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openQuestions(contest.id)}>
                  {openContestId === contest.id ? 'Hide questions' : 'Questions'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === contest.id}
                  onClick={() => handleTogglePublish(contest)}
                >
                  {contest.published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDeleteContest(contest)}>
                  Delete
                </Button>
              </div>
            </div>

            {openContestId === contest.id && (
              <div className="mt-5 border-t border-line pt-5">
                {questionsLoading ? (
                  <PageLoader compact label="Loading questions…" />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-ink/40">
                        Questions ({questions.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {(['coding', 'mcq', 'interactive'] as ContestQuestionType[]).map((qType) => (
                          <Button
                            key={qType}
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setDraft({ ...blankQuestion(qType), sortOrder: questions.length })
                            }
                          >
                            + {qType}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      {questions.map((question) => {
                        const content = question.content as Record<string, unknown>
                        return (
                          <div
                            key={question.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-ink">
                                <span className="font-mono text-xs text-ink/40">{question.type}</span>{' '}
                                {(content.statement as string) ?? (content.question as string) ?? '—'}
                              </p>
                              <p className="text-xs text-ink/40">
                                {question.points} pts
                                {question.topicTag && ` · ${question.topicTag}`}
                                {question.section && ` · ${question.section}`}
                                {question.hiddenTestCases.length > 0 &&
                                  ` · ${question.hiddenTestCases.length} hidden tests`}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setDraft(questionToDraft(question))}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={busy === question.id}
                                onClick={() => handleDeleteQuestion(question.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {draft && (
                      <Card className="mt-4 border-2 border-primary/30">
                        <h4 className="font-semibold text-ink">
                          {draft.id ? 'Edit' : 'New'} {draft.type} question
                        </h4>

                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <Input
                            label="Topic tag"
                            value={draft.topicTag}
                            placeholder="e.g. Arrays"
                            onChange={(e) => setDraft({ ...draft, topicTag: e.target.value })}
                          />
                          <Select
                            label="Section (Quant only)"
                            options={[
                              { value: '', label: 'None' },
                              { value: 'math', label: 'Math' },
                              { value: 'reasoning', label: 'Reasoning' },
                              { value: 'english', label: 'English' },
                            ]}
                            value={draft.section}
                            onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                          />
                          <Input
                            label="Points"
                            type="number"
                            min={1}
                            value={String(draft.points)}
                            onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) || 1 })}
                          />
                        </div>

                        {draft.type === 'coding' && (
                          <div className="mt-4 flex flex-col gap-4">
                            <div>
                              <p className="text-sm font-medium text-ink">Problem statement</p>
                              <textarea
                                rows={5}
                                value={draft.statement}
                                onChange={(e) => setDraft({ ...draft, statement: e.target.value })}
                                className="mt-1 w-full rounded-card border border-line bg-card p-2 text-sm text-ink"
                              />
                            </div>
                            <Input
                              label="Constraints"
                              value={draft.constraints}
                              onChange={(e) => setDraft({ ...draft, constraints: e.target.value })}
                            />
                            <TestCaseEditor
                              label="Sample test cases"
                              hint="Visible to the candidate, and what Run executes against."
                              cases={draft.sampleTestCases}
                              onChange={(next) => setDraft({ ...draft, sampleTestCases: next })}
                            />
                            <TestCaseEditor
                              label="Hidden test cases"
                              hint="Used for scoring on Submit. Never shown to candidates."
                              cases={draft.hiddenTestCases}
                              onChange={(next) => setDraft({ ...draft, hiddenTestCases: next })}
                            />
                          </div>
                        )}

                        {draft.type === 'mcq' && (
                          <div className="mt-4 flex flex-col gap-4">
                            <Input
                              label="Question"
                              value={draft.question}
                              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                            />
                            <ListEditor
                              label="Options"
                              values={draft.options}
                              placeholder="Option text"
                              onChange={(next) => setDraft({ ...draft, options: next })}
                            />
                            <Select
                              label="Correct option"
                              options={draft.options.map((option, index) => ({
                                value: String(index),
                                label: `${index + 1}. ${option || '(empty)'}`,
                              }))}
                              value={String(draft.correctIndex)}
                              onChange={(e) => setDraft({ ...draft, correctIndex: Number(e.target.value) })}
                            />
                            <Input
                              label="Explanation"
                              value={draft.explanation}
                              onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                            />
                          </div>
                        )}

                        {draft.type === 'interactive' && (
                          <div className="mt-4 flex flex-col gap-4">
                            <Select
                              label="Question type"
                              options={[
                                { value: 'drag_drop', label: 'Drag & drop ordering' },
                                { value: 'fill_blank', label: 'Fill in the blank' },
                                { value: 'scenario', label: 'Scenario (multi-part)' },
                              ]}
                              value={draft.interactiveKind}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  interactiveKind: e.target.value as QuestionDraft['interactiveKind'],
                                })
                              }
                            />
                            <Input
                              label="Question / prompt"
                              value={draft.question}
                              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                            />

                            {draft.interactiveKind === 'drag_drop' && (
                              <ListEditor
                                label="Items — type them in the CORRECT order"
                                values={draft.items}
                                placeholder="Step"
                                onChange={(next) =>
                                  setDraft({ ...draft, items: next, correctOrder: next })
                                }
                              />
                            )}

                            {draft.interactiveKind === 'fill_blank' && (
                              <>
                                <div>
                                  <p className="text-sm font-medium text-ink">
                                    Snippet — mark each blank with three underscores (___)
                                  </p>
                                  <textarea
                                    rows={4}
                                    value={draft.snippet}
                                    onChange={(e) => setDraft({ ...draft, snippet: e.target.value })}
                                    className="mt-1 w-full rounded-card border border-line bg-card p-2 font-mono text-sm text-ink"
                                  />
                                </div>
                                <ListEditor
                                  label="Answers, one per blank, in order"
                                  values={draft.blanks}
                                  placeholder="Answer"
                                  onChange={(next) => setDraft({ ...draft, blanks: next })}
                                />
                              </>
                            )}

                            {draft.interactiveKind === 'scenario' && (
                              <>
                                <ListEditor
                                  label="Options for this part"
                                  values={draft.options}
                                  placeholder="Option text"
                                  onChange={(next) => setDraft({ ...draft, options: next })}
                                />
                                <Select
                                  label="Correct option"
                                  options={draft.options.map((option, index) => ({
                                    value: String(index),
                                    label: `${index + 1}. ${option || '(empty)'}`,
                                  }))}
                                  value={String(draft.correctIndex)}
                                  onChange={(e) =>
                                    setDraft({ ...draft, correctIndex: Number(e.target.value) })
                                  }
                                />
                              </>
                            )}

                            <Input
                              label="Explanation"
                              value={draft.explanation}
                              onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                            />
                          </div>
                        )}

                        {saveError && <p className="mt-3 text-sm text-danger">{saveError}</p>}

                        <div className="mt-4 flex gap-3">
                          <Button size="sm" loading={busy === 'question'} onClick={handleSaveQuestion}>
                            Save question
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>
                            Cancel
                          </Button>
                        </div>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
