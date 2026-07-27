import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for the verifier-facing endpoints. One
// function per endpoint, typed request/response per the Phase-4 API contract.
// Mirrors candidateApi.ts / companyApi.ts's style — keep this file flat, no
// client-side caching/state here, callers own that.

export type CandidateCategory = 'fresher' | 'experienced' | 'executive'

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
// Track 1 — profile queue
// ---------------------------------------------------------------------------

export interface ProfileQueueRow {
  id: string
  userId: string
  fullName: string | null
  category: CandidateCategory
  status: 'submitted' | 'under_review'
  submittedAt: string | null
  primaryRole: { id: string; roleName: string } | null
  assignedVerifierId: string | null
  assignedVerifierName: string | null
}

export function listProfileQueue(category: CandidateCategory) {
  return apiFetch<ProfileQueueRow[]>(`/verify/queue/profiles?category=${category}`)
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

export interface VerifierProfileReview {
  id: string
  userId: string
  fullName: string | null
  phone: string | null
  email: string
  category: CandidateCategory | null
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_info'
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
}

export function getProfileForReview(id: string) {
  return apiFetch<VerifierProfileReview>(`/verify/profiles/${id}`)
}

export type ProfileDecision = 'approved' | 'rejected' | 'needs_info' | 'flagged'

export interface DecideProfileBody {
  decision: ProfileDecision
  reasonId?: string
  note?: string
}

export function decideProfile(id: string, body: DecideProfileBody) {
  return apiFetch<VerifierProfileReview>(`/verify/profiles/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Track 2 — badge & achievement queues
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
// Analytics
// ---------------------------------------------------------------------------

export interface VerifierAnalytics {
  avgTimeToApproveHours: number | null
  backlog: { profilesSubmitted: number; badgesPending: number; achievementsPending: number }
  rejectionReasonBreakdown: { notes: string | null; count: number }[]
}

export function getAnalytics() {
  return apiFetch<VerifierAnalytics>('/verify/analytics')
}
