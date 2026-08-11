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
  getCompanyDetail,
  grantUnlocks,
  listPlanMasters,
  updateCompany,
  type AdminCompanyDetail,
} from '@/lib/adminApi'

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<AdminCompanyDetail | null>(null)
  const [planOptions, setPlanOptions] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [verifiedDraft, setVerifiedDraft] = useState(false)
  const [planDraft, setPlanDraft] = useState('')
  const [savingOverride, setSavingOverride] = useState<string | null>(null)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  const [grantAmount, setGrantAmount] = useState('')
  const [grantNote, setGrantNote] = useState('')
  const [grantingUnlocks, setGrantingUnlocks] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [detailResult, plans] = await Promise.all([getCompanyDetail(id), listPlanMasters()])
      setDetail(detailResult)
      setVerifiedDraft(detailResult.profile.verified)
      setPlanDraft(detailResult.profile.planId || '')
      setPlanOptions(plans.map((plan) => ({ value: plan.id, label: plan.name })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleToggleVerified = async () => {
    if (!id) return
    setSavingOverride('verified')
    setOverrideError(null)
    try {
      await updateCompany(id, { verified: !verifiedDraft })
      await load()
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to update verification')
    } finally {
      setSavingOverride(null)
    }
  }

  const handleSavePlan = async () => {
    if (!id) return
    setSavingOverride('plan')
    setOverrideError(null)
    try {
      await updateCompany(id, { planId: planDraft || null })
      await load()
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to update plan')
    } finally {
      setSavingOverride(null)
    }
  }

  const handleGrantUnlocks = async () => {
    if (!id) return
    const amount = Number(grantAmount)
    if (!Number.isInteger(amount) || amount <= 0) {
      setGrantError('Enter a positive whole number of unlocks.')
      return
    }
    setGrantingUnlocks(true)
    setGrantError(null)
    try {
      await grantUnlocks(id, { amount, note: grantNote.trim() || undefined })
      setGrantAmount('')
      setGrantNote('')
      await load()
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : 'Failed to grant unlocks')
    } finally {
      setGrantingUnlocks(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 text-center sm:px-6 lg:px-10">
        <PageLoader label="Loading company…" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{error || 'Company not found.'}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/admin/companies')}>
            Back to companies
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/admin/companies')}>
        Back to companies
      </Button>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{detail.profile.companyName}</h1>
          <p className="mt-1 text-ink/60">{detail.email}</p>
        </div>
        <Badge tone={detail.profile.verified ? 'verified' : 'neutral'}>
          {detail.profile.verified ? 'Verified' : 'Unverified'}
        </Badge>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <h2 className="text-lg font-semibold text-ink">Company profile</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink/50">Plan</dt>
                <dd className="text-ink">{detail.profile.plan?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Industry</dt>
                <dd className="text-ink">{detail.profile.industry || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Size</dt>
                <dd className="text-ink">{detail.profile.size || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Website</dt>
                <dd className="text-ink">
                  {detail.profile.website ? (
                    <a href={detail.profile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {detail.profile.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink/50">Remaining unlocks</dt>
                <dd className="text-ink">{detail.profile.remainingUnlocks}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Messages sent this period</dt>
                <dd className="text-ink">{detail.profile.messagesSentThisPeriod}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Total messages sent</dt>
                <dd className="text-ink">{detail.messageCount}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Joined</dt>
                <dd className="text-ink">{new Date(detail.profile.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Unlock history</h2>
            {detail.unlocks.length === 0 && <p className="mt-2 text-sm text-ink/50">No unlocks yet.</p>}
            {detail.unlocks.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[400px] table-auto text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink/60">
                      <th className="py-2 pr-4 font-medium">Candidate ID</th>
                      <th className="py-2 pr-4 font-medium">Unlocked</th>
                      <th className="py-2 pr-4 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.unlocks.map((unlock) => (
                      <tr key={unlock.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink/70">{unlock.candidateId}</td>
                        <td className="py-2 pr-4 text-ink/70">{new Date(unlock.unlockedAt).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-ink/70">{unlock.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Blocked candidates</h2>
            {detail.blocks.length === 0 && <p className="mt-2 text-sm text-ink/50">No blocks recorded.</p>}
            {detail.blocks.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {detail.blocks.map((block) => (
                  <div key={block.id} className="border-b border-line pb-2 text-sm last:border-0">
                    <p className="text-ink/70">Candidate {block.candidateId}</p>
                    {block.reason && <p className="text-ink/50">{block.reason}</p>}
                    <p className="text-xs text-ink/40">{new Date(block.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-lg font-semibold text-ink">Overrides</h2>
            <div className="mt-3 flex flex-col gap-3">
              <Button type="button" size="sm" variant="secondary" loading={savingOverride === 'verified'} onClick={handleToggleVerified}>
                {verifiedDraft ? 'Mark unverified' : 'Mark verified'}
              </Button>

              <div className="flex items-end gap-2">
                <Select
                  label="Plan"
                  className="flex-1"
                  placeholder="No plan"
                  options={planOptions}
                  value={planDraft}
                  onChange={(e) => setPlanDraft(e.target.value)}
                />
                <Button type="button" size="sm" loading={savingOverride === 'plan'} onClick={handleSavePlan}>
                  Save
                </Button>
              </div>
              {overrideError && <p className="text-sm text-danger">{overrideError}</p>}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Grant bonus unlocks</h2>
            <div className="mt-3 flex flex-col gap-3">
              <Input
                label="Amount"
                type="number"
                min={1}
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
              />
              <Input label="Note (optional)" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} />
              {grantError && <p className="text-sm text-danger">{grantError}</p>}
              <Button type="button" size="sm" loading={grantingUnlocks} onClick={handleGrantUnlocks}>
                Grant unlocks
              </Button>
            </div>
          </Card>

          <UserModerationActions
            userId={detail.id}
            accountStatus={detail.accountStatus}
            statusReason={detail.statusReason}
            onChanged={load}
            onDeleted={() => navigate('/admin/companies')}
          />
        </div>
      </div>
    </div>
  )
}
