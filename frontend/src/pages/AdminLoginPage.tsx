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
 * Staff sign-in for the admin portal. Structurally identical to
 * VerifierLoginPage — same shell, same reasoning for being a separate route
 * (provisioned username login, no Google button, no signup).
 *
 * Unlike verifiers, admin accounts still carry a TOTP second factor — but
 * only in production (backend/src/controllers/authController.ts gates the
 * challenge on NODE_ENV === 'production'), so in development this resolves
 * straight to `isAuthSuccess` just like every other role, letting a
 * freshly-seeded admin account log in without an authenticator app.
 */
export default function AdminLoginPage() {
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
        navigate('/onboarding/2fa', {
          state: {
            challengeToken: result.challengeToken,
            enrollmentRequired: 'totpEnrollmentRequired' in result,
          },
        })
        return
      }

      if (result.user.role !== 'admin') {
        setError(`This is the admin portal, but that account is a ${result.user.role}. Use the main login instead.`)
        return
      }

      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-2">
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
            Run the platform,
            <br />
            not just review it.
          </h2>
          <p className="on-photo mt-3 max-w-sm text-white/85">
            Manage candidates, companies, verifiers, master data and platform-wide settings from one
            place.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md animate-fade-up flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Admin portal</p>
          <h1 className="mt-3 text-2xl font-bold text-ink">Admin sign in</h1>
          <p className="mt-1 text-ink/60">Staff access to the {APP_NAME} admin portal.</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              placeholder="admin01"
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
              Sign in to admin
            </Button>
          </form>

          {/* Dev convenience, dropped from the production bundle. */}
          {import.meta.env.DEV && (
            <div className="mt-5 rounded-card border border-dashed border-line px-3 py-2 text-xs text-ink/50">
              <p className="font-semibold text-ink/70">Development defaults</p>
              <p className="mt-1 font-mono">admin01 / admin1234</p>
              <p className="mt-1">TOTP is skipped outside production.</p>
            </div>
          )}
        </Card>

        <div className="rounded-card border border-dashed border-line bg-surface/60 px-4 py-3 text-center">
          <p className="text-sm text-ink/60">
            Not an admin?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Candidate &amp; company login →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
