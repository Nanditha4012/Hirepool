import { GOOGLE_CLIENT_ID } from './config'

/**
 * Thin wrapper around Google Identity Services (GIS).
 *
 * GIS is loaded lazily from Google's CDN the first time a sign-in button is
 * actually rendered, rather than with a <script> tag in index.html — that keeps
 * it off the critical path for the (majority) of visitors who never touch it,
 * and keeps the landing page working offline in the PWA shell.
 *
 * The flow is the ID-token one, not the OAuth redirect one: GIS hands us a
 * signed JWT in the browser, which we POST to the backend, which verifies it
 * against Google's public keys (google-auth-library) before trusting any of it.
 * Nothing here is a trust boundary — a forged credential simply fails
 * verification server-side.
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client'

export interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleIdApi {
  initialize(options: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    cancel_on_tap_outside?: boolean
    auto_select?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'small' | 'medium' | 'large'
      text?: 'signin_with' | 'signup_with' | 'continue_with'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      width?: number
      logo_alignment?: 'left' | 'center'
    },
  ): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleIdApi
      }
    }
  }
}

/** True when a client ID is configured; the button is hidden entirely if not. */
export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.trim().length > 0
}

let loadPromise: Promise<GoogleIdApi> | null = null

/** Loads the GIS script once and resolves with the `google.accounts.id` API. */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (!isGoogleConfigured()) {
    return Promise.reject(new Error('VITE_GOOGLE_CLIENT_ID is not set'))
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise<GoogleIdApi>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id)
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    const script = existing ?? document.createElement('script')

    const onLoad = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id)
      } else {
        loadPromise = null
        reject(new Error('Google Identity Services loaded but did not initialise'))
      }
    }
    const onError = () => {
      // Reset so a later retry (e.g. after the network comes back) can re-attempt.
      loadPromise = null
      reject(new Error('Could not load Google Identity Services'))
    }

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)

    if (!existing) {
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return loadPromise
}
