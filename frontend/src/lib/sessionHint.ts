/**
 * A local "there was probably a session here" marker.
 *
 * The real session lives in an httpOnly refresh cookie the JS can't read, so
 * on a cold start the app genuinely does not know whether anyone is signed in
 * until `/auth/refresh` comes back. That gap is what made reopening the site
 * on a phone land on the marketing page: the router had to render *something*
 * while the bootstrap was in flight, and `/` renders the landing page.
 *
 * This is only a hint, never an authority — it says "last time this browser
 * had a session", so the landing page can hold a loader for the half-second
 * the bootstrap takes instead of flashing a "Sign up!" pitch at someone who
 * is already a member. If it's stale (cookie expired, signed out elsewhere)
 * the bootstrap resolves to no user and the landing page renders as normal;
 * nothing is gated on it, so a wrong value costs one loading frame.
 *
 * Deliberately not the token itself: putting an access token in localStorage
 * is how XSS turns into account takeover. This is a boolean and a timestamp.
 */

const KEY = 'hp.session.hint'

/**
 * Slightly longer than the backend's 12h refresh-cookie lifetime
 * (JWT_REFRESH_EXPIRES_IN). Past this the cookie cannot still be valid, so
 * the hint is certainly stale and we stop holding a loader for it.
 */
const MAX_AGE_MS = 13 * 60 * 60 * 1000

export function rememberSession(): void {
  try {
    window.localStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Private mode / storage disabled. The hint is an optimisation; losing it
    // just means the landing page renders before redirecting.
  }
}

export function forgetSession(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* see above */
  }
}

/** True when this browser held a session recently enough for one to survive. */
export function hasSessionHint(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    if (Date.now() - at > MAX_AGE_MS) {
      forgetSession()
      return false
    }
    return true
  } catch {
    return false
  }
}
