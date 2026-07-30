// Single source of truth for branding + API base URL. Every place branding
// appears (page title, header logo, footer) should import APP_NAME from here
// rather than hardcoding "Hirepool".
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Hirepool'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

/**
 * Where users are told to write when something is urgent or doesn't fit any
 * of the in-app flows. Surfaced in the footer and under every profile/status
 * card, so it lives here rather than being retyped (and mistyped) per page.
 */
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'query.hirepool@gmail.com'

/**
 * Idle-session policy.
 *
 * After this many minutes with no keyboard/pointer/scroll activity in any
 * open tab, the user is signed out. A warning appears
 * SESSION_WARNING_SECONDS before that so nobody loses a half-typed form
 * without being offered the chance to stay.
 *
 * This is the UX half of the policy; the enforcement half is the backend's
 * refresh-cookie lifetime (JWT_REFRESH_EXPIRES_IN, 12h) — a tampered-with
 * frontend can skip the timer but still can't revive a session past that.
 */
export const SESSION_IDLE_MINUTES = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES) || 30

export const SESSION_WARNING_SECONDS = 60
