import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { getAnalytics, type VerifierAnalytics } from '@/lib/verifierApi'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm font-medium text-ink/60">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
    </Card>
  )
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<VerifierAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getAnalytics()
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
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
        <p className="text-ink/60">Loading analytics…</p>
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Failed to load analytics.'}</p>
        </Card>
      </div>
    )
  }

  const avgTimeText =
    analytics.avgTimeToApproveHours === null
      ? 'Not enough data yet'
      : `${analytics.avgTimeToApproveHours.toFixed(1)} hours`

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Analytics</h1>
      <p className="mt-1 text-ink/60">Your verification throughput and outstanding backlog.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Avg. time to approve" value={avgTimeText} />
        <StatTile label="Profiles in queue" value={String(analytics.backlog.profilesSubmitted)} />
        <StatTile label="Badges pending" value={String(analytics.backlog.badgesPending)} />
        <StatTile label="Achievements pending" value={String(analytics.backlog.achievementsPending)} />
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Rejection reason breakdown</h2>
        {analytics.rejectionReasonBreakdown.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">No rejections recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-ink/60">
                  <th className="py-2 pr-4 font-medium">Reason</th>
                  <th className="py-2 pr-4 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {analytics.rejectionReasonBreakdown.map((entry, index) => (
                  <tr key={`${entry.notes}-${index}`} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-ink">{entry.notes || 'No reason given'}</td>
                    <td className="py-2 pr-4 text-ink/70">{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
