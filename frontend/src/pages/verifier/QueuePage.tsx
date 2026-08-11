import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import PageLoader from '@/components/ui/PageLoader'
import { useAuth } from '@/lib/authStore'
import {
  CATALOG_LABELS,
  claimProfile,
  listProfileQueue,
  type CandidateCategory,
  type Catalog,
  type ProfileQueueRow,
} from '@/lib/verifierApi'

const CATALOGS: { value: Catalog; blurb: string; tone: 'boost' | 'verified' | 'danger' }[] = [
  { value: 'unverified', blurb: 'Waiting on a decision', tone: 'boost' },
  { value: 'verified', blurb: 'Live on the main portal', tone: 'verified' },
  { value: 'rejected', blurb: 'Turned down — not visible to companies', tone: 'danger' },
]

const CATEGORIES: { value: CandidateCategory; label: string }[] = [
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

export default function QueuePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [catalog, setCatalog] = useState<Catalog>('unverified')
  const [category, setCategory] = useState<CandidateCategory | null>(null)
  const [search, setSearch] = useState('')
  // Separate from `search` so typing doesn't fire a request per keystroke —
  // see the debounce effect below.
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [rows, setRows] = useState<ProfileQueueRow[]>([])
  const [counts, setCounts] = useState<Record<Catalog, number>>({
    unverified: 0,
    verified: 0,
    rejected: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Bumped by the Refresh button to re-run the fetch effect below. Going
  // through the effect rather than calling the API from the click handler
  // keeps a single fetch path, so a manual refresh gets the same
  // out-of-order-response protection as a filter change.
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listProfileQueue({ catalog, category, q: debouncedSearch })
        if (cancelled) return
        setRows(result.rows)
        setCounts(result.counts)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the queue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, category, debouncedSearch, refreshNonce])

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
                assignedVerifierName: user?.fullName || user?.username || row.assignedVerifierName,
                status: 'under_review',
              }
            : row,
        ),
      )
    } catch (err) {
      setClaimErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : 'Failed to claim profile',
      }))
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Verification catalogs</h1>
          <p className="mt-1 text-ink/60">
            Review candidate profiles, then push them to the main portal or the rejected catalog.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRefreshNonce((n) => n + 1)}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      {/* Catalog tabs. Rendered as big cards rather than plain pills so the
          live counts are readable at a glance from across a desk. */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CATALOGS.map((entry) => {
          const isActive = catalog === entry.value
          return (
            <button
              key={entry.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setCatalog(entry.value)}
              className={[
                'rounded-card border-2 p-4 text-left transition-all duration-200',
                isActive
                  ? 'border-primary bg-primary/5 shadow-lift'
                  : 'border-transparent bg-card shadow-soft hover:-translate-y-0.5 hover:border-primary/30',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{CATALOG_LABELS[entry.value]}</span>
                <Badge tone={entry.tone}>{counts[entry.value]}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink/50">{entry.blurb}</p>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
            className={[
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              category === null
                ? 'bg-primary text-white'
                : 'border border-line text-ink/70 hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            All levels
          </button>
          {CATEGORIES.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={category === tab.value}
              onClick={() => setCategory(tab.value)}
              className={[
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                category === tab.value
                  ? 'bg-primary text-white'
                  : 'border border-line text-ink/70 hover:border-primary hover:text-primary',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ml-auto w-full sm:w-64">
          <Input
            label="Search"
            placeholder="Name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="mt-6">
        {loading && <PageLoader compact label="Loading queue…" />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-ink/50">
            Nothing in the {CATALOG_LABELS[catalog].toLowerCase()} catalog
            {category ? ` for ${category} candidates` : ''}
            {debouncedSearch ? ` matching “${debouncedSearch}”` : ''}.
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink/60">
                  <th className="py-2 pr-4 font-medium">Candidate</th>
                  <th className="py-2 pr-4 font-medium">Level</th>
                  <th className="py-2 pr-4 font-medium">Primary role</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Checks</th>
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
                    <tr
                      key={row.id}
                      className="border-b border-line transition-colors last:border-0 hover:bg-surface/60"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-ink">{row.fullName || 'Unnamed candidate'}</p>
                        {row.email && <p className="text-xs text-ink/50">{row.email}</p>}
                        {row.reverificationRequestedAt && (
                          <Badge tone="boost" className="mt-1">
                            Re-verification requested
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4 capitalize text-ink/70">{row.category || '—'}</td>
                      <td className="py-3 pr-4 text-ink/70">{row.primaryRole?.roleName || '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={statusTone(row.status)}>
                          {statusLabels[row.status] || row.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {row.checksPassed + row.checksFailed === 0 ? (
                          <span className="text-ink/40">Not started</span>
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
                        {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 pr-4 text-ink/70">
                        {row.assignedVerifierId
                          ? isMine
                            ? 'You'
                            : row.assignedVerifierName || 'Assigned'
                          : 'Unclaimed'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-2">
                            {isClaimedByOther ? (
                              <Button type="button" size="sm" variant="secondary" disabled>
                                Claimed
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
                              {catalog === 'unverified' ? 'Review' : 'Open'}
                            </Button>
                          </div>
                          {claimErrors[row.id] && (
                            <p className="text-xs text-danger">{claimErrors[row.id]}</p>
                          )}
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
