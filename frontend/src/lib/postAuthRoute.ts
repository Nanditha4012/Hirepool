import type { NavigateFunction } from 'react-router-dom'
import { isAuthSuccess, type LoginResult, type Role } from './authStore'

/** Where a fully-authenticated user of each role lands. */
export function roleHomePath(role: Role, hasCategory: boolean): string {
  switch (role) {
    case 'candidate':
      // A candidate who hasn't picked Fresher/Experienced/Executive yet is
      // sent to pick it first — the whole profile form depends on it.
      return hasCategory ? '/candidate' : '/onboarding/category'
    case 'company':
      return '/company'
    case 'verifier':
      return '/verify'
    case 'admin':
      return '/admin'
    default:
      return '/'
  }
}

/**
 * Routes after any successful credential exchange (password or Google).
 *
 * Verifier/admin accounts never come back with a session — the backend returns
 * a short-lived challenge token instead, and 2FA has to be satisfied first.
 * Both entry points need identical handling, so it lives here rather than being
 * duplicated (and drifting) between the login and signup pages.
 */
export function navigateAfterAuth(result: LoginResult, navigate: NavigateFunction): void {
  if (isAuthSuccess(result)) {
    const hasCategory = Boolean(result.user.profile?.category)
    navigate(roleHomePath(result.user.role, hasCategory))
    return
  }

  navigate('/onboarding/2fa', {
    state: {
      challengeToken: result.challengeToken,
      enrollmentRequired: 'totpEnrollmentRequired' in result,
    },
  })
}
