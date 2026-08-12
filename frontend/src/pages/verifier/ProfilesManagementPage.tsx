import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ListSkeleton from '@/components/ui/ListSkeleton'
import { useAuth } from '@/lib/authStore'
import {
  listAllProfiles,
  type CandidateCategory,
  type CandidateStatus,
  type ProfileQueueRow,
} from '@/lib/verifierApi'

const statusOptions = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'needs_info', label: 'Needs info' },
  { value: 'approved', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
]

const categoryOptions = [
  { value: 'fresher', label: 'Fresher' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'executive', label: 'Executive' },
]

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  needs_info: 'Needs info',
  approved: 'Verified',
  rejected: 'Rejected',
}

function statusTone(status: string): 'verified' | 'boost' | 'danger' | 'neutral' {
  if (status === 'approved') return 'verified'
  if (status === 'rejected') return 'danger'
  if (status === 'under_review' || status === 'needs_info') return 'boost'
  return 'neutral'
}

/**
 * Profile management — every candidate profile that has ever been submitted,
 * across all three catalogs, in one searchable table.
 *
 * The catalogs page is for working the queue; this is for finding a specific
 * candidate after the fact (to re-open a decision, or to answer "what did we
 * say about this person?").
 */
export default function ProfilesManagementPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [status, setStatus] = useState<CandidateStatus | ''>('')
  const [category, setCategory] = useState<CandidateCategory | ''>('')
  const [mineOnly, setMineOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [rows, setRows] = useState<ProfileQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listAllProfiles({
          status: status || null,
          category: category || null,
          q: debouncedSearch,
          mine: mineOnly,
        })
        if (!cancelled) setRows(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profiles')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, category, debouncedSearch, mineOnly])

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Profile management</h1>
      <p className="mt-1 text-ink/60">
        Every submitted candidate profile, across all catalogs. Open one to see its full timeline or
        re-open a decision.
      </p>

      <Card className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Search"
            placeholder="Name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Status"
            placeholder="Any status"
            options={statusOptions}
            value={status}
            onChange={(e) => setStatus(e.target.value as CandidateStatus | '')}
          />
          <Select
            label="Level"
            placeholder="Any level"
            options={categoryOptions}
            value={category}
            onChange={(e) => setCategory(e.target.value as CandidateCategory | '')}
          />
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            Assigned to me only
          </label>
        </div>
      </Card>

      <Card className="mt-6">
        {loading && <ListSkeleton rows={3} />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-ink/50">No profiles match these filters.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <p className="mb-3 text-sm text-ink/50">
              {rows.length} profile{rows.length === 1 ? '' : 's'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/60">
                    <th className="py-2 pr-4 font-medium">Candidate</th>
                    <th className="py-2 pr-4 font-medium">Level</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Checks</th>
                    <th className="py-2 pr-4 font-medium">Last activity</th>
                    <th className="py-2 pr-4 font-medium">Reviewer</th>
                    <th className="py-2 pr-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-line transition-colors last:border-0 hover:bg-surface/60"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-ink">{row.fullName || 'Unnamed candidate'}</p>
                        {row.email && <p className="text-xs text-ink/50">{row.email}</p>}
                      </td>
                      <td className="py-3 pr-4 capitalize text-ink/70">{row.category || '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={statusTone(row.status)}>
                          {statusLabels[row.status] || row.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {row.checksPassed + row.checksFailed === 0 ? (
                          <span className="text-ink/40">—</span>
                        ) : (
                          <span className="whitespace-nowrap font-medium">
                            <span className="text-verified">{row.checksPassed} ✓</span>
                            {row.checksFailed > 0 && (
                              <span className="ml-2 text-danger">{row.checksFailed} ✕</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-ink/70">
                        {new Date(row.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4 text-ink/70">
                        {row.assignedVerifierId
                          ? user && row.assignedVerifierId === user.id
                            ? 'You'
                            : row.assignedVerifierName || 'Assigned'
                          : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/verify/profiles/${row.id}`)}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
