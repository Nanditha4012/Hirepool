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

interface ApiFetchOptions extends RequestInit {
  /** Attach `Authorization: Bearer <token>` from the in-memory access token. Defaults to true. */
  auth?: boolean
}

interface ApiErrorBody {
  message?: string
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options

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

  // 204 No Content (e.g. logout) has no body to parse.
  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json().catch(() => undefined) : undefined

  if (!response.ok) {
    const body = data as ApiErrorBody | undefined
    throw new Error(body?.message || `Request failed with status ${response.status}`)
  }

  return data as T
}
