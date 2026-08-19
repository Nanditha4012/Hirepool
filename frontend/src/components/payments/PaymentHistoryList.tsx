import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import PageLoader from '@/components/ui/PageLoader'
import type { PaymentHistoryResponse, PaymentRow, PaymentStatus } from '@/lib/paymentsApi'

const PAGE_LIMIT = 20

const statusTone: Record<PaymentStatus, 'verified' | 'boost' | 'danger' | 'neutral'> = {
  paid: 'verified',
  created: 'boost',
  failed: 'danger',
  refunded: 'neutral',
}

const statusLabel: Record<PaymentStatus, string> = {
  paid: 'Paid',
  created: 'Processing',
  failed: 'Failed',
  refunded: 'Refunded',
}

/** Human label for a payment row from its type + metadata — payments have
 * no separate "description" field on the backend, so this rebuilds one the
 * same way paymentController.buildPaymentDescription does for its emails. */
function describePayment(row: PaymentRow): string {
  switch (row.type) {
    case 'subscription':
      return 'Plan subscription'
    case 'pay_per_unlock': {
      const quantity = (row.metadata as { unlockQuantity?: number }).unlockQuantity ?? 0
      return `${quantity} unlock credit${quantity === 1 ? '' : 's'}`
    }
    case 'boost': {
      const days = (row.metadata as { boostDays?: number }).boostDays ?? 0
      return `${days}-day profile boost`
    }
    case 'relevancy_package':
      return 'AI relevancy package'
    default:
      return 'Purchase'
  }
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

interface PaymentHistoryListProps {
  fetchHistory: (params: { page: number; limit: number }) => Promise<PaymentHistoryResponse>
}

/**
 * Shared payment-history table for both candidate and company — the two
 * endpoints return an identical shape (paymentController.listMyPayments is
 * literally the same function mounted on both routes), so the only thing
 * that differs per role is which fetcher gets passed in.
 */
export default function PaymentHistoryList({ fetchHistory }: PaymentHistoryListProps) {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchHistory({ page, limit: PAGE_LIMIT })
      .then((result) => {
        if (cancelled) return
        setRows(result.results)
        setTotalCount(result.totalCount)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load payment history')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchHistory, page])

  const totalPages = Math.max(Math.ceil(totalCount / PAGE_LIMIT), 1)

  if (loading && rows.length === 0) {
    return <PageLoader label="Loading payment history…" compact />
  }

  if (error) {
    return (
      <Card>
        <p className="text-danger">{error}</p>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink/40">No payments yet.</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{describePayment(row)}</td>
                  <td className="px-4 py-3 text-ink">{formatAmount(row.amount, row.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[row.status]}>{statusLabel[row.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink/50">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
