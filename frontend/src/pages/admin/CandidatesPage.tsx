import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ListSkeleton from '@/components/ui/ListSkeleton'
import {
  downloadCandidatesCsv,
  listCandidates,
  type AdminCandidateListRow,
  type CandidateCategory,
  type CandidateStatus,
} from '@/lib/adminApi'

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'needs_info', label: 'Needs info' },
]

const categoryOptions = [
  { value: 'fresher', label: 'Fresher' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'executive', label: 'Executive' },
]

function statusTone(status: string): 'verified' | 'boost' | 'danger' | 'neutral' {
  if (status === 'approved') return 'verified'
  if (status === 'rejected') return 'danger'
  if (status === 'under_review' || status === 'needs_info') return 'boost'
  return 'neutral'
}

const PAGE_SIZE = 20

export default function CandidatesPage() {
  const navigate = useNavigate()

  const [status, setStatus] = useState<CandidateStatus | ''>('')
  const [category, setCategory] = useState<CandidateCategory | ''>('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<AdminCandidateListRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [status, category, debouncedSearch])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listCandidates({
          status: status || undefined,
          category: category || undefined,
          q: debouncedSearch || undefined,
          page,
          limit: PAGE_SIZE,
        })
        if (cancelled) return
        setRows(result.results)
        setTotalCount(result.totalCount)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load candidates')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, category, debouncedSearch, page])

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await downloadCandidatesCsv({
        status: status || undefined,
        category: category || undefined,
        q: debouncedSearch || undefined,
      })
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export candidates')
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Candidates</h1>
          <p className="mt-1 text-ink/60">Every candidate account. Open one to override status, category, or moderate the account.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button type="button" variant="secondary" size="sm" loading={exporting} onClick={handleExport}>
            Export CSV
          </Button>
          {exportError && <p className="text-xs text-danger">{exportError}</p>}
        </div>
      </div>

      <Card className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </Card>

      <Card className="mt-6">
        {loading && <ListSkeleton rows={3} />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-ink/50">No candidates match these filters.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <p className="mb-3 text-sm text-ink/50">{totalCount} candidate{totalCount === 1 ? '' : 's'}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/60">
                    <th className="py-2 pr-4 font-medium">Candidate</th>
                    <th className="py-2 pr-4 font-medium">Level</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Last activity</th>
                    <th className="py-2 pr-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface/60"
                      onClick={() => navigate(`/admin/candidates/${row.id}`)}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-ink">{row.fullName || 'Unnamed candidate'}</p>
                        {row.email && <p className="text-xs text-ink/50">{row.email}</p>}
                      </td>
                      <td className="py-3 pr-4 capitalize text-ink/70">{row.category || '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={statusTone(row.status)}>{statusOptions.find((s) => s.value === row.status)?.label || row.status}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink/70">{new Date(row.updatedAt).toLocaleDateString()}</td>
                      <td className="py-3 pr-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/admin/candidates/${row.id}`)
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
