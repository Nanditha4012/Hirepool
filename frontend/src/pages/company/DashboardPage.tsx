import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import PageSkeleton from '@/components/ui/PageSkeleton'
import PageHero, { HeroStat } from '@/components/ui/PageHero'
import SupportNote from '@/components/ui/SupportNote'
import UnlockTopUpCard from '@/components/company/UnlockTopUpCard'
import PlanSubscribeCard from '@/components/company/PlanSubscribeCard'
import { getMyCompanyProfile, type CompanyProfileResponse } from '@/lib/companyApi'
import { useSiteSettings } from '@/lib/siteSettings'

/** A destination tile in the "what would you like to do" row. */
function ActionTile({
  to,
  title,
  description,
  icon,
  disabled = false,
  disabledHint,
}: {
  to: string
  title: string
  description: string
  icon: string
  disabled?: boolean
  disabledHint?: string
}) {
  const body = (
    <Card
      interactive={!disabled}
      className={['h-full', disabled ? 'opacity-60' : ''].join(' ')}
    >
      <span className="text-2xl" aria-hidden="true">
        {icon}
      </span>
      <h2 className="mt-3 text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink/60">{disabled ? disabledHint : description}</p>
    </Card>
  )

  // A disabled tile stays on the page (so the company can see what verification
  // will unlock) but must not be a live link.
  return disabled ? <div aria-disabled="true">{body}</div> : <Link to={to}>{body}</Link>
}

export default function DashboardPage() {
  const { settings: siteSettings } = useSiteSettings()
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

  // A company's Home. Skeleton rather than a spinner so clicking Home is a
  // fill-in, not a page blanking and rebuilding itself.
  if (loading) {
    return <PageSkeleton columns={2} blocks={2} />
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{error || 'Something went wrong loading your dashboard.'}</p>
        </Card>
        <SupportNote className="mt-6" />
      </div>
    )
  }

  const unlocksTotal = profile.plan?.monthlyUnlocks ?? 0
  const unlocksUsed = Math.max(unlocksTotal - profile.remainingUnlocks, 0)
  const messageCap = profile.plan?.monthlyMessageCap
  const isVerified = profile.verified

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow="Company portal"
        title={profile.companyName}
        subtitle={
          isVerified
            ? 'You’re verified — the full pool of verified candidates is open to you.'
            : 'An admin is reviewing your company details. Candidate search unlocks the moment that passes.'
        }
        meta={
          <>
            {isVerified ? <Badge tone="verified">✓ Verified</Badge> : <Badge tone="boost">Verification pending</Badge>}
            {profile.plan && <Badge tone="neutral">{profile.plan.name} plan</Badge>}
          </>
        }
        actions={
          <>
            <Link to="/company/setup">
              <Button variant="outlineInverse" size="sm">
                Company profile
              </Button>
            </Link>
            {isVerified && (
              <Link to="/company/search">
                <Button variant="inverse" size="sm">
                  Find candidates
                </Button>
              </Link>
            )}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat label="Unlocks used" value={`${unlocksUsed}/${unlocksTotal}`} hint="this period" />
          <HeroStat label="Remaining" value={profile.remainingUnlocks} hint="unlocks" />
          <HeroStat
            label="Conversations"
            value={profile.messagesSentThisPeriod}
            hint={messageCap == null ? 'unlimited' : `of ${messageCap}`}
          />
          <HeroStat
            label="Renews"
            value={profile.unlocksResetAt ? new Date(profile.unlocksResetAt).toLocaleDateString() : '—'}
          />
        </div>
      </PageHero>

      {!isVerified && (
        <Card className="mt-6 border border-boost/30 bg-boost/5">
          <p className="font-semibold text-ink">Candidate search is locked until verification passes</p>
          <p className="mt-1 text-sm text-ink/70">
            Candidate profiles are only shown to companies an admin has confirmed are genuine. Make sure your
            company name, industry and size are filled in — that&apos;s what the reviewer checks.
          </p>
          <Link to="/company/setup" className="mt-3 inline-block">
            <Button size="sm" variant="secondary">
              Review company profile
            </Button>
          </Link>
        </Card>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <ActionTile
          to="/company/search"
          icon="🔍"
          title="Search candidates"
          description="Browse and filter the verified candidate pool."
          disabled={!isVerified}
          disabledHint="Unlocks once an admin verifies your company."
        />
        <ActionTile
          to="/company/unlocked"
          icon="🔓"
          title="My unlocked candidates"
          description="Candidates you've unlocked, with private notes."
          disabled={!isVerified}
          disabledHint="Unlocks once an admin verifies your company."
        />
        <ActionTile
          to="/company/messages"
          icon="💬"
          title="Messages"
          description="Message candidates directly, no unlock required."
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <UnlockTopUpCard siteSettings={siteSettings} />
        <PlanSubscribeCard plan={profile.plan} siteSettings={siteSettings} />
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Invoices &amp; team seats</h2>
        <p className="mt-1 text-sm text-ink/60">
          Every subscription and unlock top-up payment is on your{' '}
          <Link to="/company/payments" className="font-semibold text-primary hover:underline">
            payment history
          </Link>{' '}
          page.
        </p>
        <p className="mt-1 text-sm text-ink/40">Enterprise team-seat management isn&apos;t available yet.</p>
      </Card>

      <SupportNote className="mt-10" />
    </div>
  )
}
