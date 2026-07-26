import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuth, isAuthSuccess, Role } from '@/lib/authStore'

function roleHomePath(role: Role, hasCategory: boolean): string {
  switch (role) {
    case 'candidate':
      return hasCategory ? '/candidate' : '/onboarding/category'
    case 'company':
      return '/company'
    case 'verifier':
      return '/verify'
    case 'admin':
      return '/admin'
    default:
      return '/'
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
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
      const result = await login(email, password)

      if (isAuthSuccess(result)) {
        const hasCategory = Boolean(result.user.profile?.category)
        navigate(roleHomePath(result.user.role, hasCategory))
        return
      }

      if ('totpRequired' in result) {
        navigate('/onboarding/2fa', {
          state: { challengeToken: result.challengeToken, enrollmentRequired: false },
        })
        return
      }

      // remaining variant: TotpEnrollmentRequired
      navigate('/onboarding/2fa', {
        state: { challengeToken: result.challengeToken, enrollmentRequired: true },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
        <p className="mt-1 text-ink/60">Log in to your {`Hirepool`} account.</p>
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
