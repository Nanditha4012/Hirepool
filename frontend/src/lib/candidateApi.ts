import { apiFetch } from './apiClient'
import type { CandidateCategory } from './authStore'

// Thin typed wrappers over apiFetch for the candidate-facing endpoints. One
// function per endpoint, typed request/response per the Phase-2 API contract.
// Keep this file flat — no client-side caching/state here, callers own that.

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export interface RoleMaster {
  id: string
  roleName: string
}

export interface SkillMaster {
  id: string
  skillName: string
}

export interface DomainMaster {
  id: string
  domainName: string
}

export interface CompanyMaster {
  id: string
  companyName: string
  isMnc: boolean
  isFaangMaang: boolean
}

export interface PlatformBadgeMaster {
  id: string
  platformName: string
  badgeName: string
  sortOrder: number
}

export interface CompanyRequest {
  id: string
  requestedBy: string
  companyName: string
  status: 'pending'
  createdAt: string
}

export function listRoles() {
  return apiFetch<RoleMaster[]>('/masters/roles')
}

export function listSkills() {
  return apiFetch<SkillMaster[]>('/masters/skills')
}

export function listDomains() {
  return apiFetch<DomainMaster[]>('/masters/domains')
}

export function listCompanies() {
  return apiFetch<CompanyMaster[]>('/masters/companies')
}

export function listPlatformBadgeMasters() {
  return apiFetch<PlatformBadgeMaster[]>('/masters/platform-badges')
}

export function requestCompany(companyName: string) {
  return apiFetch<CompanyRequest>('/masters/companies/request', {
    method: 'POST',
    body: JSON.stringify({ companyName }),
  })
}

// ---------------------------------------------------------------------------
// Candidate profile
// ---------------------------------------------------------------------------

export interface CandidateProfileResponse {
  id: string
  userId: string
  fullName: string | null
  phone: string | null
  email: string
  category: CandidateCategory | null
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_info'
  primaryRole: RoleMaster | null
  designationRole: RoleMaster | null
  domain: DomainMaster | null
  currentCompany: { id: string; companyName: string } | null
  resumeLink: string | null
  portfolioLink: string | null
  yearsOfExperience: number | null
  offerLetterOrLinkedinLink: string | null
  companyType: 'mnc' | 'startup' | 'agency' | null
  teamSizeManaged: number | null
  budgetOwned: string | null
  titleLevel: string | null
  isActivelyLooking: boolean
  secondaryRoles: RoleMaster[]
  skills: SkillMaster[]
  latestVerificationNote: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertProfileBody {
  category?: CandidateCategory
  fullName?: string
  phone?: string
  primaryRoleId?: string | null
  secondaryRoleIds?: string[]
  skillIds?: string[]
  domainId?: string | null
  resumeLink?: string
  portfolioLink?: string
  yearsOfExperience?: number
  currentCompanyId?: string | null
  designationRoleId?: string | null
  offerLetterOrLinkedinLink?: string
  companyType?: 'mnc' | 'startup' | 'agency'
  teamSizeManaged?: number
  budgetOwned?: string
  titleLevel?: string
}

export function getMyProfile() {
  return apiFetch<CandidateProfileResponse>('/candidates/me/profile')
}

export function upsertMyProfile(body: UpsertProfileBody) {
  return apiFetch<CandidateProfileResponse>('/candidates/me/profile', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function submitMyProfile() {
  return apiFetch<CandidateProfileResponse>('/candidates/me/profile/submit', {
    method: 'POST',
  })
}

export function setLookingStatus(isActivelyLooking: boolean) {
  return apiFetch<{ isActivelyLooking: boolean; [key: string]: unknown }>('/candidates/me/looking-status', {
    method: 'PATCH',
    body: JSON.stringify({ isActivelyLooking }),
  })
}

// ---------------------------------------------------------------------------
// Platform badges
// ---------------------------------------------------------------------------

export interface PlatformBadgeRow {
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

export interface CreatePlatformBadgeBody {
  platformName: string
  badgeSelected: string
  platformProfileLink: string
  totalQuestionsSolved?: number
}

export interface UpdatePlatformBadgeBody {
  badgeSelected?: string
  platformProfileLink?: string
  totalQuestionsSolved?: number
}

export function listPlatformBadges() {
  return apiFetch<PlatformBadgeRow[]>('/candidates/me/platform-badges')
}

export function createPlatformBadge(body: CreatePlatformBadgeBody) {
  return apiFetch<PlatformBadgeRow>('/candidates/me/platform-badges', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updatePlatformBadge(id: string, body: UpdatePlatformBadgeBody) {
  return apiFetch<PlatformBadgeRow>(`/candidates/me/platform-badges/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deletePlatformBadge(id: string) {
  return apiFetch<void>(`/candidates/me/platform-badges/${id}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export type AchievementType = 'project' | 'research' | 'achievement'

export interface AchievementRow {
  id: string
  candidateId: string
  type: AchievementType
  title: string
  description: string | null
  links: string | null
  certificateOrProofLink: string
  verificationStatus: 'pending' | 'verified' | 'rejected'
  rejectionReason: string | null
  createdAt: string
}

export interface CreateAchievementBody {
  type: AchievementType
  title: string
  description?: string
  links?: string
  certificateOrProofLink: string
}

export interface UpdateAchievementBody {
  title?: string
  description?: string
  links?: string
  certificateOrProofLink?: string
}

export function listAchievements(type?: AchievementType) {
  const query = type ? `?type=${type}` : ''
  return apiFetch<AchievementRow[]>(`/candidates/me/achievements${query}`)
}

export function createAchievement(body: CreateAchievementBody) {
  return apiFetch<AchievementRow>('/candidates/me/achievements', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateAchievement(id: string, body: UpdateAchievementBody) {
  return apiFetch<AchievementRow>(`/candidates/me/achievements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteAchievement(id: string) {
  return apiFetch<void>(`/candidates/me/achievements/${id}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface ThreadMessage {
  id: string
  companyId: string
  candidateId: string
  senderRole: 'company' | 'candidate'
  body: string
  createdAt: string
  readAt: string | null
}

export interface MessageThread {
  companyId: string
  companyName: string | null
  messages: ThreadMessage[]
}

export function listMyThreads() {
  return apiFetch<MessageThread[]>('/candidates/me/messages')
}

export function replyToThread(companyId: string, body: string) {
  return apiFetch<ThreadMessage>(`/candidates/me/messages/${companyId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}
