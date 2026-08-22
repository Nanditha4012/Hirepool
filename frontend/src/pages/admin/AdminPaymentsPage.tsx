import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import ListSkeleton from '@/components/ui/ListSkeleton'
import { listPayments, approvePayment, rejectPayment, type AdminPaymentRow } from '@/lib/adminApi'

const PAGE_SIZE = 20

const STATUS_TONE: Record<AdminPaymentRow['status'], 'verified' | 'danger' | 'boost' | 'neutral'> = {
  paid: 'verified',
  failed: 'danger',
  created: 'boost',
  submitted: 'boost',
  refunded: 'neutral',
}

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<AdminPaymentRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
  }, [type, status, method])

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await listPayments({
        page,
        limit: PAGE_SIZE,
        type: (type || undefined) as AdminPaymentRow['type'] | undefined,
        status: (status || undefined) as AdminPaymentRow['status'] | undefined,
        method: (method || undefined) as AdminPaymentRow['method'] | undefined,
      })
      setRows(result.results)
      setTotalCount(result.totalCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, type, status, method])

  const handleApprove = async (id: string) => {
    setActionError(null)
    setActioningId(id)
    try {
      await approvePayment(id)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve payment')
    } finally {
      setActioningId(null)
    }
  }

  const handleReject = async (id: string) => {
    setActionError(null)
    setActioningId(id)
    try {
      await rejectPayment(id)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject payment')
    } finally {
      setActioningId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Transaction ledger</h1>
      <p className="mt-1 text-ink/60">
        Every payment across subscriptions, unlock top-ups and profile boosts, newest first — Razorpay-backed and
        manual UPI alike.
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
              { value: 'relevancy_package', label: 'AI relevancy package' },
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
              { value: 'submitted', label: 'Submitted (awaiting review)' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ]}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
          <Select
            label="Method"
            placeholder="All methods"
            options={[
              { value: 'razorpay', label: 'Razorpay' },
              { value: 'upi_manual', label: 'Manual UPI' },
            ]}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
        </div>

        {actionError && <p className="mt-4 text-sm text-danger">{actionError}</p>}

        {loading && <ListSkeleton rows={3} />}
        {!loading && error && <p className="mt-4 text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-ink/50">No payments match these filters.</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[960px] table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink/60">
                    <th className="py-2 pr-4 font-medium">Payer</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Method</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Reference</th>
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Review</th>
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
                      <td className="py-2 pr-4 text-ink/70">{row.method === 'upi_manual' ? 'Manual UPI' : 'Razorpay'}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-ink/50">
                        {row.method === 'upi_manual' ? (
                          <>
                            {row.manualReference}
                            {row.upiUtr && <div className="text-ink/70">UTR: {row.upiUtr}</div>}
                          </>
                        ) : (
                          row.razorpayOrderId
                        )}
                      </td>
                      <td className="py-2 pr-4 text-ink/70">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        {row.method === 'upi_manual' && row.status === 'submitted' && (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              loading={actioningId === row.id}
                              onClick={() => handleApprove(row.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={actioningId === row.id}
                              onClick={() => handleReject(row.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
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
