import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for Phase 6's payment endpoints. One
// function per endpoint, typed request/response per paymentController.ts.
// Mirrors companyApi.ts / adminApi.ts's style — keep this file flat, no
// client-side caching/state here, callers own that.
//
// All three checkout endpoints (subscribe / unlock-topup / boost) return the
// same CreateOrderResponse shape (see paymentController.createOrderAndPaymentRow).
// The two history list endpoints follow the same {results,page,limit,totalCount}
// pagination envelope as adminController's list endpoints (paymentController's
// parsePagination is a direct copy of adminController's).

export interface CreateOrderResponse {
  paymentId: string
  razorpayOrderId: string
  /** Rupees, not paise — matches plans_master.price's convention. */
  amount: number
  currency: string
  razorpayKeyId: string
}

export type PaymentType = 'subscription' | 'pay_per_unlock' | 'boost'
export type PaymentStatus = 'created' | 'paid' | 'failed' | 'refunded'

export type PaymentMetadata =
  | { planId: string }
  | { unlockQuantity: number }
  | { boostDays: number }

export interface PaymentRow {
  id: string
  type: PaymentType
  payerUserId: string
  amount: number
  currency: string
  status: PaymentStatus
  razorpayOrderId: string
  razorpayPaymentId: string | null
  razorpaySignature: string | null
  metadata: PaymentMetadata | Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface PaymentHistoryResponse {
  results: PaymentRow[]
  page: number
  limit: number
  totalCount: number
}

export interface ListPaymentHistoryParams {
  page?: number
  limit?: number
}

function buildQuery(params: ListPaymentHistoryParams): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    query.set(key, String(value))
  })
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

/**
 * Kicks off a Razorpay order for a plan subscription. Note: as of Phase 6
 * there is no company-facing "list available plans" endpoint — only
 * `/admin/masters/plans` (admin-only) exists — so callers of this need a
 * planId from somewhere else (e.g. the company's own current `plan` field on
 * their profile, to resubscribe/renew). See DashboardPage.tsx for how this
 * gap is handled in the UI.
 */
export function subscribeToPlan(planId: string) {
  return apiFetch<CreateOrderResponse>('/companies/payments/subscribe', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  })
}

export function buyUnlockTopup(quantity: number) {
  return apiFetch<CreateOrderResponse>('/companies/payments/unlock-topup', {
    method: 'POST',
    body: JSON.stringify({ quantity }),
  })
}

export function listCompanyPaymentHistory(params: ListPaymentHistoryParams = {}) {
  return apiFetch<PaymentHistoryResponse>(`/companies/payments/history${buildQuery(params)}`)
}

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------

export function buyBoost(days: number) {
  return apiFetch<CreateOrderResponse>('/candidates/payments/boost', {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

export function listCandidatePaymentHistory(params: ListPaymentHistoryParams = {}) {
  return apiFetch<PaymentHistoryResponse>(`/candidates/payments/history${buildQuery(params)}`)
}
