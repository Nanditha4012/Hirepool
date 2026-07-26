import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { useAuth } from '@/lib/authStore'
import { APP_NAME } from '@/lib/config'
import { isGoogleConfigured } from '@/lib/googleIdentity'
import { navigateAfterAuth } from '@/lib/postAuthRoute'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      navigateAfterAuth(await login(email, password), navigate)
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
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
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

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={loading} className="w-full">
            Log in
          </Button>
        </form>

        {isGoogleConfigured() && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs uppercase text-ink/40">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <GoogleSignInButton text="signin_with" onCredential={handleGoogleCredential} onError={setError} />
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink/60">
          Don&apos;t have an account?{' '}
          <a href="/signup" className="font-semibold text-primary">
            Sign up
          </a>
        </p>
      </Card>
    </div>
  )
}
