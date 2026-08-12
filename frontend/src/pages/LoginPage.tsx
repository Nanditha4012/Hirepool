import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { useAuth } from '@/lib/authStore'
import { APP_NAME } from '@/lib/config'
import { isGoogleConfigured } from '@/lib/googleIdentity'
import { IMAGES } from '@/lib/images'
import Logo from '@/components/ui/Logo'
import { navigateAfterAuth } from '@/lib/postAuthRoute'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login, loginWithGoogle, sessionExpired } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      navigateAfterAuth(await login(email.trim(), password), navigate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  // On the login page the role is only a fallback for a Google account that has
  // never signed up here; an existing account keeps whatever role it holds.
  const handleGoogleCredential = async (idToken: string) => {
    setError(null)
    setLoading(true)
    try {
      navigateAfterAuth(await loginWithGoogle(idToken, 'candidate'), navigate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-2">
      {/* Photo panel. Hidden below lg — on a phone it would push the form
          off the first screen for no benefit. */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-dark via-primary to-accent" />
        <img
          src={IMAGES.authCompany}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        {/* The copy is anchored to the bottom of the panel, so the scrim is
            weighted there — enough contrast under the text without flattening
            the whole photograph. */}
        <div className="photo-scrim absolute inset-0" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <Logo inverted size="md" className="mb-6" />
          <h2 className="on-photo text-3xl font-extrabold leading-tight text-white">
            Get verified once.
            <br />
            Get found repeatedly.
          </h2>
          <p className="on-photo mt-3 max-w-sm text-white/85">
            Your {APP_NAME} profile is reviewed by a person, field by field — then it works for you
            in the background.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md animate-fade-up flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
          <p className="mt-1 text-ink/60">Log in to your {APP_NAME} account.</p>
        </div>

        <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <Link to="/forgot-password" className="-mt-2 self-end text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>

          {/* Explains an unexpected trip back to the login page. Suppressed
              once a real error exists, so a failed retry doesn't stack two
              messages that contradict each other. */}
          {sessionExpired && !error && (
            <p className="rounded-card bg-boost/10 px-3 py-2 text-sm text-ink/80">
              You were signed out after a period of inactivity. Log in to pick up where you left off.
            </p>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={loading} className="w-full">
            Log in
          </Button>
        </form>

        {isGoogleConfigured() && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs uppercase text-ink/40">or</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <GoogleSignInButton text="signin_with" onCredential={handleGoogleCredential} onError={setError} />
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink/60">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Sign up
          </Link>
        </p>
        </Card>

        <div className="rounded-card border border-dashed border-line bg-surface/60 px-4 py-3 text-center">
          <p className="text-sm text-ink/60">
            Reviewing candidates for {APP_NAME}?{' '}
            <Link to="/verifier/login" className="font-semibold text-primary hover:underline">
              Verifier login →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
