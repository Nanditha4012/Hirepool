import { apiFetch, getAccessToken } from './apiClient'
import { API_BASE_URL } from './config'

// Thin typed wrappers over apiFetch for the AI Relevancy Packages endpoints
// (jdController.ts / relevancyController.ts / paymentController.ts's
// purchaseRelevancyPackage). Mirrors companyApi.ts's style — keep this file
// flat, no client-side caching/state here, callers own that.

export type JobRequirementParseStatus = 'pending' | 'success' | 'failed' | 'unavailable'
export type RelevancyTier = '100_percent' | '90_plus' | '75_plus' | '50_plus'

export const RELEVANCY_TIERS: RelevancyTier[] = ['100_percent', '90_plus', '75_plus', '50_plus']
export const TIER_LABELS: Record<RelevancyTier, string> = {
  '100_percent': '100%',
  '90_plus': '90%+',
  '75_plus': '75%+',
  '50_plus': '50%+',
}

export interface JobRequirementsParsed {
  parseStatus: JobRequirementParseStatus
  parseError: string | null
  extractedSkills: string[]
  extractedRole: string | null
  extractedExperienceLevel: number | null
  extractedDomain: string | null
}

export interface RecomputeResult {
  scored: number
  eligible: number
  capped: boolean
}

export interface JobResponse {
  id: string
  companyId: string
  title: string
  description: string | null
  createdAt: string
  updatedAt: string
  requirementsParsed: JobRequirementsParsed | null
  relevancyRecompute: RecomputeResult | null
}

export function createJob(body: { title: string; description?: string }) {
  return apiFetch<JobResponse>('/companies/jobs', { method: 'POST', body: JSON.stringify(body) })
}

export function listMyJobs() {
  return apiFetch<JobResponse[]>('/companies/jobs')
}

export function getJob(jobId: string) {
  return apiFetch<JobResponse>(`/companies/jobs/${jobId}`)
}

export function updateJob(jobId: string, body: { title?: string; description?: string }) {
  return apiFetch<JobResponse>(`/companies/jobs/${jobId}`, { method: 'PUT', body: JSON.stringify(body) })
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export interface JobBatchesResponse {
  jobId: string
  tiers: { tier: RelevancyTier; label: string; candidateCount: number }[]
}

export function getJobBatches(jobId: string) {
  return apiFetch<JobBatchesResponse>(`/companies/jobs/${jobId}/batches`)
}

export interface BatchCandidate {
  id: string
  relevancyPercent: number
  fullName: string | null
  category: 'fresher' | 'experienced' | 'executive' | null
  primaryRole: { id: string; roleName: string } | null
  yearsOfExperience: number | null
  secondaryRoles: { id: string; roleName: string }[]
  skills: { id: string; skillName: string }[]
  domain: { id: string; domainName: string } | null
  location: string | null
  noticePeriod: string | null
  isUnlockedByMe: boolean
  phone: string | null
  email: string | null
  whatsappLink: string | null
}

export interface BatchCandidatesResponse {
  results: BatchCandidate[]
  page: number
  pageSize: number
  totalCount: number
}

export function listBatchCandidates(jobId: string, tier: RelevancyTier, page = 1, pageSize = 20) {
  return apiFetch<BatchCandidatesResponse>(
    `/companies/jobs/${jobId}/batches/${tier}/candidates?page=${page}&pageSize=${pageSize}`,
  )
}

// ---------------------------------------------------------------------------
// Purchase + download
// ---------------------------------------------------------------------------

/** Same shape as paymentsApi's CreateOrderResponse — a separate copy here
 * (rather than importing it) keeps this file's only dependency on
 * apiClient, matching how companyApi.ts/candidateApi.ts don't cross-import
 * each other's response shapes either. */
export interface CreateOrderResponse {
  paymentId: string
  razorpayOrderId: string
  amount: number
  currency: string
  razorpayKeyId: string
}

export function purchaseRelevancyPackage(jobId: string, tier: RelevancyTier) {
  return apiFetch<CreateOrderResponse>(`/companies/jobs/${jobId}/batches/${tier}/purchase`, {
    method: 'POST',
  })
}

export interface RelevancyPackageRow {
  id: string
  tier: RelevancyTier
  candidateCount: number
  price: number
  purchasedAt: string | null
  downloadedAt: string | null
}

export function listJobPackages(jobId: string) {
  return apiFetch<RelevancyPackageRow[]>(`/companies/jobs/${jobId}/relevancy-packages`)
}

/** Same fetch-blob-and-click-a-link pattern as adminApi.downloadCandidatesCsv
 * — apiFetch assumes a JSON body, which a CSV response isn't. */
export async function downloadRelevancyPackage(packageId: string): Promise<void> {
  const token = getAccessToken()
  const response = await fetch(`${API_BASE_URL}/companies/relevancy-packages/${packageId}/download`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `relevancy-package-${packageId}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Price bands (public read, admin write — admin write lives in adminApi.ts)
// ---------------------------------------------------------------------------

export interface RelevancyPackagePriceBand {
  id: string
  label: string
  minCandidates: number
  maxCandidates: number | null
  price: number | null
  isContactSales: boolean
  sortOrder: number
}

export function listRelevancyPriceBands() {
  return apiFetch<RelevancyPackagePriceBand[]>('/masters/relevancy-price-bands')
}
