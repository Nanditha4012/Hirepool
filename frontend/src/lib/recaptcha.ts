import { RECAPTCHA_SITE_KEY } from './config'

/**
 * Thin wrapper around Google reCAPTCHA v2 ("I'm not a robot" checkbox).
 *
 * Like googleIdentity.ts, the widget script is loaded lazily from Google's
 * CDN the first time it's actually rendered, rather than with a <script> tag
 * in index.html — keeps it off the critical path for the (majority) of
 * visitors, and keeps pages that never render a signup form working offline
 * in the PWA shell.
 *
 * The token this hands back is opaque to the frontend — it's POSTed to the
 * backend as `recaptchaToken`, which verifies it against Google's siteverify
 * endpoint (utils/recaptcha.ts) before trusting any of it. Nothing here is a
 * trust boundary.
 */

const RECAPTCHA_SRC = 'https://www.google.com/recaptcha/api.js'

interface RecaptchaRenderOptions {
  sitekey: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'light' | 'dark'
  size?: 'normal' | 'compact'
}

interface GrecaptchaApi {
  render(container: HTMLElement | string, options: RecaptchaRenderOptions): number
  reset(widgetId?: number): void
  getResponse(widgetId?: number): string
}

declare global {
  interface Window {
    grecaptcha?: GrecaptchaApi
    // reCAPTCHA's async/defer script looks for this global to call once it's
    // ready, when loaded with `?onload=...&render=explicit` (the explicit
    // render mode this app uses, since the widget is mounted into a
    // component-owned div rather than an `data-sitekey` div present at parse
    // time).
    __onRecaptchaLoad?: () => void
  }
}

/** True when a site key is configured; the widget renders nothing if not. */
export function isRecaptchaConfigured(): boolean {
  return RECAPTCHA_SITE_KEY.trim().length > 0
}

let loadPromise: Promise<GrecaptchaApi> | null = null

/** Loads the reCAPTCHA script once and resolves with the `grecaptcha` API. */
export function loadRecaptcha(): Promise<GrecaptchaApi> {
  if (!isRecaptchaConfigured()) {
    return Promise.reject(new Error('VITE_RECAPTCHA_SITE_KEY is not set'))
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise<GrecaptchaApi>((resolve, reject) => {
    if (window.grecaptcha?.render) {
      resolve(window.grecaptcha)
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${RECAPTCHA_SRC}"]`)
    const script = existing ?? document.createElement('script')

    window.__onRecaptchaLoad = () => {
      if (window.grecaptcha?.render) {
        resolve(window.grecaptcha)
      } else {
        loadPromise = null
        reject(new Error('reCAPTCHA loaded but did not initialise'))
      }
    }
    const onError = () => {
      // Reset so a later retry (e.g. after the network comes back) can re-attempt.
      loadPromise = null
      reject(new Error('Could not load reCAPTCHA'))
    }

    script.addEventListener('error', onError)

    if (!existing) {
      script.src = `${RECAPTCHA_SRC}?onload=__onRecaptchaLoad&render=explicit`
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return loadPromise
}
