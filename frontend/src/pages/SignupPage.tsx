import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { useAuth } from '@/lib/authStore'
import { isGoogleConfigured } from '@/lib/googleIdentity'
import { navigateAfterAuth } from '@/lib/postAuthRoute'

type SignupRole = 'candidate' | 'company'

export default function SignupPage() {
  const [searchParams] = useSearchParams()
  const roleParam = searchParams.get('role')
  const initialRole: SignupRole = roleParam === 'company' ? 'company' : 'candidate'

  const [role, setRole] = useState<SignupRole>(initialRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { signup, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signup(email, password, role)
      navigate(role === 'candidate' ? '/onboarding/category' : '/company')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  // The selected role tab is passed through to the backend: for a brand-new
  // Google account it decides whether a candidate or company profile is created.
  // For an account that already exists, the backend ignores it and keeps the
  // role that account was created with.
  const handleGoogleCredential = async (idToken: string) => {
    setError(null)
    setLoading(true)
    try {
      const result = await loginWithGoogle(idToken, role)
      navigateAfterAuth(result, navigate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">Create your account</h1>
        <p className="mt-1 text-ink/60">Get verified once, get discovered forever.</p>
      </div>

      <Card>
        {/* Role tabs */}
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-card bg-surface p-1">
          <button
            type="button"
            onClick={() => setRole('candidate')}
            className={[
              'rounded-card py-2 text-sm font-semibold transition-colors',
              role === 'candidate' ? 'bg-white text-primary shadow-soft' : 'text-ink/60',
            ].join(' ')}
          >
            I&apos;m a candidate
          </button>
          <button
            type="button"
            onClick={() => setRole('company')}
            className={[
              'rounded-card py-2 text-sm font-semibold transition-colors',
              role === 'company' ? 'bg-white text-primary shadow-soft' : 'text-ink/60',
            ].join(' ')}
          >
            I&apos;m a company
          </button>
        </div>

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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={loading} className="w-full">
            Sign up as {role === 'candidate' ? 'candidate' : 'company'}
          </Button>
        </form>

        {isGoogleConfigured() && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs uppercase text-ink/40">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <GoogleSignInButton
              text="signup_with"
              onCredential={handleGoogleCredential}
              onError={setError}
            />
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink/60">
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-primary">
            Log in
          </a>
        </p>
      </Card>
    </div>
  )
}
