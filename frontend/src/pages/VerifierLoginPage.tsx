import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import { useAuth, isAuthSuccess } from '@/lib/authStore'
import { APP_NAME } from '@/lib/config'
import { IMAGES } from '@/lib/images'

/**
 * Staff sign-in for the verification portal.
 *
 * Structurally identical to LoginPage/SignupPage — same split-screen shell,
 * same Card, same Input primitives — so the three auth surfaces read as one
 * product. Only the copy and the photo differ. (An earlier version styled
 * this page as a bespoke dark panel with hand-rolled inputs, which made it
 * look like it belonged to a different app.)
 *
 * Kept as a separate route rather than a toggle on /login because verifiers
 * sign in with a provisioned username instead of an email, never see the
 * Google button, and never sign up.
 *
 * Since Phase 5 verifiers authenticate on plain JWT like every other role;
 * only admin accounts still carry the TOTP challenge, which is why the
 * `isAuthSuccess` branch below is the expected path rather than the
 * exception.
 */
export default function VerifierLoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await login(identifier.trim(), password)

      if (!isAuthSuccess(result)) {
        // Only reachable if these credentials belong to an admin account,
        // which still has a second factor.
        navigate('/onboarding/2fa', {
          state: {
            challengeToken: result.challengeToken,
            enrollmentRequired: 'totpEnrollmentRequired' in result,
          },
        })
        return
      }

      if (result.user.role !== 'verifier') {
        setError(
          `This is the verifier portal, but that account is a ${result.user.role}. Use the main login instead.`,
        )
        return
      }

      navigate('/verify/queue')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-2">
      {/* Photo panel — hidden below lg, where it would push the form off the
          first screen for no benefit. */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-primary-dark to-accent" />
        <img
          src={IMAGES.authVerifier}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="photo-scrim absolute inset-0" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <Logo inverted size="md" className="mb-6" />
          <h2 className="on-photo text-3xl font-extrabold leading-tight text-white">
            Every claim,
            <br />
            checked by a person.
          </h2>
          <p className="on-photo mt-3 max-w-sm text-white/85">
            Work the unverified queue, mark each field yes or no, and push profiles to the main
            portal — or to the rejected catalog.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md animate-fade-up flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Verification portal
          </p>
          <h1 className="mt-3 text-2xl font-bold text-ink">Reviewer sign in</h1>
          <p className="mt-1 text-ink/60">Staff access to the {APP_NAME} candidate queues.</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              placeholder="verifier01"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" loading={loading} className="w-full">
              Sign in to portal
            </Button>
          </form>

          {/* Dev convenience. import.meta.env.DEV is statically replaced at
              build time, so this block is dropped from a production bundle
              rather than merely hidden. */}
          {import.meta.env.DEV && (
            <div className="mt-5 rounded-card border border-dashed border-line px-3 py-2 text-xs text-ink/50">
              <p className="font-semibold text-ink/70">Development defaults</p>
              <p className="mt-1 font-mono">verifier01 / veri1234</p>
            </div>
          )}
        </Card>

        <div className="rounded-card border border-dashed border-line bg-surface/60 px-4 py-3 text-center">
          <p className="text-sm text-ink/60">
            Invited by email but haven&apos;t set a password yet?{' '}
            <Link to="/verifier/signup" className="font-semibold text-primary hover:underline">
              Finish setup →
            </Link>
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Not a reviewer?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Candidate &amp; company login →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
