import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID } from '@/lib/config'
import { isGoogleConfigured, loadGoogleIdentity } from '@/lib/googleIdentity'

interface Props {
  /** Receives the Google-issued ID token; POST it to /api/auth/google. */
  onCredential: (idToken: string) => void | Promise<void>
  /** Wording on the rendered Google button. */
  text?: 'signin_with' | 'signup_with' | 'continue_with'
  onError?: (message: string) => void
}

/**
 * Renders Google's official sign-in button.
 *
 * Google requires the button to be drawn by their own script (renderButton) —
 * a custom-styled button that calls their API is against the branding terms and
 * silently breaks One Tap — so this component owns an empty div and hands it to
 * GIS to fill in.
 *
 * Renders nothing at all when VITE_GOOGLE_CLIENT_ID is unset, so a developer
 * without Google credentials just sees email+password rather than a button that
 * always errors.
 */
export default function GoogleSignInButton({ onCredential, text = 'continue_with', onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  // Keep the latest callbacks in refs so re-renders don't force GIS to
  // re-initialise (which would wipe the rendered button).
  const onCredentialRef = useRef(onCredential)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onCredentialRef.current = onCredential
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (!isGoogleConfigured()) return
    let cancelled = false

    loadGoogleIdentity()
      .then((api) => {
        if (cancelled || !hostRef.current) return

        api.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (!response.credential) {
              onErrorRef.current?.('Google did not return a credential. Please try again.')
              return
            }
            void onCredentialRef.current(response.credential)
          },
          cancel_on_tap_outside: true,
          auto_select: false,
        })

        api.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          logo_alignment: 'center',
          width: hostRef.current.offsetWidth || undefined,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFailed(true)
        onErrorRef.current?.(err instanceof Error ? err.message : 'Google sign-in is unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [text])

  if (!isGoogleConfigured()) return null

  return (
    <div className="w-full">
      <div ref={hostRef} className="flex w-full justify-center [&>div]:w-full" />
      {failed && (
        <p className="mt-2 text-center text-sm text-ink/60">
          Google sign-in is unavailable right now — use email and password instead.
        </p>
      )}
    </div>
  )
}
