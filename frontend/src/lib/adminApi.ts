import { apiFetch, getAccessToken } from './apiClient'
import { API_BASE_URL } from './config'

// Thin typed wrappers over apiFetch for the admin-facing endpoints. One
// function per endpoint, typed request/response per adminController.ts /
// adminRoutes.ts. Mirrors companyApi.ts / verifierApi.ts's style — keep this
// file flat, no client-side caching/state here, callers own that. Grouped
// with section comments matching the backend's grouping.

// Re-export master-data list wrappers rather than duplicating them — list is
// public (masterController) for every role, identical shape here.
export {
  listRoles,
  listSkills,
  listDomains,
  listCompanies as listCompanyMasters,
  listPlatformBadgeMasters,
  type RoleMaster,
  type SkillMaster,
  type DomainMaster,
  type CompanyMaster,
  type PlatformBadgeMaster,
} from './candidateApi'
export { listRejectionReasons, type RejectionReason } from './verifierApi'

export type UserRole = 'candidate' | 'company' | 'verifier' | 'admin'
export type UserAccountStatus = 'active' | 'suspended' | 'banned'

export interface AdminListResponse<T> {
  results: T[]
  page: number
  limit: number
  totalCount: number
}

function buildQuery<T extends object>(params: T): string {
  const query = new URLSearchParams()
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

// =======================================================================
// Candidates
// =======================================================================

export type CandidateCategory = 'fresher' | 'experienced' | 'executive'
export type CandidateStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_info'

export interface AdminCandidateListRow {
  id: string
  profileId: string
  email: string | null
  fullName: string | null
  category: CandidateCategory | null
  status: CandidateStatus
  assignedVerifierId: string | null
  createdAt: string
  updatedAt: string
}

export interface ListCandidatesParams {
  status?: CandidateStatus
  category?: CandidateCategory
  q?: string
  page?: number
  limit?: number
}

export function listCandidates(params: ListCandidatesParams = {}) {
  return apiFetch<AdminListResponse<AdminCandidateListRow>>(`/admin/candidates${buildQuery(params)}`)
}

export interface AdminCandidateBadge {
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

export interface AdminCandidateAchievement {
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

export interface AdminVerificationLog {
  id: string
  reviewerId: string
  targetType: 'candidate_profile' | 'platform_badge' | 'achievement'
  targetId: string
  decision: 'approved' | 'rejected' | 'needs_info' | 'flagged' | 'verified' | 'incorrect'
  notes: string | null
  createdAt: string
}

export interface AdminFieldCheck {
  id: string
  profileId: string
  candidateId: string
  reviewerId: string
  fieldKey: string
  fieldLabel: string | null
  passed: boolean
  reasonId: string | null
  reasonText: string | null
  createdAt: string
}

export interface AdminCandidateProfile {
  id: string
  userId: string
  category: CandidateCategory | null
  status: CandidateStatus
  primaryRoleId: string | null
  domainId: string | null
  resumeLink: string | null
  portfolioLink: string | null
  yearsOfExperience: number | null
  currentCompanyId: string | null
  designationRoleId: string | null
  offerLetterOrLinkedinLink: string | null
  companyType: 'mnc' | 'startup' | 'agency' | null
  teamSizeManaged: number | null
  budgetOwned: string | null
  titleLevel: string | null
  isActivelyLooking: boolean
  location: string | null
  noticePeriod: 'immediate' | '15_days' | '30_days' | '60_days' | '90_plus_days' | null
  assignedVerifierId: string | null
  submittedAt: string | null
  pendingReverification: boolean
  reverificationRequestedAt: string | null
  createdAt: string
  updatedAt: string
  primaryRole?: { id: string; roleName: string } | null
  designationRole?: { id: string; roleName: string } | null
  domain?: { id: string; domainName: string } | null
  currentCompany?: { id: string; companyName: string; isMnc: boolean; isFaangMaang: boolean } | null
}

export interface AdminCandidateDetail {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  accountStatus: UserAccountStatus
  statusReason: string | null
  profile: AdminCandidateProfile
  badges: AdminCandidateBadge[]
  achievements: AdminCandidateAchievement[]
  verificationLogs: AdminVerificationLog[]
  fieldChecks: AdminFieldCheck[]
}

export function getCandidateDetail(id: string) {
  return apiFetch<AdminCandidateDetail>(`/admin/candidates/${id}`)
}

export interface UpdateCandidateBody {
  category?: CandidateCategory
  status?: CandidateStatus
  assignedVerifierId?: string | null
}

export function updateCandidate(id: string, body: UpdateCandidateBody) {
  return apiFetch<AdminCandidateProfile>(`/admin/candidates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export interface UpdateCandidateBadgeBody {
  verificationStatus: 'pending' | 'verified' | 'rejected'
  rejectionReason?: string
}

export function updateCandidateBadge(id: string, badgeId: string, body: UpdateCandidateBadgeBody) {
  return apiFetch<AdminCandidateBadge>(`/admin/candidates/${id}/badges/${badgeId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export interface ExportCandidatesParams {
  status?: CandidateStatus
  category?: CandidateCategory
  q?: string
}

/**
 * `apiFetch` assumes a JSON (or 204) response body — the export endpoint
 * returns `text/csv` with a Content-Disposition header, so this bypasses it
 * with a dedicated fetch call that carries the same auth header and triggers
 * a browser download via a temporary object URL + `<a download>` link.
 */
export async function downloadCandidatesCsv(params: ExportCandidatesParams = {}): Promise<void> {
  const token = getAccessToken()
  const response = await fetch(`${API_BASE_URL}/admin/candidates/export${buildQuery(params)}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) {
    throw new Error(`Export failed with status ${response.status}`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'candidates.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// =======================================================================
// Users (generic account moderation — candidate/company/verifier all live
// in `users`, so suspend/ban/reactivate/delete/impersonate are role-agnostic)
// =======================================================================

export function suspendUser(id: string, reason: string) {
  return apiFetch<void>(`/admin/users/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function banUser(id: string, reason: string) {
  return apiFetch<void>(`/admin/users/${id}/ban`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function reactivateUser(id: string) {
  return apiFetch<void>(`/admin/users/${id}/reactivate`, { method: 'POST' })
}

export function deleteUser(id: string) {
  return apiFetch<void>(`/admin/users/${id}`, { method: 'DELETE' })
}

export function impersonateUser(id: string) {
  return apiFetch<{ accessToken: string }>(`/admin/users/${id}/impersonate`, { method: 'POST' })
}

// =======================================================================
// Companies
// =======================================================================

export interface AdminCompanyPlanRef {
  id: string
  name: string
}

export interface AdminCompanyListRow {
  id: string
  profileId: string
  email: string | null
  companyName: string
  verified: boolean
  plan: AdminCompanyPlanRef | null
  remainingUnlocks: number
  createdAt: string
}

export interface ListCompaniesParams {
  verified?: 'true' | 'false'
  planId?: string
  page?: number
  limit?: number
}

export function listCompanies(params: ListCompaniesParams = {}) {
  return apiFetch<AdminListResponse<AdminCompanyListRow>>(`/admin/companies${buildQuery(params)}`)
}

export interface AdminPlanMaster {
  id: string
  name: string
  monthlyUnlocks: number
  monthlyMessageCap: number | null
  price: number
  isActive: boolean
}

export interface AdminCompanyProfile {
  id: string
  userId: string
  companyName: string
  domain: string | null
  verified: boolean
  logoLink: string | null
  website: string | null
  industry: string | null
  size: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+' | null
  gstNumber: string | null
  planId: string | null
  remainingUnlocks: number
  unlocksResetAt: string | null
  messagesSentThisPeriod: number
  messagesPeriodResetAt: string | null
  createdAt: string
  updatedAt: string
  plan?: AdminPlanMaster | null
}

export interface AdminUnlock {
  id: string
  companyId: string
  candidateId: string
  unlockedAt: string
  note: string | null
}

export interface AdminCompanyBlock {
  id: string
  companyId: string
  candidateId: string
  reason: string | null
  createdAt: string
}

export interface AdminCompanyDetail {
  id: string
  email: string
  accountStatus: UserAccountStatus
  statusReason: string | null
  profile: AdminCompanyProfile
  unlocks: AdminUnlock[]
  blocks: AdminCompanyBlock[]
  messageCount: number
}

export function getCompanyDetail(id: string) {
  return apiFetch<AdminCompanyDetail>(`/admin/companies/${id}`)
}

export interface UpdateCompanyBody {
  verified?: boolean
  planId?: string | null
}

export function updateCompany(id: string, body: UpdateCompanyBody) {
  return apiFetch<AdminCompanyProfile>(`/admin/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export interface GrantUnlocksBody {
  amount: number
  note?: string
}

export function grantUnlocks(id: string, body: GrantUnlocksBody) {
  return apiFetch<AdminCompanyProfile>(`/admin/companies/${id}/grant-unlocks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// =======================================================================
// Verifiers
// =======================================================================

export interface AdminVerifierRow {
  id: string
  username: string | null
  fullName: string | null
  email: string
  accountStatus: UserAccountStatus
  decisionCount: number
  avgTurnaroundHours: number | null
}

export function listVerifiers() {
  return apiFetch<AdminVerifierRow[]>('/admin/verifiers')
}

export interface CreateVerifierBody {
  username: string
  fullName: string
  password: string
}

export interface CreateVerifierResponse {
  id: string
  username: string | null
  fullName: string | null
  email: string
}

export function createVerifier(body: CreateVerifierBody) {
  return apiFetch<CreateVerifierResponse>('/admin/verifiers', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// -----------------------------------------------------------------------
// Verifier invites (email whitelist) — the alternative to createVerifier
// above: an admin whitelists an email instead of picking a password for
// them, and the invited person signs up themselves at /verifier/signup.
// -----------------------------------------------------------------------

export interface AdminVerifierInviteRow {
  id: string
  email: string
  invitedByEmail: string | null
  createdAt: string
  consumedAt: string | null
  consumedByUserFullName: string | null
}

export interface ListVerifierInvitesParams {
  status?: 'pending' | 'consumed'
  page?: number
  limit?: number
}

export function listVerifierInvites(params: ListVerifierInvitesParams = {}) {
  return apiFetch<AdminListResponse<AdminVerifierInviteRow>>(`/admin/verifier-invites${buildQuery(params)}`)
}

export function createVerifierInvite(email: string) {
  return apiFetch<{ id: string; email: string; createdAt: string }>('/admin/verifier-invites', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function deleteVerifierInvite(id: string) {
  return apiFetch<void>(`/admin/verifier-invites/${id}`, { method: 'DELETE' })
}

// =======================================================================
// Company requests
// =======================================================================

export type CompanyRequestStatus = 'pending' | 'approved' | 'rejected'

export interface AdminCompanyRequest {
  id: string
  requestedBy: string | null
  companyName: string
  status: CompanyRequestStatus
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
}

export function listCompanyRequests(status?: CompanyRequestStatus) {
  return apiFetch<AdminCompanyRequest[]>(`/admin/company-requests${buildQuery({ status })}`)
}

export interface ApproveCompanyRequestBody {
  isMnc?: boolean
  isFaangMaang?: boolean
}

export interface ApproveCompanyRequestResponse {
  request: AdminCompanyRequest
  company: { id: string; companyName: string; isMnc: boolean; isFaangMaang: boolean }
}

export function approveCompanyRequest(id: string, body: ApproveCompanyRequestBody) {
  return apiFetch<ApproveCompanyRequestResponse>(`/admin/company-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function rejectCompanyRequest(id: string, reason: string) {
  return apiFetch<AdminCompanyRequest>(`/admin/company-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

// =======================================================================
// Master data CRUD (list/read is public via masterController — this is the
// admin-only write side)
// =======================================================================

// ----- roles_master -----

export interface AdminRoleMaster {
  id: string
  roleName: string
}

export function createRoleMaster(roleName: string) {
  return apiFetch<AdminRoleMaster>('/admin/masters/roles', {
    method: 'POST',
    body: JSON.stringify({ roleName }),
  })
}

export function updateRoleMaster(id: string, roleName: string) {
  return apiFetch<AdminRoleMaster>(`/admin/masters/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ roleName }),
  })
}

export function deleteRoleMaster(id: string) {
  return apiFetch<void>(`/admin/masters/roles/${id}`, { method: 'DELETE' })
}

// ----- platform_badges_master -----

export interface AdminPlatformBadgeMaster {
  id: string
  platformName: string
  badgeName: string
  sortOrder: number
}

export interface PlatformBadgeMasterBody {
  platformName?: string
  badgeName?: string
  sortOrder?: number
}

export function createPlatformBadgeMaster(body: PlatformBadgeMasterBody) {
  return apiFetch<AdminPlatformBadgeMaster>('/admin/masters/platform-badges', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updatePlatformBadgeMaster(id: string, body: PlatformBadgeMasterBody) {
  return apiFetch<AdminPlatformBadgeMaster>(`/admin/masters/platform-badges/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deletePlatformBadgeMaster(id: string) {
  return apiFetch<void>(`/admin/masters/platform-badges/${id}`, { method: 'DELETE' })
}

// ----- companies_master -----

export interface AdminCompanyMaster {
  id: string
  companyName: string
  isMnc: boolean
  isFaangMaang: boolean
}

export interface CompanyMasterBody {
  companyName?: string
  isMnc?: boolean
  isFaangMaang?: boolean
}

export function createCompanyMaster(body: CompanyMasterBody) {
  return apiFetch<AdminCompanyMaster>('/admin/masters/companies', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateCompanyMaster(id: string, body: CompanyMasterBody) {
  return apiFetch<AdminCompanyMaster>(`/admin/masters/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteCompanyMaster(id: string) {
  return apiFetch<void>(`/admin/masters/companies/${id}`, { method: 'DELETE' })
}

export function mergeCompanyMaster(id: string, mergeIntoId: string) {
  return apiFetch<void>(`/admin/masters/companies/${id}/merge`, {
    method: 'POST',
    body: JSON.stringify({ mergeIntoId }),
  })
}

// ----- skills_master -----

export interface AdminSkillMaster {
  id: string
  skillName: string
}

export function createSkillMaster(skillName: string) {
  return apiFetch<AdminSkillMaster>('/admin/masters/skills', {
    method: 'POST',
    body: JSON.stringify({ skillName }),
  })
}

export function updateSkillMaster(id: string, skillName: string) {
  return apiFetch<AdminSkillMaster>(`/admin/masters/skills/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ skillName }),
  })
}

export function deleteSkillMaster(id: string) {
  return apiFetch<void>(`/admin/masters/skills/${id}`, { method: 'DELETE' })
}

// ----- domains_master -----

export interface AdminDomainMaster {
  id: string
  domainName: string
}

export function createDomainMaster(domainName: string) {
  return apiFetch<AdminDomainMaster>('/admin/masters/domains', {
    method: 'POST',
    body: JSON.stringify({ domainName }),
  })
}

export function updateDomainMaster(id: string, domainName: string) {
  return apiFetch<AdminDomainMaster>(`/admin/masters/domains/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ domainName }),
  })
}

export function deleteDomainMaster(id: string) {
  return apiFetch<void>(`/admin/masters/domains/${id}`, { method: 'DELETE' })
}

// ----- rejection_reasons_master -----

export interface AdminRejectionReasonMaster {
  id: string
  scope: 'profile' | 'item'
  reasonText: string
}

export interface RejectionReasonMasterBody {
  scope?: 'profile' | 'item'
  reasonText?: string
}

/**
 * Unfiltered variant of verifierApi's `listRejectionReasons` (which requires
 * a scope) — the master-data admin tab needs every row across both scopes in
 * one table. Same public GET, just without the query param.
 */
export function listAllRejectionReasons() {
  return apiFetch<AdminRejectionReasonMaster[]>('/masters/rejection-reasons')
}

export function createRejectionReasonMaster(body: { scope: 'profile' | 'item'; reasonText: string }) {
  return apiFetch<AdminRejectionReasonMaster>('/admin/masters/rejection-reasons', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateRejectionReasonMaster(id: string, body: RejectionReasonMasterBody) {
  return apiFetch<AdminRejectionReasonMaster>(`/admin/masters/rejection-reasons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteRejectionReasonMaster(id: string) {
  return apiFetch<void>(`/admin/masters/rejection-reasons/${id}`, { method: 'DELETE' })
}

// ----- plans_master -----

export interface PlanMasterBody {
  name?: string
  monthlyUnlocks?: number
  monthlyMessageCap?: number | null
  price?: number
  isActive?: boolean
}

export function listPlanMasters() {
  return apiFetch<AdminPlanMaster[]>('/admin/masters/plans')
}

export function createPlanMaster(body: {
  name: string
  monthlyUnlocks: number
  monthlyMessageCap?: number | null
  price: number
  isActive?: boolean
}) {
  return apiFetch<AdminPlanMaster>('/admin/masters/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updatePlanMaster(id: string, body: PlanMasterBody) {
  return apiFetch<AdminPlanMaster>(`/admin/masters/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deletePlanMaster(id: string) {
  return apiFetch<void>(`/admin/masters/plans/${id}`, { method: 'DELETE' })
}

// ----- relevancy_package_price_bands (AI Relevancy Packages) -----
// List is re-exported from relevancyApi.ts (listRelevancyPriceBands) rather
// than duplicated — the public GET already returns every band, admin
// included, so there's no separate admin-only list endpoint to wrap.
export { listRelevancyPriceBands, type RelevancyPackagePriceBand } from './relevancyApi'

export interface RelevancyPriceBandBody {
  label?: string
  minCandidates?: number
  maxCandidates?: number | null
  price?: number | null
  isContactSales?: boolean
  sortOrder?: number
}

export function createRelevancyPriceBand(body: {
  label: string
  minCandidates: number
  maxCandidates: number | null
  price: number | null
  isContactSales?: boolean
  sortOrder?: number
}) {
  return apiFetch('/admin/masters/relevancy-price-bands', { method: 'POST', body: JSON.stringify(body) })
}

export function updateRelevancyPriceBand(id: string, body: RelevancyPriceBandBody) {
  return apiFetch(`/admin/masters/relevancy-price-bands/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteRelevancyPriceBand(id: string) {
  return apiFetch<void>(`/admin/masters/relevancy-price-bands/${id}`, { method: 'DELETE' })
}

// =======================================================================
// Site settings
// =======================================================================

export type SiteSettingsMap = Record<string, string | null>

export function getAdminSiteSettings() {
  return apiFetch<SiteSettingsMap>('/admin/site-settings')
}

export function updateAdminSiteSettings(body: Record<string, string>) {
  return apiFetch<SiteSettingsMap>('/admin/site-settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

// =======================================================================
// Announcements
// =======================================================================

export type AnnouncementAudience = 'all' | 'candidate' | 'company' | 'verifier'

export interface AdminAnnouncement {
  id: string
  title: string
  body: string
  audience: AnnouncementAudience
  createdBy: string
  createdAt: string
}

export function listAnnouncements() {
  return apiFetch<AdminAnnouncement[]>('/admin/announcements')
}

export interface CreateAnnouncementBody {
  title: string
  body: string
  audience: AnnouncementAudience
}

export function createAnnouncement(body: CreateAnnouncementBody) {
  return apiFetch<AdminAnnouncement>('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// =======================================================================
// Analytics
// =======================================================================

export interface AnalyticsOverview {
  candidateFunnel: Record<CandidateStatus, number>
  companyFunnel: {
    total: number
    verified: number
    byPlan: { planId: string | null; planName: string; count: number }[]
  }
  fraudSignals: {
    flaggedVerifications: number
    candidatesWithMultipleRejections: number
    companiesWithHighUnlockVolume24h: number
    companyBlocksTotal: number
  }
  revenue: {
    totalPaid: number
    currency: string
    byType: Record<string, number>
    paidCount: number
    failedCount: number
  }
}

export function getAnalyticsOverview() {
  return apiFetch<AnalyticsOverview>('/admin/analytics/overview')
}

// =======================================================================
// Financial ledger
// =======================================================================

export interface AdminPaymentRow {
  id: string
  type: 'subscription' | 'pay_per_unlock' | 'boost' | 'relevancy_package'
  status: 'created' | 'submitted' | 'paid' | 'failed' | 'refunded'
  method: 'razorpay' | 'upi_manual'
  amount: number
  currency: string
  payer: { id: string; email: string; fullName: string | null; role: string } | null
  razorpayOrderId: string | null
  razorpayPaymentId: string | null
  manualReference: string | null
  upiUtr: string | null
  createdAt: string
  updatedAt: string
}

export interface ListPaymentsParams {
  type?: 'subscription' | 'pay_per_unlock' | 'boost' | 'relevancy_package'
  status?: 'created' | 'submitted' | 'paid' | 'failed' | 'refunded'
  method?: 'razorpay' | 'upi_manual'
  page?: number
  limit?: number
}

export function listPayments(params: ListPaymentsParams = {}) {
  return apiFetch<AdminListResponse<AdminPaymentRow>>(`/admin/payments${buildQuery(params)}`)
}

/** Approves a manual UPI payment (status submitted -> paid) — applies its
 *  effect (plan/unlock/boost) exactly as the Razorpay webhook would. */
export function approvePayment(id: string) {
  return apiFetch<void>(`/admin/payments/${id}/approve`, { method: 'POST' })
}

/** Rejects a manual UPI payment (status submitted -> failed). */
export function rejectPayment(id: string) {
  return apiFetch<void>(`/admin/payments/${id}/reject`, { method: 'POST' })
}

// =======================================================================
// Audit log
// =======================================================================

export interface AdminAuditLogRow {
  id: string
  adminId: string
  adminEmail: string | null
  adminFullName: string | null
  action: string
  target: string | null
  createdAt: string
}

export interface ListAuditLogParams {
  page?: number
  limit?: number
}

export function listAuditLog(params: ListAuditLogParams = {}) {
  return apiFetch<AdminListResponse<AdminAuditLogRow>>(`/admin/audit-log${buildQuery(params)}`)
}
