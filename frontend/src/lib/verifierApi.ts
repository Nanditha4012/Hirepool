import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for the verifier-facing endpoints. One
// function per endpoint, typed request/response per the API contract.
// Mirrors candidateApi.ts / companyApi.ts's style — keep this file flat, no
// client-side caching/state here, callers own that.

export type CandidateCategory = 'fresher' | 'experienced' | 'executive'

export type CandidateStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_info'

/**
 * The three catalogs the portal is organised around. These are buckets over
 * `status`, not statuses themselves — see the CATALOGS map in
 * backend/src/controllers/verifierController.ts for the exact grouping.
 */
export type Catalog = 'unverified' | 'verified' | 'rejected'

export const CATALOG_LABELS: Record<Catalog, string> = {
  unverified: 'Unverified',
  verified: 'Verified',
  rejected: 'Rejected',
}

// ---------------------------------------------------------------------------
// Rejection reasons master (public, no auth)
// ---------------------------------------------------------------------------

export interface RejectionReason {
  id: string
  scope: 'profile' | 'item'
  reasonText: string
}

export function listRejectionReasons(scope: 'profile' | 'item') {
  return apiFetch<RejectionReason[]>(`/masters/rejection-reasons?scope=${scope}`, { auth: false })
}

// ---------------------------------------------------------------------------
// Catalogs & profile management
// ---------------------------------------------------------------------------

export interface ProfileQueueRow {
  id: string
  userId: string
  fullName: string | null
  email: string | null
  category: CandidateCategory | null
  status: CandidateStatus
  submittedAt: string | null
  updatedAt: string
  primaryRole: { id: string; roleName: string } | null
  assignedVerifierId: string | null
  assignedVerifierName: string | null
  pendingReverification: boolean
  reverificationRequestedAt: string | null
  checksPassed: number
  checksFailed: number
}

export interface ProfileQueueResponse {
  catalog: Catalog
  counts: Record<Catalog, number>
  rows: ProfileQueueRow[]
}

export interface QueueFilters {
  catalog: Catalog
  category?: CandidateCategory | null
  q?: string
}

export function listProfileQueue({ catalog, category, q }: QueueFilters) {
  const params = new URLSearchParams({ catalog })
  if (category) params.set('category', category)
  if (q?.trim()) params.set('q', q.trim())
  return apiFetch<ProfileQueueResponse>(`/verify/queue/profiles?${params.toString()}`)
}

export interface ManagementFilters {
  status?: CandidateStatus | null
  category?: CandidateCategory | null
  q?: string
  mine?: boolean
}

export function listAllProfiles({ status, category, q, mine }: ManagementFilters = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (category) params.set('category', category)
  if (q?.trim()) params.set('q', q.trim())
  if (mine) params.set('mine', 'true')
  const query = params.toString()
  return apiFetch<ProfileQueueRow[]>(`/verify/profiles${query ? `?${query}` : ''}`)
}

export interface ClaimedProfile {
  id: string
  userId: string
  status: string
  assignedVerifierId: string | null
  [key: string]: unknown
}

export function claimProfile(id: string) {
  return apiFetch<ClaimedProfile>(`/verify/profiles/${id}/claim`, { method: 'POST' })
}

// ---------------------------------------------------------------------------
// Profile review
// ---------------------------------------------------------------------------

export interface VerifierPlatformBadge {
  id: string
  candidateId: string
  platformName: string
  badgeSelected: string
  platformProfileLink: string
  verificationStatus: 'pending' | 'verified' | 'rejected'
  rejectionReason: string | null
  totalQuestionsSolved: number
  createdAt: string
  updatedAt: string
}

export interface VerifierAchievement {
  id: string
  candidateId: string
  type: 'project' | 'research' | 'achievement'
  title: string
  description: string | null
  links: string | null
  certificateOrProofLink: string
  verificationStatus: 'pending' | 'verified' | 'rejected'
  rejectionReason: string | null
  createdAt: string
}

export type ChecklistGroup = 'identity' | 'profile' | 'experience' | 'proof'

export const CHECKLIST_GROUP_LABELS: Record<ChecklistGroup, string> = {
  identity: 'Identity',
  profile: 'Profile details',
  experience: 'Work experience',
  proof: 'Proof & links',
}

/** One row the verifier says Yes/No to. Built server-side — see buildChecklist. */
export interface ChecklistItem {
  fieldKey: string
  label: string
  value: string | null
  link: string | null
  group: ChecklistGroup
  required: boolean
  hint: string | null
}

/** The current (newest) verdict on a field. */
export interface FieldCheck {
  fieldKey: string
  fieldLabel: string | null
  passed: boolean
  reasonId: string | null
  reasonText: string | null
  reviewerId: string
  checkedAt: string
}

export type TimelineKind = 'submitted' | 'decision' | 'field_check' | 'reverification_requested'

export interface TimelineEntry {
  id: string
  kind: TimelineKind
  at: string
  title: string
  detail: string | null
  actorId: string | null
  actorName: string | null
  tone: 'pass' | 'fail' | 'neutral'
}

export interface VerifierProfileReview {
  id: string
  userId: string
  fullName: string | null
  phone: string | null
  email: string
  category: CandidateCategory | null
  status: CandidateStatus
  primaryRole: { id: string; roleName: string } | null
  designationRole: { id: string; roleName: string } | null
  domain: { id: string; domainName: string } | null
  currentCompany: { id: string; companyName: string } | null
  resumeLink: string | null
  portfolioLink: string | null
  yearsOfExperience: number | null
  offerLetterOrLinkedinLink: string | null
  companyType: 'mnc' | 'startup' | 'agency' | null
  teamSizeManaged: number | null
  budgetOwned: string | null
  titleLevel: string | null
  location: string | null
  noticePeriod: 'immediate' | '15_days' | '30_days' | '60_days' | '90_plus_days' | null
  isActivelyLooking: boolean
  secondaryRoles: { id: string; roleName: string }[]
  skills: { id: string; skillName: string }[]
  latestVerificationNote: string | null
  createdAt: string
  updatedAt: string
  platformBadges: VerifierPlatformBadge[]
  achievements: VerifierAchievement[]
  submittedAt: string | null
  assignedVerifierId: string | null
  assignedVerifierName: string | null
  pendingReverification: boolean
  reverificationRequestedAt: string | null
  checklist: ChecklistItem[]
  fieldChecks: FieldCheck[]
  timeline: TimelineEntry[]
}

export function getProfileForReview(id: string) {
  return apiFetch<VerifierProfileReview>(`/verify/profiles/${id}`)
}

export function getProfileTimeline(id: string) {
  return apiFetch<TimelineEntry[]>(`/verify/profiles/${id}/timeline`)
}

/** A Yes/No the verifier is submitting. `reasonId`/`note` justify a No. */
export interface FieldCheckInput {
  fieldKey: string
  fieldLabel?: string
  passed: boolean
  reasonId?: string
  note?: string
}

export function saveFieldChecks(id: string, checks: FieldCheckInput[]) {
  return apiFetch<VerifierProfileReview>(`/verify/profiles/${id}/field-checks`, {
    method: 'POST',
    body: JSON.stringify({ checks }),
  })
}

export type ProfileDecision = 'approved' | 'rejected' | 'needs_info' | 'flagged'

export interface DecideProfileBody {
  decision: ProfileDecision
  reasonId?: string
  note?: string
  /** Unsaved verdicts, committed in the same transaction as the decision. */
  fieldChecks?: FieldCheckInput[]
}

export function decideProfile(id: string, body: DecideProfileBody) {
  return apiFetch<VerifierProfileReview>(`/verify/profiles/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function reopenProfile(id: string, note: string) {
  return apiFetch<VerifierProfileReview>(`/verify/profiles/${id}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

// ---------------------------------------------------------------------------
// Badge & achievement queues
// ---------------------------------------------------------------------------

export interface BadgeQueueRow {
  id: string
  candidateId: string
  candidateFullName: string | null
  platformName: string
  badgeSelected: string
  platformProfileLink: string
  verificationStatus: 'pending'
  totalQuestionsSolved: number
  createdAt: string
  updatedAt: string
}

export function listBadgeQueue() {
  return apiFetch<BadgeQueueRow[]>('/verify/queue/badges')
}

export type ItemDecision = 'verified' | 'incorrect'

export interface DecideItemBody {
  decision: ItemDecision
  reasonId?: string
  note?: string
}

export function decideBadge(id: string, body: DecideItemBody) {
  return apiFetch<BadgeQueueRow>(`/verify/badges/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface AchievementQueueRow {
  id: string
  candidateId: string
  candidateFullName: string | null
  type: 'project' | 'research' | 'achievement'
  title: string
  description: string | null
  links: string | null
  certificateOrProofLink: string
  verificationStatus: 'pending'
  createdAt: string
}

export function listAchievementQueue(type?: 'project' | 'research' | 'achievement') {
  const query = type ? `?type=${type}` : ''
  return apiFetch<AchievementQueueRow[]>(`/verify/queue/achievements${query}`)
}

export function decideAchievement(id: string, body: DecideItemBody) {
  return apiFetch<AchievementQueueRow>(`/verify/achievements/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Analytics + the verifier's own account
// ---------------------------------------------------------------------------

export interface VerifierAnalytics {
  avgTimeToApproveHours: number | null
  backlog: { profilesSubmitted: number; badgesPending: number; achievementsPending: number }
  rejectionReasonBreakdown: { notes: string | null; count: number }[]
}

export function getAnalytics() {
  return apiFetch<VerifierAnalytics>('/verify/analytics')
}

export interface VerifierAccount {
  id: string
  email: string
  username: string | null
  fullName: string | null
  phone: string | null
  createdAt: string
  stats: {
    approved: number
    rejected: number
    needsInfo: number
    flagged: number
    fieldChecks: number
    currentlyAssigned: number
    avgTimeToDecideHours: number | null
  }
}

export function getMyVerifierAccount() {
  return apiFetch<VerifierAccount>('/verify/me')
}

export function updateMyVerifierAccount(body: { fullName?: string; phone?: string }) {
  return apiFetch<VerifierAccount>('/verify/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function changeMyVerifierPassword(currentPassword: string, newPassword: string) {
  return apiFetch<void>('/verify/me/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}
