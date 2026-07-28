import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for Phase 6's notification endpoints —
// mounted at /me/notifications* behind requireAuth only, so these work for
// any signed-in role. Mirrors companyApi.ts / paymentsApi.ts's style.

export interface NotificationRow {
  id: string
  userId: string
  /** Free-text tag set by whichever controller created it, e.g. 'payment_receipt',
   *  'new_message', 'profile_status_changed' — not a closed enum on the backend. */
  type: string
  message: string
  link: string | null
  createdAt: string
  readAt: string | null
}

export interface NotificationListResponse {
  results: NotificationRow[]
  page: number
  limit: number
  totalCount: number
}

export interface ListNotificationsParams {
  page?: number
  limit?: number
  unreadOnly?: boolean
}

function buildQuery(params: ListNotificationsParams): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

export function listMyNotifications(params: ListNotificationsParams = {}) {
  return apiFetch<NotificationListResponse>(`/me/notifications${buildQuery(params)}`)
}

export function getUnreadNotificationCount() {
  return apiFetch<{ count: number }>('/me/notifications/unread-count')
}

export function markNotificationRead(id: string) {
  return apiFetch<NotificationRow>(`/me/notifications/${id}/read`, { method: 'PATCH' })
}

/** Backend returns 204 No Content — apiFetch resolves this as `undefined`. */
export function markAllNotificationsRead() {
  return apiFetch<void>('/me/notifications/read-all', { method: 'PATCH' })
}
