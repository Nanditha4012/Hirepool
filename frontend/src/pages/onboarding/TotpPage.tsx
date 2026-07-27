import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuth } from '@/lib/authStore'
import { apiFetch } from '@/lib/apiClient'

interface TotpLocationState {
  challengeToken?: string
  enrollmentRequired?: boolean
}

interface EnrollResponse {
  qrCodeDataUrl: string
  secret: string
}

export default function TotpPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { verifyTotp } = useAuth()

  const state = (location.state || {}) as TotpLocationState
  const { challengeToken, enrollmentRequired } = state

  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Guards against firing the enroll request twice for the same challenge —
  // React 18 StrictMode deliberately double-invokes effects in dev (mount →
  // cleanup → mount). The ref survives that whole dance (it's the same
  // component instance), so it reliably prevents a second network call.
  //
  // Deliberately NOT combined with a `cancelled`-in-cleanup pattern: that
  // closure variable does NOT survive StrictMode's cleanup the way the ref
  // does, so the first run's request would get marked "cancelled" by the
  // synchronous fake-unmount before it resolves — silently discarding the
  // real response and leaving this page stuck on "Setting up your
  // authenticator..." forever, with neither the QR code nor an error ever
  // appearing. The ref alone is sufficient here: at most one request is
  // ever in flight, and its result should always be applied to whichever
  // instance is currently mounted.
  const enrollStartedRef = useRef(false)

  useEffect(() => {
    if (!challengeToken) return
    if (!enrollmentRequired) return
    if (enrollStartedRef.current) return
    enrollStartedRef.current = true

    ;(async () => {
      try {
        const result = await apiFetch<EnrollResponse>('/auth/totp/enroll', {
          method: 'POST',
          body: JSON.stringify({ challengeToken }),
          auth: false,
        })
        setEnrollment(result)
      } catch (err) {
        setEnrollError(err instanceof Error ? err.message : 'Could not start 2FA enrollment')
      }
    })()
  }, [challengeToken, enrollmentRequired])

  if (!challengeToken) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-ink">Missing 2FA challenge</h1>
        <p className="mt-2 text-ink/60">
          This page must be reached from the login flow. Please{' '}
          <a href="/login" className="font-semibold text-primary">
            log in
          </a>{' '}
          again.
        </p>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await verifyTotp(challengeToken, code)
      navigate(result.user.role === 'admin' ? '/admin' : '/verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">Two-factor authentication</h1>
        <p className="mt-1 text-ink/60">
          {enrollmentRequired
            ? 'Scan the QR code with your authenticator app to finish setting up 2FA.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      <Card>
        {enrollmentRequired && (
          <div className="mb-6 flex flex-col items-center gap-3 border-b border-line pb-6">
            {enrollError && <p className="text-sm text-danger">{enrollError}</p>}
            {enrollment ? (
              <>
                <img
                  src={enrollment.qrCodeDataUrl}
                  alt="Scan this QR code with your authenticator app"
                  className="h-40 w-40 rounded-card border border-line"
                />
                <p className="text-center text-xs text-ink/50">
                  Can&apos;t scan it? Enter this code manually:
                </p>
                <code className="rounded-card bg-surface px-3 py-1.5 text-sm font-mono text-ink">
                  {enrollment.secret}
                </code>
              </>
            ) : (
              !enrollError && <p className="text-sm text-ink/50">Setting up your authenticator...</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="6-digit code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={loading} className="w-full">
            Verify
          </Button>
        </form>
      </Card>
    </div>
  )
}
