import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for the company-side messaging endpoints.
// Kept as a separate file (rather than appended to companyApi.ts) to avoid
// colliding with a parallel in-progress agent adding company profile/search/
// unlock functions to companyApi.ts. Mirrors candidateApi.ts's style.

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export interface CompanyThreadMessage {
  id: string
  companyId: string
  candidateId: string
  senderRole: 'company' | 'candidate'
  body: string
  createdAt: string
  readAt: string | null
}

export interface CompanyMessageThread {
  candidateId: string
  /** Always a readable name, never a UUID — see the backend's utils/displayName.ts. */
  candidateName: string
  primaryRole: string | null
  location: string | null
  unreadCount: number
  lastMessageAt: string | null
  messages: CompanyThreadMessage[]
}

export function listMyThreads() {
  return apiFetch<CompanyMessageThread[]>('/companies/me/messages')
}

export function sendMessage(candidateId: string, body: string) {
  return apiFetch<CompanyThreadMessage>(`/companies/me/messages/${candidateId}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

/** Clears the unread badge for one conversation. Fire-and-forget at call sites. */
export function markThreadRead(candidateId: string) {
  return apiFetch<{ updated: number }>(`/companies/me/messages/${candidateId}/read`, {
    method: 'PATCH',
  })
}
