import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import ListSkeleton from '@/components/ui/ListSkeleton'
import {
  approveCompanyRequest,
  listCompanyRequests,
  rejectCompanyRequest,
  type AdminCompanyRequest,
  type CompanyRequestStatus,
} from '@/lib/adminApi'

const tabs: { value: CompanyRequestStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

function ApproveForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [isMnc, setIsMnc] = useState(false)
  const [isFaangMaang, setIsFaangMaang] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApprove = async () => {
    setBusy(true)
    setError(null)
    try {
      await approveCompanyRequest(requestId, { isMnc, isFaangMaang })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isMnc}
            onChange={(e) => setIsMnc(e.target.checked)}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
          />
          MNC
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isFaangMaang}
            onChange={(e) => setIsFaangMaang(e.target.checked)}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
          />
          FAANG / MAANG
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="button" size="sm" loading={busy} onClick={handleApprove}>
        Approve
      </Button>
    </div>
  )
}

function RejectForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReject = async () => {
    if (!reason.trim()) {
      setError('A reason is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await rejectCompanyRequest(requestId, reason.trim())
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-end gap-2">
      <Input
        label="Rejection reason"
        className="flex-1"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button type="button" size="sm" variant="danger" loading={busy} onClick={handleReject}>
        Reject
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

export default function CompanyRequestsPage() {
  const [tab, setTab] = useState<CompanyRequestStatus>('pending')
  const [requests, setRequests] = useState<AdminCompanyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (status: CompanyRequestStatus) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listCompanyRequests(status)
      setRequests(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Company requests</h1>
      <p className="mt-1 text-ink/60">New company names candidates or companies requested that aren&apos;t in the master list yet.</p>

      <div className="mt-6 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
            className={[
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.value ? 'bg-primary text-white' : 'border border-line text-ink/70 hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="mt-6">
        {loading && <ListSkeleton rows={3} />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && requests.length === 0 && (
          <p className="py-8 text-center text-ink/50">No {tab} requests.</p>
        )}
        {!loading && !error && requests.length > 0 && (
          <div className="flex flex-col gap-4">
            {requests.map((request) => (
              <div key={request.id} className="rounded-card border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{request.companyName}</p>
                  <Badge tone={request.status === 'approved' ? 'verified' : request.status === 'rejected' ? 'danger' : 'boost'}>
                    {request.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">Requested {new Date(request.createdAt).toLocaleString()}</p>
                {request.rejectionReason && <p className="mt-1 text-sm text-danger">Reason: {request.rejectionReason}</p>}

                {request.status === 'pending' && (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <ApproveForm requestId={request.id} onDone={() => load(tab)} />
                    <RejectForm requestId={request.id} onDone={() => load(tab)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
