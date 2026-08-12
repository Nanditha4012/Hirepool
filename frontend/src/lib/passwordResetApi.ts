import { apiFetch } from './apiClient'

// Thin typed wrappers over apiFetch for the forgot-password flow. Kept out
// of authStore.ts deliberately: none of these three calls touch session
// state (no user, no access token) — they're a standalone unauthenticated
// flow, same reasoning as candidateApi.ts staying flat and stateless.

export function requestPasswordReset(email: string) {
  return apiFetch<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email }),
  })
}

export function verifyResetOtp(email: string, otp: string) {
  return apiFetch<{ resetToken: string }>('/auth/reset-password/verify-otp', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, otp }),
  })
}

export function resetPassword(resetToken: string, newPassword: string) {
  return apiFetch<void>('/auth/reset-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ resetToken, newPassword }),
  })
}
