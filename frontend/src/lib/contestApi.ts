import { apiFetch } from './apiClient'

// Typed wrappers over the contest endpoints. Flat, one function per endpoint,
// no client-side caching — same shape as candidateApi.ts / companyApi.ts.

export type ContestType = 'dsa' | 'domain' | 'quant'
export type ContestComplexity = 'easy' | 'medium' | 'hard'
export type ContestQuestionType = 'coding' | 'mcq' | 'interactive'
export type ContestSection = 'math' | 'reasoning' | 'english'
export type InteractiveKind = 'drag_drop' | 'fill_blank' | 'scenario'

export const CONTEST_TYPE_META: Record<
  ContestType,
  { label: string; blurb: string; icon: string }
> = {
  dsa: {
    label: 'DSA Coding Contest',
    blurb: 'Data structures & algorithms — write real code, judged against hidden test cases.',
    icon: '🧠',
  },
  domain: {
    label: 'Domain Coding Contest',
    blurb: 'Domain-specific challenges: web, backend, databases and system design.',
    icon: '🛠️',
  },
  quant: {
    label: 'Quant Contest',
    blurb: 'Math, Logical Reasoning and English — three sections in one test.',
    icon: '📊',
  },
}

/** The tab order on the contests screen, and the order of the type meta above. */
export const CONTEST_TYPES: ContestType[] = ['dsa', 'domain', 'quant']

/**
 * Narrows an untrusted string (a `?tab=` value, an old `/contests/:type` path
 * segment) to a real contest type. Lives here rather than in a page because
 * both the tabbed screen and the legacy-URL redirect need the same answer.
 */
export function isContestType(value: string | undefined | null): value is ContestType {
  return value === 'dsa' || value === 'domain' || value === 'quant'
}

export const COMPLEXITY_META: Record<
  ContestComplexity,
  { label: string; tone: 'verified' | 'boost' | 'danger' }
> = {
  // Green / amber / red, matching the colour language used for status badges
  // everywhere else in the app.
  easy: { label: 'Easy', tone: 'verified' },
  medium: { label: 'Medium', tone: 'boost' },
  hard: { label: 'Hard', tone: 'danger' },
}

// ---------------------------------------------------------------------------
// Hub & listing
// ---------------------------------------------------------------------------

export interface ContestHubEntry {
  type: ContestType
  testCount: number
  attemptedCount: number
  bestScorePercent: number | null
}

export function getContestHub() {
  return apiFetch<{ contests: ContestHubEntry[]; entryFeeInr: number }>('/contests/hub')
}

export interface ContestListEntry {
  id: string
  type: ContestType
  complexity: ContestComplexity
  title: string
  description: string | null
  timeLimitMinutes: number
  questionCount: number
  attemptCount: number
  bestAttempt: {
    id: string
    score: number
    maxScore: number
    percent: number
    submittedAt: string
  } | null
}

export function listContests(type: ContestType, complexity?: ContestComplexity) {
  const params = new URLSearchParams({ type })
  if (complexity) params.set('complexity', complexity)
  return apiFetch<{ contests: ContestListEntry[] }>(`/contests?${params.toString()}`)
}

// ---------------------------------------------------------------------------
// Taking a test
// ---------------------------------------------------------------------------

export interface CodingContent {
  statement: string
  constraints?: string
  starterCode?: Record<string, string>
}

export interface McqContent {
  question: string
  options: string[]
}

export interface InteractiveContent {
  interactiveKind: InteractiveKind
  question: string
  items?: string[]
  snippet?: string
  parts?: { prompt: string; options: string[] }[]
}

export interface ContestQuestionView {
  id: string
  type: ContestQuestionType
  content: CodingContent & McqContent & InteractiveContent
  topicTag: string | null
  section: ContestSection | null
  sampleTestCases: { stdin: string; expectedOutput: string; explanation?: string }[]
  points: number
  sortOrder: number
  hiddenTestCount: number
}

export interface StartAttemptResponse {
  attempt: { id: string; startedAt: string; maxScore: number; secondsRemaining: number }
  contest: {
    id: string
    type: ContestType
    complexity: ContestComplexity
    title: string
    description: string | null
    timeLimitMinutes: number
  }
  questions: ContestQuestionView[]
  savedResponses: { questionId: string; response: Record<string, unknown> | null }[]
  languages: { id: string; label: string }[]
  hasCodingQuestions: boolean
  /** Whether the code runner is reachable — see backend utils/piston.ts. */
  codeExecution: { ok: boolean; detail: string | null }
}

export function startAttempt(contestId: string) {
  return apiFetch<StartAttemptResponse>(`/contests/${contestId}/attempts`, { method: 'POST' })
}

/** Reload an in-progress attempt — the runner survives a page refresh on this. */
export function resumeAttempt(attemptId: string) {
  return apiFetch<StartAttemptResponse>(`/contests/attempts/${attemptId}`)
}

export function saveResponse(
  attemptId: string,
  questionId: string,
  response: Record<string, unknown> | null,
) {
  return apiFetch<void>(`/contests/attempts/${attemptId}/responses/${questionId}`, {
    method: 'PUT',
    body: JSON.stringify({ response }),
  })
}

export interface CodeRunCase {
  passed: boolean
  stdin?: string
  expectedOutput?: string
  actualOutput?: string
  stderr?: string
  hidden?: boolean
}

export interface RunCodeResponse {
  language: string
  cases: CodeRunCase[]
  passedCount: number
  totalCount: number
  compileError: string | null
}

export function runCode(attemptId: string, questionId: string, language: string, source: string) {
  return apiFetch<RunCodeResponse>(`/contests/attempts/${attemptId}/run`, {
    method: 'POST',
    body: JSON.stringify({ questionId, language, source }),
  })
}

export interface SubmitCodeResponse extends RunCodeResponse {
  questionId: string
  score: number
  maxScore: number
}

export function submitCode(attemptId: string, questionId: string, language: string, source: string) {
  return apiFetch<SubmitCodeResponse>(`/contests/attempts/${attemptId}/submit-code`, {
    method: 'POST',
    body: JSON.stringify({ questionId, language, source }),
  })
}

export function submitAttempt(attemptId: string) {
  return apiFetch<{ attemptId: string }>(`/contests/attempts/${attemptId}/submit`, {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface AttemptResultQuestion {
  id: string
  type: ContestQuestionType
  topicTag: string | null
  section: ContestSection | null
  points: number
  earned: number
  isCorrect: boolean
  answered: boolean
  statement?: string
  question?: string
  options?: string[] | null
  explanation?: string | null
  correctAnswer?: Record<string, unknown> | null
  yourResponse?: Record<string, unknown> | null
  codeRunResults?: { passedCount: number; totalCount: number; compileError: string | null } | null
}

export interface AttemptResult {
  attempt: {
    id: string
    score: number
    maxScore: number
    percent: number
    sectionScores: Record<string, { score: number; max: number }>
    timeTakenSeconds: number | null
    submittedAt: string
  }
  contest: {
    id: string
    type: ContestType
    complexity: ContestComplexity
    title: string
    timeLimitMinutes: number
  }
  rank: number
  totalParticipants: number
  analysis: {
    strengths: string[]
    weaknesses: string[]
    byTopic: { topic: string; percent: number; questions: number }[]
  }
  questions: AttemptResultQuestion[]
}

export function getAttemptResult(attemptId: string) {
  return apiFetch<AttemptResult>(`/contests/attempts/${attemptId}/result`)
}

// ---------------------------------------------------------------------------
// Leaderboard & performance
// ---------------------------------------------------------------------------

export interface LeaderboardRow {
  rank: number
  candidateId: string
  name: string
  totalScore: number
  testsCompleted: number
  isMe: boolean
}

export function getLeaderboard(type: ContestType) {
  return apiFetch<{ rows: LeaderboardRow[]; me: LeaderboardRow | null; totalParticipants: number }>(
    `/contests/leaderboard?type=${type}`,
  )
}

export interface ContestPerformanceEntry {
  type: ContestType
  bestScorePercent: number
  totalScore: number
  testsCompleted: number
  rank: number
  totalParticipants: number
  isTopRank: boolean
  bestTestTitle: string | null
}

export function getMyContestPerformance() {
  return apiFetch<{ performance: ContestPerformanceEntry[] }>('/contests/me/performance')
}

/** Company-facing: the same summary for a candidate they're looking at. */
export function getCandidateContestPerformance(candidateId: string) {
  return apiFetch<{ performance: ContestPerformanceEntry[] }>(
    `/companies/candidates/${candidateId}/contest-performance`,
  )
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminContest extends Omit<ContestListEntry, 'bestAttempt' | 'attemptCount'> {
  published: boolean
  stats: { attempts: number; avgScore: number; avgSeconds: number }
}

export function adminListContests() {
  return apiFetch<{ contests: AdminContest[] }>('/admin/contests')
}

export interface AdminContestBody {
  type: ContestType
  complexity: ContestComplexity
  title: string
  description?: string
  timeLimitMinutes: number
  published: boolean
}

export function adminCreateContest(body: AdminContestBody) {
  return apiFetch<AdminContest>('/admin/contests', { method: 'POST', body: JSON.stringify(body) })
}

export function adminUpdateContest(contestId: string, body: Partial<AdminContestBody>) {
  return apiFetch<AdminContest>(`/admin/contests/${contestId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function adminDeleteContest(contestId: string) {
  return apiFetch<void>(`/admin/contests/${contestId}`, { method: 'DELETE' })
}

/** Admin view of a question — includes the answer key and hidden test cases. */
export interface AdminQuestion {
  id: string
  contestId: string
  type: ContestQuestionType
  content: Record<string, unknown>
  correctAnswer: Record<string, unknown> | null
  topicTag: string | null
  section: ContestSection | null
  sampleTestCases: { stdin: string; expectedOutput: string; explanation?: string }[]
  hiddenTestCases: { stdin: string; expectedOutput: string }[]
  points: number
  sortOrder: number
}

export function adminListQuestions(contestId: string) {
  return apiFetch<{ questions: AdminQuestion[] }>(`/admin/contests/${contestId}/questions`)
}

export function adminCreateQuestion(contestId: string, body: Record<string, unknown>) {
  return apiFetch<AdminQuestion>(`/admin/contests/${contestId}/questions`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function adminUpdateQuestion(questionId: string, body: Record<string, unknown>) {
  return apiFetch<AdminQuestion>(`/admin/contests/questions/${questionId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function adminDeleteQuestion(questionId: string) {
  return apiFetch<void>(`/admin/contests/questions/${questionId}`, { method: 'DELETE' })
}
