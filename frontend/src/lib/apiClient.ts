import { API_BASE_URL } from './config'

// In-memory access token store. Kept as a plain module-level variable (rather
// than importing authStore) so authStore.ts can set it via setAccessToken()
// without creating a circular import between apiClient.ts <-> authStore.ts.
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

// ---------------------------------------------------------------------
// Transparent access-token renewal
//
// Access tokens live 15 minutes; the refresh cookie lives 12 hours. Nothing
// used to bridge the two — authStore refreshed exactly once, on mount — so
// any tab open longer than 15 minutes started 401ing on every call while the
// user was still, as far as they could tell, signed in. Forms failed to save
// with "Invalid or expired access token" and the only cure was a page reload.
//
// So: a single 401 on an authenticated request triggers one refresh attempt
// and one replay of the original request. Concurrent 401s share the same
// in-flight refresh (`refreshInFlight`) rather than each firing their own,
// which would have every parallel request on a page racing to rotate the
// cookie. If the refresh fails, the original 401 surfaces untouched and
// authStore's own handler signs the user out.
// ---------------------------------------------------------------------

type RefreshHandler = () => Promise<boolean>

let refreshHandler: RefreshHandler | null = null
let refreshInFlight: Promise<boolean> | null = null

/** Registered once by AuthProvider. */
export function setRefreshHandler(handler: RefreshHandler | null) {
  refreshHandler = handler
}

function refreshOnce(): Promise<boolean> {
  if (!refreshHandler) return Promise.resolve(false)
  if (!refreshInFlight) {
    refreshInFlight = refreshHandler().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

interface ApiFetchOptions extends RequestInit {
  /** Attach `Authorization: Bearer <token>` from the in-memory access token. Defaults to true. */
  auth?: boolean
  /**
   * Internal. Set on the replayed request so a second 401 gives up instead of
   * looping refresh → 401 → refresh forever.
   */
  _isRetry?: boolean
}

interface ApiErrorBody {
  message?: string
  code?: string
}

/**
 * Thrown for any non-2xx response. Carries the HTTP status so callers can
 * distinguish "you aren't allowed" (403 — e.g. a company still awaiting
 * verification) from a genuine failure, which previously required
 * string-matching the message.
 *
 * `code` narrows that further where the server sets one. The verification
 * gate is the reason it exists: PROFILE_NOT_VERIFIED / COMPANY_NOT_VERIFIED
 * mean "your account isn't live yet", which the UI has to answer by sending
 * the user to their status screen — a different outcome from an ordinary
 * permission failure, and not something worth inferring from prose.
 */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

/** True for the two 403s that mean "not verified yet", from any call site. */
export function isNotVerifiedError(err: unknown): boolean {
  return (
    err instanceof ApiRequestError &&
    (err.code === 'PROFILE_NOT_VERIFIED' || err.code === 'COMPANY_NOT_VERIFIED')
  )
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, headers, _isRetry = false, ...rest } = options

  const finalHeaders = new Headers(headers)
  if (rest.body && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  if (auth && accessToken) {
    finalHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    credentials: 'include', // allow the httpOnly refresh cookie to flow
    headers: finalHeaders,
  })

  if (response.status === 401 && auth && !_isRetry) {
    const renewed = await refreshOnce()
    if (renewed) {
      return apiFetch<T>(path, { ...options, _isRetry: true })
    }
  }

  // 204 No Content (e.g. logout) has no body to parse.
  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json().catch(() => undefined) : undefined

  if (!response.ok) {
    const body = data as ApiErrorBody | undefined
    throw new ApiRequestError(
      body?.message || `Request failed with status ${response.status}`,
      response.status,
      body?.code,
    )
  }

  return data as T
}
