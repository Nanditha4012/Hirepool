import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { getMyCompanyProfile, type CompanyProfileResponse } from '@/lib/companyApi'
import PageLoader from '@/components/ui/PageLoader'

export default function DashboardPage() {
  const [profile, setProfile] = useState<CompanyProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyCompanyProfile()
        if (!cancelled) setProfile(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <PageLoader label="Loading your dashboard…" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Something went wrong loading your dashboard.'}</p>
        </Card>
      </div>
    )
  }

  const unlocksTotal = profile.plan?.monthlyUnlocks ?? 0
  const unlocksUsed = Math.max(unlocksTotal - profile.remainingUnlocks, 0)
  const messageCap = profile.plan?.monthlyMessageCap

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{profile.companyName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {profile.verified ? (
              <Badge tone="verified">Verified</Badge>
            ) : (
              <Badge tone="danger">Verification pending</Badge>
            )}
            {profile.plan && <Badge tone="neutral">{profile.plan.name} plan</Badge>}
          </div>
        </div>
        <Link to="/company/setup" className="text-sm font-semibold text-primary">
          Edit company profile
        </Link>
      </div>

      {!profile.verified && (
        <Card className="mt-6 border border-boost/30 bg-boost/5">
          <p className="text-sm text-ink/80">
            Your account is still unverified — you can browse candidates, but contact info stays blurred and
            unlocking is disabled until basic verification passes.
          </p>
        </Card>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium text-ink/60">Unlocks this period</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {unlocksUsed} <span className="text-base font-normal text-ink/50">/ {unlocksTotal}</span>
          </p>
          <p className="mt-1 text-sm text-ink/50">{profile.remainingUnlocks} remaining</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-ink/60">Messaging cap</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {profile.messagesSentThisPeriod}
            <span className="text-base font-normal text-ink/50">
              {' '}
              / {messageCap === null || messageCap === undefined ? 'Unlimited' : messageCap}
            </span>
          </p>
          <p className="mt-1 text-sm text-ink/50">new conversations this period</p>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Link to="/company/search">
          <Card className="h-full transition-shadow hover:shadow-md">
            <h2 className="text-lg font-semibold text-ink">Search candidates</h2>
            <p className="mt-1 text-sm text-ink/60">Browse and filter verified candidate profiles.</p>
          </Card>
        </Link>
        <Link to="/company/unlocked">
          <Card className="h-full transition-shadow hover:shadow-md">
            <h2 className="text-lg font-semibold text-ink">My unlocked candidates</h2>
            <p className="mt-1 text-sm text-ink/60">Candidates you&apos;ve unlocked, with private notes.</p>
          </Card>
        </Link>
        <Link to="/company/messages">
          <Card className="h-full transition-shadow hover:shadow-md">
            <h2 className="text-lg font-semibold text-ink">Messages</h2>
            <p className="mt-1 text-sm text-ink/60">Message candidates directly, no unlock required.</p>
          </Card>
        </Link>
      </div>

      <Card className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Invoices &amp; team seats</h2>
        <p className="mt-1 text-sm text-ink/40">
          Invoice history and Enterprise team-seat management become available once payments ship (Phase 6).
        </p>
      </Card>
    </div>
  )
}
