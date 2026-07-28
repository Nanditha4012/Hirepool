import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import PageLoader from '@/components/ui/PageLoader'
import UserModerationActions from '@/components/admin/UserModerationActions'
import {
  getCandidateDetail,
  listVerifiers,
  updateCandidate,
  updateCandidateBadge,
  type AdminCandidateDetail,
  type AdminVerifierRow,
  type CandidateCategory,
  type CandidateStatus,
} from '@/lib/adminApi'

const statusOptions: { value: CandidateStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'needs_info', label: 'Needs info' },
]

const categoryOptions: { value: CandidateCategory; label: string }[] = [
  { value: 'fresher', label: 'Fresher' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'executive', label: 'Executive' },
]

const badgeStatusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
]

function statusTone(status: string): 'verified' | 'boost' | 'danger' | 'neutral' {
  if (status === 'approved' || status === 'verified') return 'verified'
  if (status === 'rejected') return 'danger'
  if (status === 'under_review' || status === 'needs_info' || status === 'pending') return 'boost'
  return 'neutral'
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<AdminCandidateDetail | null>(null)
  const [verifiers, setVerifiers] = useState<AdminVerifierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusDraft, setStatusDraft] = useState<CandidateStatus | ''>('')
  const [categoryDraft, setCategoryDraft] = useState<CandidateCategory | ''>('')
  const [verifierDraft, setVerifierDraft] = useState('')
  const [savingOverride, setSavingOverride] = useState<string | null>(null)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  const [badgeDrafts, setBadgeDrafts] = useState<Record<string, { status: string; reason: string }>>({})
  const [savingBadgeId, setSavingBadgeId] = useState<string | null>(null)
  const [badgeError, setBadgeError] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [detailResult, verifiersResult] = await Promise.all([getCandidateDetail(id), listVerifiers()])
      setDetail(detailResult)
      setVerifiers(verifiersResult)
      setStatusDraft(detailResult.profile.status)
      setCategoryDraft(detailResult.profile.category || '')
      setVerifierDraft(detailResult.profile.assignedVerifierId || '')
      const drafts: Record<string, { status: string; reason: string }> = {}
      detailResult.badges.forEach((badge) => {
        drafts[badge.id] = { status: badge.verificationStatus, reason: badge.rejectionReason || '' }
      })
      setBadgeDrafts(drafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidate')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleSaveStatus = async () => {
    if (!id || !statusDraft) return
    if (!window.confirm(`Override status to "${statusDraft}"?`)) return
    setSavingOverride('status')
    setOverrideError(null)
    try {
      await updateCandidate(id, { status: statusDraft })
      await load()
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setSavingOverride(null)
    }
  }

  const handleSaveCategory = async () => {
    if (!id || !categoryDraft) return
    setSavingOverride('category')
    setOverrideError(null)
    try {
      await updateCandidate(id, { category: categoryDraft })
      await load()
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to update category')
    } finally {
      setSavingOverride(null)
    }
  }

  const handleReassign = async () => {
    if (!id) return
    setSavingOverride('verifier')
    setOverrideError(null)
    try {
      await updateCandidate(id, { assignedVerifierId: verifierDraft || null })
      await load()
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to reassign verifier')
    } finally {
      setSavingOverride(null)
    }
  }

  const handleSaveBadge = async (badgeId: string) => {
    if (!id) return
    const draft = badgeDrafts[badgeId]
    if (!draft) return
    setSavingBadgeId(badgeId)
    setBadgeError(null)
    try {
      await updateCandidateBadge(id, badgeId, {
        verificationStatus: draft.status as 'pending' | 'verified' | 'rejected',
        rejectionReason: draft.status === 'rejected' ? draft.reason : undefined,
      })
      await load()
    } catch (err) {
      setBadgeError(err instanceof Error ? err.message : 'Failed to update badge')
    } finally {
      setSavingBadgeId(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
        <PageLoader label="Loading candidate…" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Candidate not found.'}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/admin/candidates')}>
            Back to candidates
          </Button>
        </Card>
      </div>
    )
  }

  const verifierOptions = [
    { value: '', label: 'Unassigned' },
    ...verifiers.map((v) => ({ value: v.id, label: v.fullName || v.username || v.email })),
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/admin/candidates')}>
        Back to candidates
      </Button>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{detail.fullName || 'Unnamed candidate'}</h1>
          <p className="mt-1 text-ink/60">{detail.email}{detail.phone ? ` · ${detail.phone}` : ''}</p>
        </div>
        <Badge tone={statusTone(detail.profile.status)}>{detail.profile.status}</Badge>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <h2 className="text-lg font-semibold text-ink">Profile</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink/50">Level</dt>
                <dd className="capitalize text-ink">{detail.profile.category || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Primary role</dt>
                <dd className="text-ink">{detail.profile.primaryRole?.roleName || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Domain</dt>
                <dd className="text-ink">{detail.profile.domain?.domainName || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Years of experience</dt>
                <dd className="text-ink">{detail.profile.yearsOfExperience ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Current company</dt>
                <dd className="text-ink">{detail.profile.currentCompany?.companyName || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Location</dt>
                <dd className="text-ink">{detail.profile.location || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Resume</dt>
                <dd className="text-ink">
                  {detail.profile.resumeLink ? (
                    <a href={detail.profile.resumeLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      View resume
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink/50">Portfolio</dt>
                <dd className="text-ink">
                  {detail.profile.portfolioLink ? (
                    <a href={detail.profile.portfolioLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      View portfolio
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink/50">Submitted</dt>
                <dd className="text-ink">{detail.profile.submittedAt ? new Date(detail.profile.submittedAt).toLocaleString() : '—'}</dd>
              </div>
              {detail.profile.pendingReverification && (
                <div>
                  <dt className="text-ink/50">Re-verification</dt>
                  <dd>
                    <Badge tone="boost">Requested</Badge>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Platform badges</h2>
            {detail.badges.length === 0 && <p className="mt-2 text-sm text-ink/50">No platform badges submitted.</p>}
            <div className="mt-3 flex flex-col gap-4">
              {detail.badges.map((badge) => {
                const draft = badgeDrafts[badge.id] || { status: badge.verificationStatus, reason: badge.rejectionReason || '' }
                return (
                  <div key={badge.id} className="rounded-card border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">
                          {badge.platformName} — {badge.badgeSelected}
                        </p>
                        <a href={badge.platformProfileLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                          {badge.platformProfileLink}
                        </a>
                        <p className="text-xs text-ink/50">{badge.totalQuestionsSolved} questions solved</p>
                      </div>
                      <Badge tone={statusTone(badge.verificationStatus)}>{badge.verificationStatus}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                      <Select
                        label="Verification status"
                        options={badgeStatusOptions}
                        value={draft.status}
                        onChange={(e) =>
                          setBadgeDrafts((prev) => ({ ...prev, [badge.id]: { ...draft, status: e.target.value } }))
                        }
                      />
                      <Input
                        label="Rejection reason"
                        placeholder="Only used when rejecting"
                        value={draft.reason}
                        disabled={draft.status !== 'rejected'}
                        onChange={(e) =>
                          setBadgeDrafts((prev) => ({ ...prev, [badge.id]: { ...draft, reason: e.target.value } }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        loading={savingBadgeId === badge.id}
                        onClick={() => handleSaveBadge(badge.id)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            {badgeError && <p className="mt-2 text-sm text-danger">{badgeError}</p>}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Achievements</h2>
            {detail.achievements.length === 0 && <p className="mt-2 text-sm text-ink/50">No achievements submitted.</p>}
            <div className="mt-3 flex flex-col gap-3">
              {detail.achievements.map((achievement) => (
                <div key={achievement.id} className="rounded-card border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-ink">
                      {achievement.title} <span className="text-xs capitalize text-ink/50">({achievement.type})</span>
                    </p>
                    <Badge tone={statusTone(achievement.verificationStatus)}>{achievement.verificationStatus}</Badge>
                  </div>
                  {achievement.description && <p className="mt-1 text-sm text-ink/60">{achievement.description}</p>}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Verification log</h2>
            {detail.verificationLogs.length === 0 && <p className="mt-2 text-sm text-ink/50">No decisions recorded yet.</p>}
            <div className="mt-3 flex flex-col gap-2">
              {detail.verificationLogs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-2 border-b border-line pb-2 text-sm last:border-0">
                  <div>
                    <Badge tone={statusTone(log.decision)}>{log.decision}</Badge>
                    {log.notes && <p className="mt-1 text-ink/60">{log.notes}</p>}
                  </div>
                  <p className="whitespace-nowrap text-xs text-ink/40">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-lg font-semibold text-ink">Overrides</h2>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex items-end gap-2">
                <Select
                  label="Status"
                  className="flex-1"
                  options={statusOptions}
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value as CandidateStatus)}
                />
                <Button type="button" size="sm" loading={savingOverride === 'status'} onClick={handleSaveStatus}>
                  Save
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <Select
                  label="Level"
                  className="flex-1"
                  options={categoryOptions}
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value as CandidateCategory)}
                />
                <Button type="button" size="sm" loading={savingOverride === 'category'} onClick={handleSaveCategory}>
                  Save
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <Select
                  label="Assigned verifier"
                  className="flex-1"
                  options={verifierOptions}
                  value={verifierDraft}
                  onChange={(e) => setVerifierDraft(e.target.value)}
                />
                <Button type="button" size="sm" loading={savingOverride === 'verifier'} onClick={handleReassign}>
                  Save
                </Button>
              </div>
              {overrideError && <p className="text-sm text-danger">{overrideError}</p>}
            </div>
          </Card>

          <UserModerationActions
            userId={detail.id}
            accountStatus={detail.accountStatus}
            statusReason={detail.statusReason}
            onChanged={load}
            onDeleted={() => navigate('/admin/candidates')}
          />
        </div>
      </div>
    </div>
  )
}
