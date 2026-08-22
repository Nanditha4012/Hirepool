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

/** One verified qualification, as a company sees it. */
export interface CandidateEducationSummary {
  id: string
  level: 'tenth' | 'twelfth' | 'diploma' | 'undergraduate' | 'postgraduate' | 'doctorate'
  institution: string
  boardOrUniversity: string | null
  degree: string | null
  branch: string | null
  startYear: number | null
  endYear: number | null
  isOngoing: boolean
  scoreValue: number | null
  scoreType: string | null
  /** A human verifier signed off, rather than the automated document check. */
  humanVerified: boolean
}

/**
 * A candidate as a company sees them: name, role, skills, experience,
 * education — and nothing else.
 *
 * `resumeLink`, `portfolioLink`, `platformBadges` and the achievement counts
 * were removed from this payload; the server no longer sends them. See the
 * backend's utils/companyVisibleProfile.ts for the reasoning. The resume in
 * particular is deliberate rather than an oversight: a resume PDF carries a
 * personal phone number, an address and every project link, and the platform
 * cannot redact a file it does not own — so companies get the generated
 * profile sheet (see CandidateProfileSheet.tsx) built from the fields below.
 */
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
  education: CandidateEducationSummary[]
  location: string | null
  noticePeriod: NoticePeriod | null
  isMncAlumni: boolean
  isFaangMaangAlumni: boolean
  isStartupAlumni: boolean
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

/** Same visibility boundary as CandidateSearchResult — paying unlocks the
 *  contact details, not a wider view of the profile. */
export interface UnlockedCandidate {
  candidateId: string
  fullName: string | null
  primaryRole: { id: string; roleName: string } | null
  category: string | null
  yearsOfExperience: number | null
  location: string | null
  skills: { id: string; skillName: string }[]
  education: CandidateEducationSummary[]
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
