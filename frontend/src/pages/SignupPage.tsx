import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuth } from '@/lib/authStore'

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

  const handleGoogleClick = () => {
    // TODO: integrate Google Identity Services (accounts.google.com/gsi/client).
    // Once loaded and configured with VITE_GOOGLE_CLIENT_ID, the credential
    // callback receives an idToken which should be passed here:
    //   loginWithGoogle(idToken, role)
    // This is a stub until the GIS script + a live client ID are wired in.
    void loginWithGoogle
    setError('Google signup is not wired up yet — set VITE_GOOGLE_CLIENT_ID and integrate the GIS script.')
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

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs uppercase text-ink/40">or</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <Button variant="secondary" className="w-full" onClick={handleGoogleClick} type="button">
          Continue with Google
        </Button>

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
