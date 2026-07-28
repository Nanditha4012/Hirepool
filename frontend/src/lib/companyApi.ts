import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for the company-facing endpoints. One
// function per endpoint, typed request/response per the Phase-3 API contract.
// Mirrors candidateApi.ts's style — keep this file flat, no client-side
// caching/state here, callers own that.

// Re-export master-data wrappers from candidateApi.ts rather than duplicating
// them — the endpoints and shapes are identical for both roles.
export {
  listRoles,
  listSkills,
  listDomains,
  listCompanies,
  listPlatformBadgeMasters,
  listPlanCatalog,
  type RoleMaster,
  type SkillMaster,
  type DomainMaster,
  type CompanyMaster,
  type PlatformBadgeMaster,
  type PlanCatalogEntry,
} from './candidateApi'

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

export interface CompanyPlan {
  id: string
  name: string
  monthlyUnlocks: number
  monthlyMessageCap: number | null
}

export type CompanySize = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+'

export interface CompanyProfileResponse {
  id: string
  userId: string
  email: string
  companyName: string
  domain: string | null
  verified: boolean
  logoLink: string | null
  website: string | null
  industry: string | null
  size: CompanySize | null
  gstNumber: string | null
  plan: CompanyPlan | null
  remainingUnlocks: number
  unlocksResetAt: string | null
  messagesSentThisPeriod: number
  messagesPeriodResetAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertCompanyProfileBody {
  companyName?: string
  logoLink?: string
  website?: string
  industry?: string
  size?: CompanySize
  gstNumber?: string
}

export function getMyCompanyProfile() {
  return apiFetch<CompanyProfileResponse>('/companies/me/profile')
}

export function upsertMyCompanyProfile(body: UpsertCompanyProfileBody) {
  return apiFetch<CompanyProfileResponse>('/companies/me/profile', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Candidate search
// ---------------------------------------------------------------------------

export type NoticePeriod = 'immediate' | '15_days' | '30_days' | '60_days' | '90_plus_days'

export interface SearchCandidatesParams {
  category?: 'fresher' | 'experienced' | 'executive'
  primaryRoleId?: string
  skillIds?: string
  domainId?: string
  experienceMin?: number
  experienceMax?: number
  location?: string
  noticePeriod?: NoticePeriod
  platformName?: string
  badgeSelected?: string
  questionsSolvedMin?: number
  questionsSolvedMax?: number
  mncAlumni?: 'true' | 'false'
  startupAlumni?: 'true' | 'false'
  faangMaangAlumni?: 'true' | 'false'
  hasResearch?: 'true' | 'false'
  hasHackathonWin?: 'true' | 'false'
  sort?: 'relevance' | 'recent' | 'boosted'
  page?: number
  pageSize?: number
}

export interface CandidateSearchResult {
  id: string
  fullName: string | null
  status: string
  category: 'fresher' | 'experienced' | 'executive' | null
  primaryRole: { id: string; roleName: string } | null
  yearsOfExperience: number | null
  secondaryRoles: { id: string; roleName: string }[]
  skills: { id: string; skillName: string }[]
  domain: { id: string; domainName: string } | null
  resumeLink: string | null
  portfolioLink: string | null
  location: string | null
  noticePeriod: NoticePeriod | null
  isMncAlumni: boolean
  isFaangMaangAlumni: boolean
  isStartupAlumni: boolean
  platformBadges: {
    id: string
    platformName: string
    badgeSelected: string
    platformProfileLink: string
    verificationStatus: 'pending' | 'verified' | 'rejected'
    totalQuestionsSolved: number
  }[]
  verifiedAchievementCounts: { projects: number; research: number; achievements: number }
  isUnlockedByMe: boolean
  phone: string | null
  email: string | null
  whatsappLink: string | null
}

export interface SearchCandidatesResponse {
  results: CandidateSearchResult[]
  page: number
  pageSize: number
  totalCount: number
}

export function searchCandidates(params: SearchCandidatesParams) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const qs = query.toString()
  return apiFetch<SearchCandidatesResponse>(`/companies/search${qs ? `?${qs}` : ''}`)
}

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------

export interface UnlockRow {
  id: string
  companyId: string
  candidateId: string
  unlockedAt: string
  note: string | null
}

export interface UnlockCandidateResponse {
  unlock: UnlockRow
  phone: string | null
  email: string | null
  whatsappLink: string | null
}

export function unlockCandidate(candidateId: string) {
  return apiFetch<UnlockCandidateResponse>('/companies/unlock', {
    method: 'POST',
    body: JSON.stringify({ candidateId }),
  })
}

export interface UnlockedCandidate {
  candidateId: string
  fullName: string | null
  primaryRole: { id: string; roleName: string } | null
  category: string | null
  verifiedAchievementCounts: { projects: number; research: number; achievements: number }
  platformBadges: {
    id: string
    platformName: string
    badgeSelected: string
    platformProfileLink: string
    verificationStatus: string
    totalQuestionsSolved: number
  }[]
  note: string | null
  unlockedAt: string
  phone: string | null
  email: string | null
  whatsappLink: string | null
}

export function listMyUnlocked() {
  return apiFetch<UnlockedCandidate[]>('/companies/me/unlocked')
}

export function updateUnlockNote(candidateId: string, note: string) {
  return apiFetch<UnlockRow>(`/companies/me/unlocked/${candidateId}/note`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  })
}
