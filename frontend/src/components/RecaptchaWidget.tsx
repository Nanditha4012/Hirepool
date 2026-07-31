import { useEffect, useRef, useState } from 'react'
import { RECAPTCHA_SITE_KEY } from '@/lib/config'
import { isRecaptchaConfigured, loadRecaptcha } from '@/lib/recaptcha'

interface Props {
  /** Receives the reCAPTCHA token; include it as `recaptchaToken` in the signup request. */
  onVerify: (token: string) => void
  /** Called when a completed challenge expires (v2 widgets expire after a couple minutes) — clear the stored token. */
  onExpire: () => void
  onError?: (message: string) => void
}

/**
 * Renders Google's official reCAPTCHA v2 ("I'm not a robot") checkbox.
 *
 * Google requires the widget to be drawn by their own script (grecaptcha.render) —
 * so this component owns an empty div and hands it to reCAPTCHA to fill in, the
 * same shape as GoogleSignInButton.tsx.
 *
 * Renders nothing at all when VITE_RECAPTCHA_SITE_KEY is unset, so a developer
 * without reCAPTCHA credentials just gets the form as-is, with no token required.
 */
export default function RecaptchaWidget({ onVerify, onExpire, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  // Keep the latest callbacks in refs so re-renders don't force a re-render
  // of the widget (which would reset the user's completed checkbox).
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onVerifyRef.current = onVerify
    onExpireRef.current = onExpire
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (!isRecaptchaConfigured()) return
    let cancelled = false

    loadRecaptcha()
      .then((api) => {
        if (cancelled || !hostRef.current) return

        api.render(hostRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current(),
          'error-callback': () => onErrorRef.current?.('reCAPTCHA is unavailable right now.'),
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFailed(true)
        onErrorRef.current?.(err instanceof Error ? err.message : 'reCAPTCHA is unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!isRecaptchaConfigured()) return null

  return (
    <div className="w-full overflow-x-auto">
      {/* Google's widget renders at a fixed ~304px width that doesn't shrink
          with its container — on a narrow phone (<360px) that can exceed the
          space left inside the auth card's padding. overflow-x-auto keeps it
          scrollable in place instead of clipping or pushing the page wide. */}
      <div ref={hostRef} />
      {failed && (
        <p className="mt-2 text-sm text-ink/60">
          reCAPTCHA is unavailable right now — please try again shortly.
        </p>
      )}
    </div>
  )
}
