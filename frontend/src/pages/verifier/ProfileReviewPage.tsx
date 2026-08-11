import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import ChecklistRow, { type RowVerdict } from '@/components/verifier/ChecklistRow'
import Timeline from '@/components/verifier/Timeline'
import { useAuth } from '@/lib/authStore'
import {
  CHECKLIST_GROUP_LABELS,
  claimProfile,
  decideProfile,
  getProfileForReview,
  listRejectionReasons,
  reopenProfile,
  saveFieldChecks,
  type ChecklistGroup,
  type FieldCheckInput,
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
  approved: 'Push to main portal',
  rejected: 'Move to rejected catalog',
  needs_info: 'Send back for more info',
  flagged: 'Flag for admin',
}

const GROUP_ORDER: ChecklistGroup[] = ['identity', 'profile', 'experience', 'proof']

const statusTone: Record<string, 'verified' | 'boost' | 'danger' | 'neutral'> = {
  approved: 'verified',
  rejected: 'danger',
  under_review: 'boost',
  needs_info: 'boost',
  submitted: 'neutral',
  draft: 'neutral',
}

export default function ProfileReviewPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [profile, setProfile] = useState<VerifierProfileReview | null>(null)
  const [reasons, setReasons] = useState<RejectionReason[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /** Answers touched in this session but not yet sent to the server. */
  const [verdicts, setVerdicts] = useState<Record<string, RowVerdict>>({})

  const [claiming, setClaiming] = useState(false)
  const [savingChecks, setSavingChecks] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [activeDecision, setActiveDecision] = useState<ProfileDecision | null>(null)
  const [decisionReasonId, setDecisionReasonId] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [reopenNote, setReopenNote] = useState('')
  const [reopening, setReopening] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [profileResult, reasonsResult] = await Promise.all([
          getProfileForReview(id),
          // Item-scoped reasons: a per-field verdict is about one claim, not
          // the profile as a whole (profile-scoped reasons back the final
          // reject/needs-info decision instead).
          listRejectionReasons('item'),
        ])
        if (cancelled) return
        setProfile(profileResult)
        setReasons(reasonsResult)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load this profile')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const [profileReasons, setProfileReasons] = useState<RejectionReason[]>([])
  useEffect(() => {
    listRejectionReasons('profile')
      .then(setProfileReasons)
      // A failed reason list shouldn't blank the page — the verifier can
      // still decide with a free-text note.
      .catch(() => setProfileReasons([]))
  }, [])

  const savedByKey = useMemo(() => {
    const map = new Map<string, { passed: boolean; reasonText: string | null; checkedAt: string }>()
    for (const check of profile?.fieldChecks ?? []) {
      map.set(check.fieldKey, {
        passed: check.passed,
        reasonText: check.reasonText,
        checkedAt: check.checkedAt,
      })
    }
    return map
  }, [profile])

  /** Merged view of stored + pending answers, which is what the tallies count. */
  const effectiveByKey = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const [key, saved] of savedByKey) map.set(key, saved.passed)
    for (const [key, pending] of Object.entries(verdicts)) map.set(key, pending.passed)
    return map
  }, [savedByKey, verdicts])

  const checklist = profile?.checklist ?? []
  const requiredItems = checklist.filter((item) => item.required)
  const answeredRequired = requiredItems.filter((item) => effectiveByKey.has(item.fieldKey))
  const failedItems = checklist.filter((item) => effectiveByKey.get(item.fieldKey) === false)
  const allRequiredAnswered =
    requiredItems.length > 0 && answeredRequired.length === requiredItems.length

  // Mirrors the backend's resolveCheckReason guard: a No must carry a reason
  // or a note. Blocking here keeps the verifier from losing a decision to a
  // 400 after filling in the whole form.
  const incompleteFailures = Object.entries(verdicts).filter(
    ([, v]) => !v.passed && !v.reasonId && !v.note.trim(),
  )

  const pendingChecks: FieldCheckInput[] = Object.entries(verdicts).map(([fieldKey, verdict]) => ({
    fieldKey,
    fieldLabel: checklist.find((c) => c.fieldKey === fieldKey)?.label,
    passed: verdict.passed,
    reasonId: verdict.reasonId || undefined,
    note: verdict.note.trim() || undefined,
  }))

  const isClaimedByOther = Boolean(
    profile?.assignedVerifierId && user && profile.assignedVerifierId !== user.id,
  )
  const isDecided = profile?.status === 'approved' || profile?.status === 'rejected'
  const canReview = Boolean(profile) && !isClaimedByOther && !isDecided

  const handleVerdictChange = (fieldKey: string, verdict: RowVerdict) => {
    setVerdicts((prev) => ({ ...prev, [fieldKey]: verdict }))
    setNotice(null)
    setActionError(null)
  }

  const handleClaim = async () => {
    if (!id) return
    setClaiming(true)
    setActionError(null)
    try {
      await claimProfile(id)
      setProfile(await getProfileForReview(id))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to claim this profile')
    } finally {
      setClaiming(false)
    }
  }

  const handleSaveChecks = async () => {
    if (!id || pendingChecks.length === 0) return
    if (incompleteFailures.length > 0) {
      setActionError('Every "No" needs a reason or a note before saving.')
      return
    }
    setSavingChecks(true)
    setActionError(null)
    try {
      const updated = await saveFieldChecks(id, pendingChecks)
      setProfile(updated)
      // Cleared only on success — a failed save must not silently discard
      // the verifier's work.
      setVerdicts({})
      setNotice(`Saved ${pendingChecks.length} field check${pendingChecks.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save checks')
    } finally {
      setSavingChecks(false)
    }
  }

  const handleSubmitDecision = async () => {
    if (!id || !activeDecision) return
    const needsReason = activeDecision === 'rejected' || activeDecision === 'needs_info'
    if (needsReason && !decisionReasonId) return
    if (incompleteFailures.length > 0) {
      setActionError('Every "No" needs a reason or a note before deciding.')
      return
    }

    setSubmitting(true)
    setActionError(null)
    try {
      const updated = await decideProfile(id, {
        decision: activeDecision,
        reasonId: needsReason ? decisionReasonId : undefined,
        note: decisionNote.trim() || undefined,
        // Any still-unsaved answers ride along, so the checks and the
        // decision they justify commit together.
        fieldChecks: pendingChecks.length > 0 ? pendingChecks : undefined,
      })
      setProfile(updated)
      setVerdicts({})
      setActiveDecision(null)
      setDecisionReasonId('')
      setDecisionNote('')
      setNotice(
        activeDecision === 'approved'
          ? 'Approved — this profile is now live on the main portal.'
          : `Decision recorded: ${decisionLabels[activeDecision]}.`,
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit decision')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReopen = async () => {
    if (!id || !reopenNote.trim()) return
    setReopening(true)
    setActionError(null)
    try {
      setProfile(await reopenProfile(id, reopenNote.trim()))
      setReopenNote('')
      setNotice('Re-opened — this profile is back in the unverified catalog.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to re-open this profile')
    } finally {
      setReopening(false)
    }
  }

  if (loading) {
    return <PageLoader label="Loading profile…" />
  }

  if (loadError || !profile) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{loadError || 'Profile not found.'}</p>
          <Link to="/verify/queue" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            Back to catalogs
          </Link>
        </Card>
      </div>
    )
  }

  const groupedChecklist = GROUP_ORDER.map((group) => ({
    group,
    items: checklist.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0)

  return (
    <div className="mx-auto max-w-app px-4 py-8 sm:px-6 lg:px-10">
      <Link to="/verify/queue" className="text-sm font-medium text-primary hover:underline">
        ← Back to catalogs
      </Link>

      {/* Candidate summary */}
      <Card className="mt-4 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink">{profile.fullName || 'Unnamed candidate'}</h1>
            <p className="mt-1 text-sm text-ink/60">
              {profile.email}
              {profile.phone ? ` · ${profile.phone}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[profile.status] || 'neutral'}>
              {profile.status.replace('_', ' ')}
            </Badge>
            <Badge tone="neutral">{profile.category || 'Uncategorized'}</Badge>
          </div>
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

        {profile.reverificationRequestedAt && (
          <p className="mt-4 rounded-card bg-boost/10 px-3 py-2 text-sm font-medium text-boost">
            This candidate requested re-verification of new items on{' '}
            {new Date(profile.reverificationRequestedAt).toLocaleDateString()}.
          </p>
        )}

        {profile.latestVerificationNote && (
          <p className="mt-3 rounded-card bg-surface px-3 py-2 text-sm text-ink/70">
            Latest note: {profile.latestVerificationNote}
          </p>
        )}
      </Card>

      {notice && (
        <div className="mt-4 animate-fade-in rounded-card bg-verified/10 px-4 py-3 text-sm font-medium text-verified">
          {notice}{' '}
          <Link to="/verify/queue" className="underline">
            Back to catalogs
          </Link>
        </div>
      )}
      {actionError && (
        <div className="mt-4 animate-fade-in rounded-card bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {actionError}
        </div>
      )}

      {isClaimedByOther && (
        <div className="mt-4 rounded-card bg-boost/10 px-4 py-3 text-sm font-medium text-boost">
          Claimed by {profile.assignedVerifierName || 'another reviewer'} — read-only for you.
        </div>
      )}

      {!profile.assignedVerifierId && !isDecided && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card bg-surface px-4 py-3">
          <p className="text-sm text-ink/70">Claim this profile to start recording checks.</p>
          <Button type="button" size="sm" loading={claiming} onClick={handleClaim}>
            Claim to review
          </Button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Checklist */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Verification checklist</h2>
                <p className="mt-1 text-sm text-ink/60">
                  Mark each field Yes or No. A No needs a reason the candidate will see.
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-ink">
                  {answeredRequired.length}
                  <span className="text-base font-medium text-ink/40">/{requiredItems.length}</span>
                </p>
                <p className="text-xs text-ink/50">required checked</p>
              </div>
            </div>

            {/* Progress bar over required fields only — optional rows
                shouldn't make a complete review look unfinished. */}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-verified transition-all duration-500"
                style={{
                  width: `${requiredItems.length === 0 ? 0 : (answeredRequired.length / requiredItems.length) * 100}%`,
                }}
              />
            </div>

            {failedItems.length > 0 && (
              <p className="mt-3 rounded-card bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
                {failedItems.length} field{failedItems.length === 1 ? '' : 's'} marked No.
                Approving anyway publishes the profile with those errors on record.
              </p>
            )}

            <div className="mt-5 flex flex-col gap-6">
              {groupedChecklist.map(({ group, items }) => (
                <div key={group}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">
                    {CHECKLIST_GROUP_LABELS[group]}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {items.map((item) => (
                      <ChecklistRow
                        key={item.fieldKey}
                        item={item}
                        verdict={verdicts[item.fieldKey]}
                        savedVerdict={savedByKey.get(item.fieldKey)}
                        reasons={reasons}
                        disabled={!canReview}
                        onChange={handleVerdictChange}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {canReview && pendingChecks.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button type="button" variant="secondary" loading={savingChecks} onClick={handleSaveChecks}>
                  Save {pendingChecks.length} check{pendingChecks.length === 1 ? '' : 's'}
                </Button>
                <button
                  type="button"
                  className="text-sm text-ink/50 underline hover:text-ink"
                  onClick={() => setVerdicts({})}
                >
                  Discard unsaved
                </button>
              </div>
            )}
          </Card>

          {/* Badges & achievements — context only, decided in their own queues */}
          <Card>
            <h2 className="text-lg font-semibold text-ink">Badges &amp; achievements</h2>
            <p className="mt-1 text-sm text-ink/60">
              Individually decided in the Badges and Achievements queues — shown here for context.
            </p>

            {profile.platformBadges.length === 0 && profile.achievements.length === 0 ? (
              <p className="mt-3 text-sm text-ink/40">No badges or achievements submitted.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {profile.platformBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
                  >
                    <p className="text-sm text-ink">
                      {badge.platformName} · {badge.badgeSelected} ({badge.totalQuestionsSolved} solved)
                    </p>
                    <Badge tone={itemStatusTone[badge.verificationStatus]}>
                      {badge.verificationStatus}
                    </Badge>
                  </div>
                ))}
                {profile.achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
                  >
                    <p className="text-sm text-ink">
                      [{achievement.type}] {achievement.title}
                    </p>
                    <Badge tone={itemStatusTone[achievement.verificationStatus]}>
                      {achievement.verificationStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Decision + timeline rail */}
        <div className="flex flex-col gap-6">
          <Card className="lg:sticky lg:top-24">
            <h2 className="text-lg font-semibold text-ink">Push this profile</h2>

            {isDecided ? (
              <div className="mt-3">
                <p className="text-sm text-ink/60">
                  Already {profile.status === 'approved' ? 'verified and live' : 'in the rejected catalog'}.
                  Re-open it to review again.
                </p>
                <div className="mt-3">
                  <label htmlFor="reopen-note" className="mb-1 block text-sm font-medium text-ink">
                    Why re-open?
                  </label>
                  <textarea
                    id="reopen-note"
                    rows={2}
                    value={reopenNote}
                    onChange={(e) => setReopenNote(e.target.value)}
                    placeholder="Candidate disputed the outcome…"
                    className="w-full rounded-card border border-line px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 w-full"
                  loading={reopening}
                  disabled={!reopenNote.trim()}
                  onClick={handleReopen}
                >
                  Re-open for review
                </Button>
              </div>
            ) : !canReview ? (
              <p className="mt-3 text-sm text-ink/50">
                Claim this profile (or wait for the current reviewer) to record a decision.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {!allRequiredAnswered && (
                  <p className="rounded-card bg-surface px-3 py-2 text-xs text-ink/60">
                    {requiredItems.length - answeredRequired.length} required field
                    {requiredItems.length - answeredRequired.length === 1 ? '' : 's'} still unchecked.
                    You can still decide, but the record will be incomplete.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <Button type="button" onClick={() => setActiveDecision('approved')}>
                    ✓ Verify &amp; publish
                  </Button>
                  <Button type="button" variant="danger" onClick={() => setActiveDecision('rejected')}>
                    ✕ Reject
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setActiveDecision('needs_info')}>
                    Request more info
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setActiveDecision('flagged')}>
                    Flag for admin
                  </Button>
                </div>

                {activeDecision && (
                  <div className="animate-fade-in rounded-card border border-line p-3">
                    <h3 className="font-semibold text-ink">{decisionLabels[activeDecision]}</h3>
                    {activeDecision === 'flagged' && (
                      <p className="mt-1 text-xs text-ink/60">
                        Escalates to an admin — does not change this profile&apos;s catalog.
                      </p>
                    )}
                    {activeDecision === 'approved' && failedItems.length > 0 && (
                      <p className="mt-1 text-xs font-medium text-boost">
                        Publishing with {failedItems.length} failed check
                        {failedItems.length === 1 ? '' : 's'} recorded against it.
                      </p>
                    )}

                    {(activeDecision === 'rejected' || activeDecision === 'needs_info') && (
                      <div className="mt-3">
                        <Select
                          label="Reason"
                          placeholder="Select a reason…"
                          options={profileReasons.map((r) => ({ value: r.id, label: r.reasonText }))}
                          value={decisionReasonId}
                          onChange={(e) => setDecisionReasonId(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="mt-3">
                      <label htmlFor="decision-note" className="mb-1 block text-sm font-medium text-ink">
                        Note (optional)
                      </label>
                      <textarea
                        id="decision-note"
                        rows={2}
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                        placeholder="Context for the candidate…"
                        className="w-full rounded-card border border-line px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    {pendingChecks.length > 0 && (
                      <p className="mt-2 text-xs text-ink/50">
                        {pendingChecks.length} unsaved check{pendingChecks.length === 1 ? '' : 's'} will
                        be submitted with this decision.
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        loading={submitting}
                        disabled={
                          (activeDecision === 'rejected' || activeDecision === 'needs_info') &&
                          !decisionReasonId
                        }
                        onClick={handleSubmitDecision}
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setActiveDecision(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Timeline</h2>
            <p className="mt-1 text-sm text-ink/60">Everything that has happened to this profile.</p>
            <Timeline entries={profile.timeline} />
          </Card>
        </div>
      </div>
    </div>
  )
}
