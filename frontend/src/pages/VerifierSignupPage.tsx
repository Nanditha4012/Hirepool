import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import { useAuth } from '@/lib/authStore'
import { APP_NAME } from '@/lib/config'
import { IMAGES } from '@/lib/images'

/**
 * Self-signup for an admin-whitelisted verifier email.
 *
 * Structurally identical to VerifierLoginPage/SignupPage — same split-screen
 * shell — but this is a genuinely different flow from
 * adminController.createVerifier (the "admin picks a username+password for
 * you" path): here the invited person picks their own password, and signs
 * up with their real email rather than a provisioned username. The backend
 * (authController.signup) rejects this with a 403 if the email has no live
 * invite row — that's the only gate, there's nothing to configure client-side.
 */
export default function VerifierSignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { signup } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signup(email.trim(), password, 'verifier')
      navigate('/verify/queue')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
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
            You&apos;ve been
            <br />
            invited.
          </h2>
          <p className="on-photo mt-3 max-w-sm text-white/85">
            An admin whitelisted your email for reviewer access. Set a password to finish setting up
            your account.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md animate-fade-up flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Verification portal</p>
          <h1 className="mt-3 text-2xl font-bold text-ink">Set up your reviewer account</h1>
          <p className="mt-1 text-ink/60">Use the email an admin whitelisted for you at {APP_NAME}.</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Choose a password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" loading={loading} className="w-full">
              Create account
            </Button>
          </form>
        </Card>

        <div className="rounded-card border border-dashed border-line bg-surface/60 px-4 py-3 text-center">
          <p className="text-sm text-ink/60">
            Already set up?{' '}
            <Link to="/verifier/login" className="font-semibold text-primary hover:underline">
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
