import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import PageLoader from '@/components/ui/PageLoader'
import PageHero from '@/components/ui/PageHero'
import SupportNote from '@/components/ui/SupportNote'
import { Detail, DetailGrid, DetailSection, EditIconButton } from '@/components/ui/DetailGrid'
import {
  getMyProfile,
  listAchievements,
  listPlatformBadges,
  submitMyProfile,
  type AchievementRow,
  type CandidateProfileResponse,
  type PlatformBadgeRow,
} from '@/lib/candidateApi'

const statusCopy: Record<
  CandidateProfileResponse['status'],
  { title: string; body: string; tone: 'verified' | 'boost' | 'danger' | 'neutral' }
> = {
  draft: {
    title: 'Draft',
    body: 'You have not submitted this profile yet.',
    tone: 'neutral',
  },
  submitted: {
    title: 'Submitted — in the queue',
    body: 'A verifier will pick your profile up shortly. Nothing more is needed from you right now.',
    tone: 'boost',
  },
  under_review: {
    title: 'Under review',
    body: 'A verifier is checking your details field by field. Results appear below as they are recorded.',
    tone: 'boost',
  },
  approved: {
    title: 'Verified',
    body: 'Your profile is live and discoverable by hiring companies.',
    tone: 'verified',
  },
  rejected: {
    title: 'Not accepted',
    body: 'Your profile was turned down. Fix the points below and resubmit — you do not start over.',
    tone: 'danger',
  },
  needs_info: {
    title: 'More information needed',
    body: 'A verifier needs you to correct or clarify the points below, then resubmit.',
    tone: 'boost',
  },
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
      {children} ↗
    </a>
  )
}

/**
 * The read-only view a candidate sees once they have submitted.
 *
 * This exists because the old flow dropped anyone who had already submitted
 * straight back into the profile *builder* — an editable form asking again
 * for details they had already sent, with no indication of what the verifier
 * had said. Here they get their submission read back to them, plus the
 * per-field verdicts and a full history.
 */
export default function SubmissionReportPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState<CandidateProfileResponse | null>(null)
  const [achievements, setAchievements] = useState<AchievementRow[]>([])
  const [badges, setBadges] = useState<PlatformBadgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [resubmitting, setResubmitting] = useState(false)
  const [resubmitError, setResubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [profileResult, achievementsResult, badgesResult] = await Promise.all([
          getMyProfile(),
          listAchievements(),
          listPlatformBadges(),
        ])
        if (cancelled) return
        setProfile(profileResult)
        setAchievements(achievementsResult)
        setBadges(badgesResult)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your submission')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleResubmit = async () => {
    setResubmitting(true)
    setResubmitError(null)
    try {
      setProfile(await submitMyProfile())
    } catch (err) {
      setResubmitError(err instanceof Error ? err.message : 'Failed to resubmit')
    } finally {
      setResubmitting(false)
    }
  }

  if (loading) return <PageLoader label="Loading your submission…" />

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Could not load your submission.'}</p>
        </Card>
      </div>
    )
  }

  const copy = statusCopy[profile.status]
  const isFresher = profile.category === 'fresher'
  const canResubmit = ['rejected', 'needs_info'].includes(profile.status)
  const failedFields = profile.fieldReview.filter((f) => !f.passed)
  const passedFields = profile.fieldReview.filter((f) => f.passed)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHero
        eyebrow="Your profile"
        title={profile.fullName || 'Your submission'}
        subtitle={
          <>
            Submitted {profile.submittedAt ? new Date(profile.submittedAt).toLocaleDateString() : 'recently'} as
            a <span className="font-semibold capitalize">{profile.category}</span> candidate.
          </>
        }
        meta={<Badge tone={copy.tone}>{copy.title}</Badge>}
        actions={
          <Button variant="inverse" size="sm" onClick={() => navigate('/candidate/edit')}>
            Edit profile
          </Button>
        }
      />

      {/* Status detail */}
      <div
        className={[
          'mt-6 animate-fade-up rounded-card px-5 py-4',
          copy.tone === 'verified'
            ? 'bg-verified/10'
            : copy.tone === 'danger'
              ? 'bg-danger/10'
              : copy.tone === 'boost'
                ? 'bg-boost/10'
                : 'bg-surface',
        ].join(' ')}
      >
        <p className="text-sm text-ink/70">{copy.body}</p>
        {profile.latestVerificationNote && (
          // bg-card, not bg-white/70: a translucent white panel over a tinted
          // status band went almost invisible in dark mode.
          <p className="mt-3 rounded-card bg-card px-3 py-2 text-sm text-ink shadow-soft">
            <span className="font-semibold">Verifier note:</span> {profile.latestVerificationNote}
          </p>
        )}
      </div>

      {/* What the verifier said, field by field */}
      {profile.fieldReview.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold text-ink">Verifier checks</h2>
          <p className="mt-1 text-sm text-ink/60">
            {failedFields.length === 0
              ? 'Every field checked so far has been accepted.'
              : `${failedFields.length} item${failedFields.length === 1 ? '' : 's'} need${failedFields.length === 1 ? 's' : ''} your attention.`}
          </p>

          {failedFields.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {failedFields.map((field) => (
                <div key={field.fieldKey} className="rounded-card border border-danger/30 bg-danger/5 p-3">
                  <p className="font-semibold text-ink">{field.fieldLabel || field.fieldKey}</p>
                  <p className="mt-1 text-sm text-danger">{field.reason || 'Marked as incorrect.'}</p>
                </div>
              ))}
            </div>
          )}

          {passedFields.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">
                Accepted ({passedFields.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {passedFields.map((field) => (
                  <Badge key={field.fieldKey} tone="verified">
                    ✓ {field.fieldLabel || field.fieldKey}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {canResubmit && (
        <Card className="mt-6 border-2 border-primary/20">
          <h2 className="text-lg font-semibold text-ink">Ready to try again?</h2>
          <p className="mt-1 text-sm text-ink/60">
            Fix the points above using Edit profile, then resubmit. Your existing details are kept —
            you are not asked to start from scratch.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => navigate('/candidate/edit')}>
              Edit profile
            </Button>
            <Button loading={resubmitting} onClick={handleResubmit}>
              Resubmit for verification
            </Button>
          </div>
          {resubmitError && <p className="mt-2 text-sm text-danger">{resubmitError}</p>}
        </Card>
      )}

      {/* What was actually submitted, read back as a record rather than a
          form. The pencil is the only way back into the editable builder. */}
      <Card className="mt-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={profile.fullName || profile.email || 'Candidate'} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{profile.fullName || '—'}</p>
              <p className="truncate text-sm text-ink/50">
                {profile.primaryRole?.roleName || 'Role not set'}
                {profile.location ? ` · ${profile.location}` : ''}
              </p>
            </div>
          </div>
          <EditIconButton onClick={() => navigate('/candidate/edit')} label="Edit" />
        </div>

        <DetailSection title="Contact">
          <DetailGrid>
            <Detail label="Email" value={profile.email} />
            <Detail label="Phone" value={profile.phone} />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Role & skills">
          <DetailGrid>
            <Detail label="Primary role" value={profile.primaryRole?.roleName} />
            <Detail label="Domain" value={profile.domain?.domainName} />
            <Detail
              label="Secondary roles"
              wide
              value={profile.secondaryRoles.map((r) => r.roleName).join(', ')}
            />
            <Detail label="Skills" wide value={profile.skills.map((s) => s.skillName).join(', ')} />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Availability & links">
          <DetailGrid>
            <Detail label="Location" value={profile.location} />
            <Detail label="Notice period" value={profile.noticePeriod?.replace(/_/g, ' ')} />
            <Detail
              label="Resume"
              value={profile.resumeLink ? <Link href={profile.resumeLink}>Open</Link> : null}
            />
            <Detail
              label="Portfolio"
              value={profile.portfolioLink ? <Link href={profile.portfolioLink}>Open</Link> : null}
            />
          </DetailGrid>
        </DetailSection>

        {!isFresher && (
          <DetailSection title="Experience">
            <DetailGrid>
              <Detail label="Years of experience" value={profile.yearsOfExperience} />
              <Detail label="Current company" value={profile.currentCompany?.companyName} />
              <Detail label="Designation" value={profile.designationRole?.roleName} />
              <Detail label="Company type" value={profile.companyType?.toUpperCase()} />
              <Detail
                label="Offer letter / LinkedIn"
                wide
                value={
                  profile.offerLetterOrLinkedinLink ? (
                    <Link href={profile.offerLetterOrLinkedinLink}>Open</Link>
                  ) : null
                }
              />
              {profile.category === 'executive' && (
                <>
                  <Detail label="Team size managed" value={profile.teamSizeManaged} />
                  <Detail label="Budget owned" value={profile.budgetOwned} />
                  <Detail label="Title / level" value={profile.titleLevel} />
                </>
              )}
            </DetailGrid>
          </DetailSection>
        )}
      </Card>

      {/* Items */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Projects, work &amp; badges</h2>
        {achievements.length === 0 && badges.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">Nothing submitted.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {achievements.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    <span className="capitalize text-ink/50">{item.type}</span> · {item.title}
                  </p>
                  {item.rejectionReason && (
                    <p className="text-xs text-danger">{item.rejectionReason}</p>
                  )}
                </div>
                <Badge
                  tone={
                    item.verificationStatus === 'verified'
                      ? 'verified'
                      : item.verificationStatus === 'rejected'
                        ? 'danger'
                        : 'boost'
                  }
                >
                  {item.verificationStatus}
                </Badge>
              </div>
            ))}
            {badges.map((badge) => (
              <div
                key={badge.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {badge.platformName} · {badge.badgeSelected}
                  </p>
                  {badge.rejectionReason && (
                    <p className="text-xs text-danger">{badge.rejectionReason}</p>
                  )}
                </div>
                <Badge
                  tone={
                    badge.verificationStatus === 'verified'
                      ? 'verified'
                      : badge.verificationStatus === 'rejected'
                        ? 'danger'
                        : 'boost'
                  }
                >
                  {badge.verificationStatus}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* History */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">History</h2>
        {profile.history.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">Nothing recorded yet.</p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {profile.history.map((entry, index) => (
              <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                <div className="flex flex-col items-center">
                  <span
                    className={[
                      'mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full',
                      entry.tone === 'pass'
                        ? 'bg-verified'
                        : entry.tone === 'fail'
                          ? 'bg-danger'
                          : 'bg-primary',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  {index < profile.history.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-line" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{entry.title}</p>
                  {entry.detail && <p className="mt-0.5 text-sm text-ink/60">{entry.detail}</p>}
                  <p className="mt-0.5 text-xs text-ink/40">{new Date(entry.at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <SupportNote className="mt-10">
        Waiting longer than expected, or something urgent about your submission?
      </SupportNote>
    </div>
  )
}
