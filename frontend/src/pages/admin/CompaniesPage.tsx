import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import PageLoader from '@/components/ui/PageLoader'
import { listCompanies, listPlanMasters, type AdminCompanyListRow } from '@/lib/adminApi'

const verifiedOptions = [
  { value: 'true', label: 'Verified' },
  { value: 'false', label: 'Unverified' },
]

const PAGE_SIZE = 20

export default function CompaniesPage() {
  const navigate = useNavigate()

  const [verified, setVerified] = useState<'' | 'true' | 'false'>('')
  const [planId, setPlanId] = useState('')
  const [planOptions, setPlanOptions] = useState<{ value: string; label: string }[]>([])
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<AdminCompanyListRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const plans = await listPlanMasters()
        setPlanOptions(plans.map((plan) => ({ value: plan.id, label: plan.name })))
      } catch {
        // Non-critical — filter just won't have plan options.
      }
    })()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [verified, planId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listCompanies({
          verified: verified || undefined,
          planId: planId || undefined,
          page,
          limit: PAGE_SIZE,
        })
        if (cancelled) return
        setRows(result.results)
        setTotalCount(result.totalCount)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load companies')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [verified, planId, page])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Companies</h1>
      <p className="mt-1 text-ink/60">Every company account. Open one to change plan, verification, or moderate the account.</p>

      <Card className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Verification"
            placeholder="Any"
            options={verifiedOptions}
            value={verified}
            onChange={(e) => setVerified(e.target.value as '' | 'true' | 'false')}
          />
          <Select
            label="Plan"
            placeholder="Any plan"
            options={planOptions}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          />
        </div>
      </Card>

      <Card className="mt-6">
        {loading && <PageLoader compact label="Loading companies…" />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-ink/50">No companies match these filters.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <p className="mb-3 text-sm text-ink/50">{totalCount} compan{totalCount === 1 ? 'y' : 'ies'}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/60">
                    <th className="py-2 pr-4 font-medium">Company</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Verified</th>
                    <th className="py-2 pr-4 font-medium">Unlocks left</th>
                    <th className="py-2 pr-4 font-medium">Joined</th>
                    <th className="py-2 pr-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface/60"
                      onClick={() => navigate(`/admin/companies/${row.id}`)}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-ink">{row.companyName}</p>
                        {row.email && <p className="text-xs text-ink/50">{row.email}</p>}
                      </td>
                      <td className="py-3 pr-4 text-ink/70">{row.plan?.name || '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={row.verified ? 'verified' : 'neutral'}>{row.verified ? 'Verified' : 'Unverified'}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink/70">{row.remainingUnlocks}</td>
                      <td className="py-3 pr-4 text-ink/70">{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 pr-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/admin/companies/${row.id}`)
                          }}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-center gap-4">
              <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <p className="text-sm text-ink/60">
                Page {page} of {totalPages}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
