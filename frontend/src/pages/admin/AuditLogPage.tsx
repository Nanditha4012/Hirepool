import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PageLoader from '@/components/ui/PageLoader'
import { listAuditLog, type AdminAuditLogRow } from '@/lib/adminApi'

const PAGE_SIZE = 20

export default function AuditLogPage() {
  const [rows, setRows] = useState<AdminAuditLogRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listAuditLog({ page, limit: PAGE_SIZE })
        if (cancelled) return
        setRows(result.results)
        setTotalCount(result.totalCount)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit log')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Audit log</h1>
      <p className="mt-1 text-ink/60">Every admin-initiated action, newest first.</p>

      <Card className="mt-6">
        {loading && <PageLoader compact label="Loading audit log…" />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-ink/50">No admin actions recorded yet.</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/60">
                    <th className="py-2 pr-4 font-medium">Admin</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Target</th>
                    <th className="py-2 pr-4 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 text-ink">{row.adminFullName || row.adminEmail || row.adminId}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-ink/70">{row.action}</td>
                      <td className="py-2 pr-4 text-ink/70">{row.target || '—'}</td>
                      <td className="py-2 pr-4 text-ink/70">{new Date(row.createdAt).toLocaleString()}</td>
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
