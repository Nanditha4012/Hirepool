import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import { listPayments, type AdminPaymentRow } from '@/lib/adminApi'

const PAGE_SIZE = 20

const STATUS_TONE: Record<AdminPaymentRow['status'], 'verified' | 'danger' | 'boost' | 'neutral'> = {
  paid: 'verified',
  failed: 'danger',
  created: 'boost',
  refunded: 'neutral',
}

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<AdminPaymentRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
  }, [type, status])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listPayments({
          page,
          limit: PAGE_SIZE,
          type: (type || undefined) as AdminPaymentRow['type'] | undefined,
          status: (status || undefined) as AdminPaymentRow['status'] | undefined,
        })
        if (cancelled) return
        setRows(result.results)
        setTotalCount(result.totalCount)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load payments')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, type, status])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Transaction ledger</h1>
      <p className="mt-1 text-ink/60">
        Every Razorpay-backed payment across subscriptions, unlock top-ups and profile boosts, newest first.
      </p>

      <Card className="mt-6">
        <div className="flex flex-wrap gap-4">
          <Select
            label="Type"
            placeholder="All types"
            options={[
              { value: 'subscription', label: 'Subscription' },
              { value: 'pay_per_unlock', label: 'Pay-per-unlock' },
              { value: 'boost', label: 'Boost' },
            ]}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
          <Select
            label="Status"
            placeholder="All statuses"
            options={[
              { value: 'paid', label: 'Paid' },
              { value: 'created', label: 'Created (awaiting payment)' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ]}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>

        {loading && <PageLoader compact label="Loading payments…" />}
        {!loading && error && <p className="mt-4 text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-ink/50">No payments match these filters.</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/60">
                    <th className="py-2 pr-4 font-medium">Payer</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Razorpay order</th>
                    <th className="py-2 pr-4 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 text-ink">
                        {row.payer ? row.payer.fullName || row.payer.email : '—'}
                        {row.payer && <span className="ml-1 text-xs text-ink/40">({row.payer.role})</span>}
                      </td>
                      <td className="py-2 pr-4 text-ink/70">{row.type.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-4 text-ink">
                        {row.currency} {row.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-ink/50">{row.razorpayOrderId}</td>
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
