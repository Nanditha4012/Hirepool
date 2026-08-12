import type { AuthUser } from './authStore'

/**
 * "Is this account live yet?" — the frontend half of the rule enforced by the
 * backend's requireVerified middleware.
 *
 * Until verification passes, an account gets exactly one screen: what it
 * submitted, and where that submission stands. Everything else — the Walk-in
 * Pedia, the Job Book, communities, contests, candidate search, unlocks,
 * messaging — is closed. This module is the single place that decides that, so
 * the route guard, the nav bars and the status pages can never disagree about
 * whether a given account is locked.
 *
 * The status itself comes from `user.profile`, which GET /auth/me returns
 * alongside the user. That is refreshed on sign-in and whenever the candidate
 * or company home screen loads (both call syncProfile), so approval takes
 * effect the next time the account lands on its own home rather than needing a
 * hard reload.
 */

export type CandidateStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_info'

/** Verifiers and admins have no profile to verify — they are never locked. */
const ALWAYS_UNLOCKED_ROLES = ['verifier', 'admin']

function candidateStatus(user: AuthUser): CandidateStatus | null {
  const status = (user.profile as { status?: unknown } | null)?.status
  return typeof status === 'string' ? (status as CandidateStatus) : null
}

function companyVerified(user: AuthUser): boolean {
  return Boolean((user.profile as { verified?: unknown } | null)?.verified)
}

/**
 * True when this account has passed verification and the whole app is open to
 * it. A signed-out user is treated as unverified — callers that care about
 * "signed in at all" check `user` themselves (see ProtectedRoute).
 */
export function isAccountVerified(user: AuthUser | null): boolean {
  if (!user) return false
  if (ALWAYS_UNLOCKED_ROLES.includes(user.role)) return true
  if (user.role === 'candidate') return candidateStatus(user) === 'approved'
  if (user.role === 'company') return companyVerified(user)
  return true
}

export interface LockNotice {
  /** Where this account IS allowed to go — its own submission + status. */
  homePath: string
  /** Button label pointing at homePath. */
  homeLabel: string
  title: string
  body: string
  /** Drives the accent colour: a rejection reads as red, a wait as amber. */
  tone: 'boost' | 'danger'
}

/**
 * The explanation to show when a locked account reaches a gated surface.
 *
 * Returns null when the account is verified (nothing to explain) or signed
 * out (a different problem, handled by the login redirect).
 *
 * The copy is status-specific on purpose: "we are still reviewing you" and
 * "we turned you down, here is where to fix it" are different situations, and
 * a single generic "not verified" message left rejected candidates with
 * nothing to act on.
 */
export function lockNoticeFor(user: AuthUser | null): LockNotice | null {
  if (!user || isAccountVerified(user)) return null

  if (user.role === 'company') {
    return {
      homePath: '/company',
      homeLabel: 'View my submission',
      title: 'Locked until your company is verified',
      body: 'An admin is checking the details you submitted. Candidate search, unlocks, messaging and the shared boards all open the moment that passes. Until then you can see and edit what you sent.',
      tone: 'boost',
    }
  }

  const status = candidateStatus(user)

  const body =
    status === 'draft'
      ? 'You have not submitted your profile yet. Finish it and send it for verification — everything here opens once a verifier approves you.'
      : status === 'rejected'
        ? 'Your profile was turned down. Your submission page lists exactly which items must be fixed; correct those and resubmit to get access.'
        : status === 'needs_info'
          ? 'A verifier needs something corrected before your profile can go live. Your submission page lists what, and lets you resubmit.'
          : 'A verifier is checking the details you submitted. Contests, the Walk-in Pedia, the Job Book and communities all open the moment your profile is approved.'

  return {
    homePath: '/candidate',
    homeLabel: status === 'draft' ? 'Finish my profile' : 'View my submission',
    title:
      status === 'rejected'
        ? 'Locked — your profile was not accepted'
        : status === 'draft'
          ? 'Locked until you submit your profile'
          : 'Locked until your profile is verified',
    body,
    tone: status === 'rejected' ? 'danger' : 'boost',
  }
}
