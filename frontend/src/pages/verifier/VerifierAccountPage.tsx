import React, { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PageLoader from '@/components/ui/PageLoader'
import PasswordRequirements from '@/components/ui/PasswordRequirements'
import { isStrongPassword } from '@/lib/passwordStrength'
import {
  changeMyVerifierPassword,
  getMyVerifierAccount,
  updateMyVerifierAccount,
  type VerifierAccount,
} from '@/lib/verifierApi'

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card bg-surface px-4 py-3">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-ink/50">{label}</p>
    </div>
  )
}

/** The signed-in verifier's own account: display details, password, stats. */
export default function VerifierAccountPage() {
  const [account, setAccount] = useState<VerifierAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileNotice, setProfileNotice] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyVerifierAccount()
        if (cancelled) return
        setAccount(result)
        setFullName(result.fullName || '')
        setPhone(result.phone || '')
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load your account')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileNotice(null)
    setProfileError(null)
    try {
      const updated = await updateMyVerifierAccount({
        fullName: fullName.trim() || undefined,
        phone: phone.trim(),
      })
      setAccount(updated)
      setProfileNotice('Saved.')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordNotice(null)
    setPasswordError(null)

    // Checked here rather than server-side: the backend never receives the
    // confirmation field, so this mismatch is only knowable on the client.
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.')
      return
    }
    if (!isStrongPassword(newPassword)) {
      setPasswordError('Please meet all password requirements below.')
      return
    }

    setSavingPassword(true)
    try {
      await changeMyVerifierPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordNotice('Password updated.')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) return <PageLoader label="Loading your account…" />

  if (loadError || !account) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{loadError || 'Could not load your account.'}</p>
        </Card>
      </div>
    )
  }

  const { stats } = account

  return (
    <div className="mx-auto max-w-app-narrow px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">My account</h1>
      <p className="mt-1 text-ink/60">
        Signed in as <span className="font-semibold text-ink">{account.username || account.email}</span>
      </p>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Your review record</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Verified" value={stats.approved} />
          <StatTile label="Rejected" value={stats.rejected} />
          <StatTile label="Sent back" value={stats.needsInfo} />
          <StatTile label="Flagged" value={stats.flagged} />
          <StatTile label="Field checks" value={stats.fieldChecks} />
          <StatTile label="Open now" value={stats.currentlyAssigned} />
        </div>
        <p className="mt-4 text-sm text-ink/60">
          Average time from submission to your decision:{' '}
          <span className="font-semibold text-ink">
            {stats.avgTimeToDecideHours === null
              ? 'no decisions yet'
              : `${stats.avgTimeToDecideHours.toFixed(1)} hours`}
          </span>
        </p>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-ink">Display details</h2>
          <p className="mt-1 text-sm text-ink/60">
            Your name appears on the profile timelines you act on.
          </p>
          <form onSubmit={handleSaveProfile} className="mt-4 flex flex-col gap-4">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div>
              <p className="mb-1 text-sm font-medium text-ink">Username</p>
              <p className="rounded-card bg-surface px-3 py-2 font-mono text-sm text-ink/60">
                {account.username || '—'}
              </p>
              <p className="mt-1 text-xs text-ink/40">
                Set when the account was provisioned — contact an admin to change it.
              </p>
            </div>
            {profileError && <p className="text-sm text-danger">{profileError}</p>}
            {profileNotice && <p className="text-sm text-verified">{profileNotice}</p>}
            <Button type="submit" loading={savingProfile} className="self-start">
              Save changes
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">Change password</h2>
          <p className="mt-1 text-sm text-ink/60">
            If you are still on the provisioned default, change it now.
          </p>
          <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-4">
            <Input
              label="Current password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              label="New password"
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <PasswordRequirements password={newPassword} />
            <Input
              label="Confirm new password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
            {passwordNotice && <p className="text-sm text-verified">{passwordNotice}</p>}
            <Button type="submit" loading={savingPassword} className="self-start">
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
