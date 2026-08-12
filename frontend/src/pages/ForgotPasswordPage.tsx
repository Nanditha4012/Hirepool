import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import PasswordRequirements from '@/components/ui/PasswordRequirements'
import { requestPasswordReset, verifyResetOtp, resetPassword } from '@/lib/passwordResetApi'
import { ApiRequestError } from '@/lib/apiClient'
import { isStrongPassword } from '@/lib/passwordStrength'

type Step = 'email' | 'otp' | 'newPassword' | 'done'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await requestPasswordReset(email.trim())
      setNotice(result.message)
      setStep('otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await verifyResetOtp(email.trim(), otp.trim())
      setResetToken(result.resetToken)
      setNotice(null)
      setStep('newPassword')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isStrongPassword(newPassword)) {
      setError('Please meet all password requirements below.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await resetPassword(resetToken, newPassword)
      setStep('done')
    } catch (err) {
      // A resetToken expires in 15 minutes — if this fails on that, no
      // amount of retrying the form helps; send them back to request a
      // fresh code rather than leaving them stuck on a dead step.
      if (err instanceof ApiRequestError && err.status === 401) {
        setError('Your reset code has expired. Please start again.')
        setStep('email')
        setOtp('')
        setResetToken('')
      } else {
        setError(err instanceof Error ? err.message : 'Could not reset your password')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-md animate-fade-up flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <Logo size="md" className="mx-auto mb-4 justify-center" />
        <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
        <p className="mt-1 text-ink/60">
          {step === 'email' && "We'll email you a one-time code."}
          {step === 'otp' && `Enter the code we sent to ${email}.`}
          {step === 'newPassword' && 'Choose a new password.'}
          {step === 'done' && 'Your password has been reset.'}
        </p>
      </div>

      <Card>
        {step === 'email' && (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Send reset code
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            {notice && <p className="text-sm text-ink/60">{notice}</p>}
            <Input
              label="6-digit code"
              inputMode="numeric"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              autoComplete="one-time-code"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" loading={loading} className="w-full" disabled={otp.length !== 6}>
              Verify code
            </Button>
            <button
              type="button"
              className="text-sm text-ink/60 hover:text-primary hover:underline"
              onClick={() => {
                setStep('email')
                setOtp('')
                setError(null)
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 'newPassword' && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
            <Input
              label="New password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <PasswordRequirements password={newPassword} />
            <Input
              label="Confirm new password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Reset password
            </Button>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink/70">
              You're all set. Any other devices you were signed in on have been signed out — log in there again with
              your new password.
            </p>
            <Button type="button" className="w-full" onClick={() => navigate('/login')}>
              Go to login
            </Button>
          </div>
        )}

        {step !== 'done' && (
          <p className="mt-6 text-center text-sm text-ink/60">
            Remembered your password?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
        )}
      </Card>
    </div>
  )
}
