import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import {
  claimProfile,
  decideProfile,
  getProfileForReview,
  listRejectionReasons,
  type ProfileDecision,
  type RejectionReason,
  type VerifierProfileReview,
} from '@/lib/verifierApi'

const itemStatusTone: Record<string, 'verified' | 'boost' | 'danger' | 'neutral'> = {
  pending: 'boost',
  verified: 'verified',
  rejected: 'danger',
}

const decisionLabels: Record<ProfileDecision, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  needs_info: 'More info requested',
  flagged: 'Flagged as suspicious',
}

export default function ProfileReviewPage() {
  const { id } = useParams<{ id: string }>()

  const [profile, setProfile] = useState<VerifierProfileReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [reasons, setReasons] = useState<RejectionReason[]>([])

  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const [activeDecision, setActiveDecision] = useState<ProfileDecision | null>(null)
  const [reasonId, setReasonId] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [decidedAs, setDecidedAs] = useState<ProfileDecision | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [profileResult, reasonsResult] = await Promise.all([
          getProfileForReview(id),
          listRejectionReasons('profile'),
        ])
        if (cancelled) return
        setProfile(profileResult)
        setReasons(reasonsResult)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load this profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const handleClaim = async () => {
    if (!id) return
    setClaiming(true)
    setClaimError(null)
    try {
      await claimProfile(id)
      const refreshed = await getProfileForReview(id)
      setProfile(refreshed)
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Failed to claim this profile')
    } finally {
      setClaiming(false)
    }
  }

  const openDecision = (decision: ProfileDecision) => {
    setActiveDecision(decision)
    setReasonId('')
    setNote('')
    setSubmitError(null)
  }

  const cancelDecision = () => {
    setActiveDecision(null)
    setReasonId('')
    setNote('')
    setSubmitError(null)
  }

  const handleSubmitDecision = async () => {
    if (!id || !activeDecision) return
    const needsReason = activeDecision === 'rejected' || activeDecision === 'needs_info'
    if (needsReason && !reasonId) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const updated = await decideProfile(id, {
        decision: activeDecision,
        reasonId: needsReason ? reasonId : undefined,
        note: note.trim() || undefined,
      })
      setProfile(updated)
      setDecidedAs(activeDecision)
      setActiveDecision(null)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit decision')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <p className="text-ink/60">Loading profile…</p>
      </div>
    )
  }

  if (loadError || !profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{loadError || 'Profile not found.'}</p>
          <Link to="/verify/queue" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            Back to queue
          </Link>
        </Card>
      </div>
    )
  }

  const isFresher = profile.category === 'fresher'
  const projectAchievements = profile.achievements.filter((a) => a.type === 'project')
  const isClaimed = profile.status !== 'submitted'
  const reasonOptions = reasons.map((r) => ({ value: r.id, label: r.reasonText }))

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link to="/verify/queue" className="text-sm font-medium text-primary hover:underline">
        ← Back to queue
      </Link>

      {/* Candidate summary */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">{profile.fullName || 'Unnamed candidate'}</h1>
            <p className="mt-1 text-sm text-ink/60">{profile.email}{profile.phone ? ` · ${profile.phone}` : ''}</p>
          </div>
          <Badge tone="neutral">{profile.category || 'Uncategorized'}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {profile.primaryRole && <Badge tone="neutral">{profile.primaryRole.roleName}</Badge>}
          {profile.secondaryRoles.map((role) => (
            <Badge key={role.id} tone="neutral">
              {role.roleName}
            </Badge>
          ))}
          {profile.domain && <Badge tone="neutral">{profile.domain.domainName}</Badge>}
          {profile.skills.map((skill) => (
            <Badge key={skill.id} tone="neutral">
              {skill.skillName}
            </Badge>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {profile.resumeLink && (
            <a href={profile.resumeLink} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              View resume ↗
            </a>
          )}
          {profile.portfolioLink && (
            <a href={profile.portfolioLink} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              View portfolio ↗
            </a>
          )}
        </div>

        {profile.latestVerificationNote && (
          <p className="mt-4 rounded-card bg-surface px-3 py-2 text-sm text-ink/70">
            Latest verification note: {profile.latestVerificationNote}
          </p>
        )}
      </Card>

      {/* Track 1 checklist */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Verification checklist</h2>
        <p className="mt-1 text-sm text-ink/60">
          Read-along guidance — not persisted, just a reminder of what to check before deciding.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-ink/80">
          {isFresher ? (
            <>
              <li>
                Confirm each mandatory project link is live
                {projectAchievements.length > 0 && (
                  <ul className="ml-5 mt-1 list-inside list-[circle] space-y-1">
                    {projectAchievements.map((project) => (
                      <li key={project.id}>
                        <a
                          href={project.certificateOrProofLink}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          {project.title} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              <li>Confirm GitHub shows real commit history</li>
              <li>
                Confirm the resume link opens
                {profile.resumeLink && (
                  <>
                    {' — '}
                    <a href={profile.resumeLink} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                      open resume ↗
                    </a>
                  </>
                )}
              </li>
            </>
          ) : (
            <>
              <li>Cross-check LinkedIn against claimed company/title/years</li>
              <li>
                Verify the offer/experience letter looks authentic
                {profile.offerLetterOrLinkedinLink && (
                  <>
                    {' — '}
                    <a
                      href={profile.offerLetterOrLinkedinLink}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      open link ↗
                    </a>
                  </>
                )}
              </li>
              <li>
                Confirm the company-type tag matches the actual employer — claimed as{' '}
                <span className="font-semibold">{profile.companyType || 'not set'}</span>
                {profile.currentCompany && <> at <span className="font-semibold">{profile.currentCompany.companyName}</span></>}
              </li>
            </>
          )}
        </ul>
      </Card>

      {/* Track 2 context */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Badges & achievements</h2>
        <p className="mt-1 text-sm text-ink/60">Reviewed separately in the Badge/Achievement queues — read-only here for context.</p>

        {profile.platformBadges.length === 0 && profile.achievements.length === 0 ? (
          <p className="mt-3 text-sm text-ink/40">No badges or achievements submitted.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {profile.platformBadges.map((badge) => (
              <div key={badge.id} className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
                <p className="text-sm text-ink">
                  {badge.platformName} · {badge.badgeSelected} ({badge.totalQuestionsSolved} solved)
                </p>
                <Badge tone={itemStatusTone[badge.verificationStatus]}>{badge.verificationStatus}</Badge>
              </div>
            ))}
            {profile.achievements.map((achievement) => (
              <div key={achievement.id} className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
                <p className="text-sm text-ink">
                  [{achievement.type}] {achievement.title}
                </p>
                <Badge tone={itemStatusTone[achievement.verificationStatus]}>{achievement.verificationStatus}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Decision panel */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Decision</h2>

        {decidedAs && (
          <div className="mt-3 rounded-card bg-verified/10 px-3 py-2 text-sm text-verified">
            Decision recorded: {decisionLabels[decidedAs]}.{' '}
            <Link to="/verify/queue" className="font-medium underline">
              Back to queue
            </Link>
          </div>
        )}

        {!isClaimed && !decidedAs && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-ink/60">Claim this profile to unlock the decision panel.</p>
            <Button type="button" loading={claiming} onClick={handleClaim} className="self-start">
              Claim to review
            </Button>
            {claimError && <p className="text-sm text-danger">{claimError}</p>}
          </div>
        )}

        {isClaimed && !decidedAs && (
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => openDecision('approved')}>
                Approve
              </Button>
              <Button type="button" variant="danger" onClick={() => openDecision('rejected')}>
                Reject
              </Button>
              <Button type="button" variant="secondary" onClick={() => openDecision('needs_info')}>
                Request More Info
              </Button>
              <Button type="button" variant="secondary" onClick={() => openDecision('flagged')}>
                Flag as Suspicious
              </Button>
            </div>

            {activeDecision && (
              <div className="rounded-card border border-gray-200 p-4">
                <h3 className="font-semibold text-ink">{decisionLabels[activeDecision]}</h3>
                {activeDecision === 'flagged' && (
                  <p className="mt-1 text-xs text-ink/60">
                    Escalates to Admin — does not change this profile&apos;s live status.
                  </p>
                )}

                {(activeDecision === 'rejected' || activeDecision === 'needs_info') && (
                  <div className="mt-3">
                    <Select
                      label="Reason"
                      placeholder="Select a reason…"
                      options={reasonOptions}
                      value={reasonId}
                      onChange={(e) => setReasonId(e.target.value)}
                    />
                  </div>
                )}

                <div className="mt-3">
                  <Input
                    label="Note (optional)"
                    placeholder="Add context for the candidate or admin…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button
                    type="button"
                    loading={submitting}
                    disabled={(activeDecision === 'rejected' || activeDecision === 'needs_info') && !reasonId}
                    onClick={handleSubmitDecision}
                  >
                    Submit
                  </Button>
                  <Button type="button" variant="secondary" onClick={cancelDecision}>
                    Cancel
                  </Button>
                </div>
                {submitError && <p className="mt-2 text-sm text-danger">{submitError}</p>}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
