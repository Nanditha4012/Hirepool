import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  apiFetch,
  setAccessToken as setApiAccessToken,
  setRefreshHandler as setApiRefreshHandler,
} from './apiClient'

export type Role = 'candidate' | 'company' | 'verifier' | 'admin'

export type CandidateCategory = 'fresher' | 'experienced' | 'executive'

export interface Profile {
  category?: CandidateCategory
  [key: string]: unknown
}

export interface AuthUser {
  id: string
  email: string
  /** Login handle, set only on provisioned accounts (verifier/admin). */
  username?: string | null
  fullName?: string | null
  role: Role
  phone?: string
  profile: Profile | null
}

interface AuthSuccess {
  accessToken: string
  user: AuthUser
}

interface TotpRequired {
  totpRequired: true
  challengeToken: string
}

interface TotpEnrollmentRequired {
  totpEnrollmentRequired: true
  challengeToken: string
}

export type LoginResult = AuthSuccess | TotpRequired | TotpEnrollmentRequired

export function isAuthSuccess(result: LoginResult): result is AuthSuccess {
  return 'accessToken' in result
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  /**
   * `identifier` is an email for self-signup roles, or a username for
   * provisioned verifier/admin accounts — the backend accepts either.
   */
  login: (identifier: string, password: string) => Promise<LoginResult>
  /**
   * 'verifier' is only accepted by the backend when `email` has a live
   * admin-issued invite — see VerifierSignupPage. `recaptchaToken` is only
   * required by the backend when it has RECAPTCHA_SECRET_KEY configured
   * (see authController.signup) — omit it and signup behaves exactly as
   * before in any environment that hasn't set that up.
   */
  signup: (
    email: string,
    password: string,
    role: 'candidate' | 'company' | 'verifier',
    recaptchaToken?: string,
  ) => Promise<AuthSuccess>
  loginWithGoogle: (idToken: string, role: 'candidate' | 'company') => Promise<LoginResult>
  verifyTotp: (challengeToken: string, code: string) => Promise<AuthSuccess>
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<boolean>
  setCategory: (category: CandidateCategory) => Promise<Profile>
  /**
   * Replaces the cached profile with one a page has just fetched first-hand.
   *
   * The session's copy of `profile` comes from GET /auth/me at sign-in and is
   * never touched again, which is fine for everything except the verification
   * gate (src/lib/verification.ts) — that reads `profile.status` /
   * `profile.verified` to decide what the account may open, so a candidate
   * approved mid-session would stay locked out until they signed in again.
   * The candidate and company home screens fetch the real profile on every
   * visit anyway; handing it to the store here is what makes approval take
   * effect on the spot, without adding a poll.
   *
   * A no-op when nobody is signed in.
   */
  syncProfile: (profile: Profile | null) => void
  /**
   * True when the last sign-out was the idle timer firing rather than the
   * user clicking "Log out" — the login page reads it to explain why they
   * are suddenly back at the door. Cleared on the next successful sign-in.
   */
  sessionExpired: boolean
  /** Ends the session because it timed out. See SessionTimeout.tsx. */
  expireSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessTokenState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  const applyToken = useCallback((token: string | null) => {
    setApiAccessToken(token)
    setAccessTokenState(token)
    // Any freshly-issued token means credentials were just exchanged
    // successfully, so the "your session timed out" notice has served its
    // purpose. Done here rather than in each of login/signup/google/totp so
    // a future fifth entry point can't forget to clear it.
    if (token) setSessionExpired(false)
  }, [])

  const login = useCallback(
    async (identifier: string, password: string): Promise<LoginResult> => {
      const result = await apiFetch<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
        auth: false,
      })
      if (isAuthSuccess(result)) {
        applyToken(result.accessToken)
        setUser(result.user)
      }
      return result
    },
    [applyToken],
  )

  const signup = useCallback(
    async (
      email: string,
      password: string,
      role: 'candidate' | 'company' | 'verifier',
      recaptchaToken?: string,
    ): Promise<AuthSuccess> => {
      const result = await apiFetch<AuthSuccess>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, role, recaptchaToken }),
        auth: false,
      })
      applyToken(result.accessToken)
      setUser(result.user)
      return result
    },
    [applyToken],
  )

  const loginWithGoogle = useCallback(
    async (idToken: string, role: 'candidate' | 'company'): Promise<LoginResult> => {
      const result = await apiFetch<LoginResult>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken, role }),
        auth: false,
      })
      if (isAuthSuccess(result)) {
        applyToken(result.accessToken)
        setUser(result.user)
      }
      return result
    },
    [applyToken],
  )

  const verifyTotp = useCallback(
    async (challengeToken: string, code: string): Promise<AuthSuccess> => {
      const result = await apiFetch<AuthSuccess>('/auth/totp/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, code }),
        auth: false,
      })
      applyToken(result.accessToken)
      setUser(result.user)
      return result
    },
    [applyToken],
  )

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' })
    } finally {
      applyToken(null)
      setUser(null)
    }
  }, [applyToken])

  const expireSession = useCallback(async () => {
    await logout()
    setSessionExpired(true)
  }, [logout])

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    try {
      const result = await apiFetch<{ accessToken: string }>('/auth/refresh', {
        method: 'POST',
        auth: false,
      })
      applyToken(result.accessToken)
      return true
    } catch {
      applyToken(null)
      return false
    }
  }, [applyToken])

  const syncProfile = useCallback((profile: Profile | null) => {
    setUser((prev) => (prev ? { ...prev, profile } : prev))
  }, [])

  const setCategory = useCallback(async (category: CandidateCategory): Promise<Profile> => {
    const profile = await apiFetch<Profile>('/candidates/me/category', {
      method: 'PATCH',
      body: JSON.stringify({ category }),
    })
    setUser((prev) => (prev ? { ...prev, profile } : prev))
    return profile
  }, [])

  // On mount: attempt a silent refresh using the httpOnly cookie from a
  // previous session, then fetch the current user if that succeeds.
  //
  // Guarded by a ref, not a `cancelled`-in-cleanup flag: React 18
  // StrictMode double-invokes this effect once in dev (mount → cleanup →
  // mount), and a `cancelled` closure gets marked true by that first
  // cleanup before its request resolves — silently discarding the result
  // (harmless here specifically, since a second real call still completes
  // normally, but it shows up as a duplicate /auth/refresh call in the
  // console every load). The ref survives the whole StrictMode dance, so
  // it reliably keeps this to one real call. See TotpPage.tsx's enrollment
  // effect for a case where this exact combination silently broke the page
  // instead of just being noisy.
  const bootstrappedRef = useRef(false)

  // Lets apiClient renew a 15-minute access token behind any request that
  // 401s, instead of every long-lived tab breaking mid-session. Registered as
  // an effect (not at module scope) so it is torn down with the provider.
  useEffect(() => {
    setApiRefreshHandler(refreshAccessToken)
    return () => setApiRefreshHandler(null)
  }, [refreshAccessToken])

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true

    ;(async () => {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        try {
          const me = await apiFetch<AuthUser>('/auth/me')
          setUser(me)
        } catch {
          applyToken(null)
          setUser(null)
        }
      }
      setIsLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      login,
      signup,
      loginWithGoogle,
      verifyTotp,
      logout,
      refreshAccessToken,
      setCategory,
      syncProfile,
      sessionExpired,
      expireSession,
    }),
    [
      user,
      accessToken,
      isLoading,
      login,
      signup,
      loginWithGoogle,
      verifyTotp,
      logout,
      refreshAccessToken,
      setCategory,
      syncProfile,
      sessionExpired,
      expireSession,
    ],
  )

  return React.createElement(AuthContext.Provider, { value }, children)
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
