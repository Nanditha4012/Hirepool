import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import { getAnalyticsOverview, type AnalyticsOverview, type CandidateStatus } from '@/lib/adminApi'

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'boost' }) {
  return (
    <Card>
      <p className="text-sm font-medium text-ink/60">{label}</p>
      <p className={['mt-2 text-3xl font-bold', tone === 'danger' ? 'text-danger' : tone === 'boost' ? 'text-boost' : 'text-ink'].join(' ')}>
        {value}
      </p>
    </Card>
  )
}

const STATUS_LABELS: Record<CandidateStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_info: 'Needs info',
}

/** Landing page for /admin — the funnel + fraud-signal numbers at a glance. */
export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getAnalyticsOverview()
        if (!cancelled) setAnalytics(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 text-center sm:px-6 lg:px-10">
        <PageLoader label="Loading dashboard…" />
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{error || 'Failed to load analytics.'}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
      <p className="mt-1 text-ink/60">Platform-wide funnel and fraud signals.</p>

      <h2 className="mt-8 text-lg font-semibold text-ink">Candidate funnel</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {(Object.keys(analytics.candidateFunnel) as CandidateStatus[]).map((status) => (
          <StatTile key={status} label={STATUS_LABELS[status] || status} value={String(analytics.candidateFunnel[status])} />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-ink">Companies</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Total companies" value={String(analytics.companyFunnel.total)} />
        <StatTile label="Verified companies" value={String(analytics.companyFunnel.verified)} />
      </div>

      <Card className="mt-4">
        <h3 className="text-sm font-semibold text-ink">By plan</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink/60">
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Companies</th>
              </tr>
            </thead>
            <tbody>
              {analytics.companyFunnel.byPlan.map((entry) => (
                <tr key={entry.planId ?? 'none'} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 text-ink">{entry.planName}</td>
                  <td className="py-2 pr-4 text-ink/70">{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="mt-8 text-lg font-semibold text-ink">Fraud signals</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Flagged verifications" value={String(analytics.fraudSignals.flaggedVerifications)} tone="danger" />
        <StatTile
          label="Candidates with repeat rejections"
          value={String(analytics.fraudSignals.candidatesWithMultipleRejections)}
          tone="boost"
        />
        <StatTile
          label="Companies with high unlock volume (24h)"
          value={String(analytics.fraudSignals.companiesWithHighUnlockVolume24h)}
          tone="boost"
        />
        <StatTile label="Total candidate blocks" value={String(analytics.fraudSignals.companyBlocksTotal)} />
      </div>

      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">Revenue</Badge>
          <p className="text-sm text-ink/60">
            ₹{analytics.revenue.totalPaid.toLocaleString('en-IN')} collected across {analytics.revenue.paidCount}{' '}
            paid transaction{analytics.revenue.paidCount === 1 ? '' : 's'}
            {analytics.revenue.failedCount > 0 && ` (${analytics.revenue.failedCount} failed)`}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Object.entries(analytics.revenue.byType).map(([type, amount]) => (
            <div key={type} className="rounded-card bg-surface px-3 py-2">
              <p className="text-xs uppercase text-ink/50">{type.replace(/_/g, ' ')}</p>
              <p className="text-lg font-semibold text-ink">₹{amount.toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink/40">
          Lifetime total, not MRR — a real monthly-recurring/churn figure needs subscription-period history this
          running total doesn't capture yet.
        </p>
        <Link to="/admin/payments" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
          View full transaction ledger →
        </Link>
      </Card>
    </div>
  )
}
