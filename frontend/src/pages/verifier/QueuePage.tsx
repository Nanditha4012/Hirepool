import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/lib/authStore'
import {
  claimProfile,
  listProfileQueue,
  type CandidateCategory,
  type ProfileQueueRow,
} from '@/lib/verifierApi'

const tabs: { value: CandidateCategory; label: string }[] = [
  { value: 'fresher', label: 'Fresher' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'executive', label: 'Executive' },
]

export default function QueuePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [category, setCategory] = useState<CandidateCategory>('fresher')
  const [rows, setRows] = useState<ProfileQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const result = await listProfileQueue(category)
        if (!cancelled) setRows(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the queue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [category])

  const handleClaim = async (id: string) => {
    setClaimingId(id)
    setClaimErrors((prev) => ({ ...prev, [id]: '' }))
    try {
      const updated = await claimProfile(id)
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                assignedVerifierId: updated.assignedVerifierId,
                assignedVerifierName: user?.email || row.assignedVerifierName,
                status: 'under_review',
              }
            : row,
        ),
      )
    } catch (err) {
      setClaimErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : 'Failed to claim profile' }))
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Profile queue</h1>
      <p className="mt-1 text-ink/60">Claim and review submitted candidate profiles.</p>

      <div className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={category === tab.value}
            onClick={() => setCategory(tab.value)}
            className={[
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              category === tab.value
                ? 'bg-primary text-white'
                : 'border border-gray-300 text-ink/70 hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="mt-6">
        {loading && <p className="text-ink/60">Loading queue…</p>}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="text-ink/60">No {category} profiles in the queue.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-ink/60">
                  <th className="py-2 pr-4 font-medium">Candidate</th>
                  <th className="py-2 pr-4 font-medium">Primary role</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Submitted</th>
                  <th className="py-2 pr-4 font-medium">Assignee</th>
                  <th className="py-2 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isMine = Boolean(user && row.assignedVerifierId === user.id)
                  const isClaimedByOther = Boolean(row.assignedVerifierId && !isMine)
                  return (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4 font-medium text-ink">{row.fullName || 'Unnamed candidate'}</td>
                      <td className="py-3 pr-4 text-ink/70">{row.primaryRole?.roleName || '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={row.status === 'under_review' ? 'boost' : 'neutral'}>
                          {row.status === 'under_review' ? 'Under review' : 'Submitted'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink/70">
                        {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 pr-4 text-ink/70">
                        {row.assignedVerifierId ? row.assignedVerifierName || 'Assigned' : 'Unclaimed'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-2">
                            {isClaimedByOther ? (
                              <Button type="button" size="sm" disabled>
                                Claimed by {row.assignedVerifierName || 'another verifier'}
                              </Button>
                            ) : !row.assignedVerifierId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                loading={claimingId === row.id}
                                onClick={() => handleClaim(row.id)}
                              >
                                Claim
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => navigate(`/verify/profiles/${row.id}`)}
                            >
                              Review
                            </Button>
                          </div>
                          {claimErrors[row.id] && <p className="text-xs text-danger">{claimErrors[row.id]}</p>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
