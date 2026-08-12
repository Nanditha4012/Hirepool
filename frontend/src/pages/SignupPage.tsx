import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import RecaptchaWidget from '@/components/RecaptchaWidget'
import { useAuth } from '@/lib/authStore'
import { isGoogleConfigured } from '@/lib/googleIdentity'
import { isRecaptchaConfigured } from '@/lib/recaptcha'
import { navigateAfterAuth } from '@/lib/postAuthRoute'
import { IMAGES } from '@/lib/images'
import Logo from '@/components/ui/Logo'
import PasswordRequirements from '@/components/ui/PasswordRequirements'
import { isStrongPassword } from '@/lib/passwordStrength'

type SignupRole = 'candidate' | 'company'

export default function SignupPage() {
  const [searchParams] = useSearchParams()
  const roleParam = searchParams.get('role')
  const initialRole: SignupRole = roleParam === 'company' ? 'company' : 'candidate'

  const [role, setRole] = useState<SignupRole>(initialRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [consentError, setConsentError] = useState<string | null>(null)
  const [recaptchaError, setRecaptchaError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { signup, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isStrongPassword(password)) {
      setError('Please meet all password requirements below.')
      return
    }
    if (!consentChecked) {
      setConsentError('Please agree to the Terms of Service and Privacy Policy to continue.')
      return
    }
    setConsentError(null)
    if (isRecaptchaConfigured() && !recaptchaToken) {
      setRecaptchaError('Please complete the CAPTCHA to continue.')
      return
    }
    setRecaptchaError(null)
    setLoading(true)
    try {
      await signup(email, password, role, recaptchaToken ?? undefined)
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
    if (!consentChecked) {
      setConsentError('Please agree to the Terms of Service and Privacy Policy to continue.')
      return
    }
    setConsentError(null)
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
    <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-2">
      <div className="mx-auto flex w-full max-w-md animate-fade-up flex-col justify-center gap-6 px-4 py-16 sm:px-6">
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
              role === 'candidate' ? 'bg-card text-primary shadow-soft' : 'text-ink/60',
            ].join(' ')}
          >
            I&apos;m a candidate
          </button>
          <button
            type="button"
            onClick={() => setRole('company')}
            className={[
              'rounded-card py-2 text-sm font-semibold transition-colors',
              role === 'company' ? 'bg-card text-primary shadow-soft' : 'text-ink/60',
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
          <div className="flex flex-col gap-2">
            <Input
              label="Password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <PasswordRequirements password={password} />
          </div>

          <label className="flex items-start gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => {
                setConsentChecked(e.target.checked)
                if (e.target.checked) setConsentError(null)
              }}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-line text-primary focus:ring-primary"
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" className="font-semibold text-primary hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-semibold text-primary hover:underline">
                Privacy Policy
              </Link>
              {role === 'candidate'
                ? ', and understand that my contact details will be shared with companies that unlock my profile.'
                : ", and understand that I'll only see contact details for candidates I unlock, as described in the Privacy Policy."}
            </span>
          </label>
          {consentError && <p className="text-sm text-danger">{consentError}</p>}

          <RecaptchaWidget
            onVerify={(token) => {
              setRecaptchaToken(token)
              setRecaptchaError(null)
            }}
            onExpire={() => setRecaptchaToken(null)}
            onError={setError}
          />
          {recaptchaError && <p className="text-sm text-danger">{recaptchaError}</p>}

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={loading} className="w-full">
            Sign up as {role === 'candidate' ? 'candidate' : 'company'}
          </Button>
        </form>

        {isGoogleConfigured() && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs uppercase text-ink/40">or</span>
              <div className="h-px flex-1 bg-line" />
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
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
        </Card>
      </div>

      {/* Photo panel, swapping with the selected role so the picture matches
          the account being created. Hidden below lg. */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-accent via-primary to-primary-dark" />
        <img
          key={role}
          src={role === 'candidate' ? IMAGES.authCandidate : IMAGES.authCompany}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full animate-fade-in object-cover opacity-30"
        />
        <div className="photo-scrim absolute inset-0" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <Logo inverted size="md" className="mb-6" />
          <h2 className="on-photo text-3xl font-extrabold leading-tight text-white">
            {role === 'candidate' ? (
              <>
                Stop applying.
                <br />
                Start being found.
              </>
            ) : (
              <>
                Skip the resume pile.
                <br />
                Hire from verified talent.
              </>
            )}
          </h2>
          <p className="on-photo mt-3 max-w-sm text-white/85">
            {role === 'candidate'
              ? 'One verified profile, checked field by field by a real reviewer, working for you around the clock.'
              : 'Search a pool where every claim has already been checked, and unlock only the candidates you want.'}
          </p>
        </div>
      </div>
    </div>
  )
}
