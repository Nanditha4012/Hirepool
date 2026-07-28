import { useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import {
  banUser,
  deleteUser,
  impersonateUser,
  reactivateUser,
  suspendUser,
  type UserAccountStatus,
} from '@/lib/adminApi'

interface UserModerationActionsProps {
  userId: string
  accountStatus: UserAccountStatus
  statusReason?: string | null
  /** Called after suspend/ban/reactivate succeeds so the caller can refetch. */
  onChanged: () => void
  /** Called after a successful delete — caller should navigate away. */
  onDeleted?: () => void
  className?: string
}

/**
 * Shared suspend/ban/reactivate/delete/impersonate panel — every field of
 * account moderation is role-agnostic on the backend (candidate, company and
 * verifier accounts all live in `users`), so CandidatesPage and
 * CompaniesPage both mount this instead of duplicating the UI.
 */
export default function UserModerationActions({
  userId,
  accountStatus,
  statusReason,
  onChanged,
  onDeleted,
  className = '',
}: UserModerationActionsProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [impersonateToken, setImpersonateToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const handleSuspend = () => {
    if (!reason.trim()) {
      setError('A reason is required to suspend this account.')
      return
    }
    run('suspend', async () => {
      await suspendUser(userId, reason.trim())
      setReason('')
      onChanged()
    })
  }

  const handleBan = () => {
    if (!reason.trim()) {
      setError('A reason is required to ban this account.')
      return
    }
    run('ban', async () => {
      await banUser(userId, reason.trim())
      setReason('')
      onChanged()
    })
  }

  const handleReactivate = () => {
    run('reactivate', async () => {
      await reactivateUser(userId)
      onChanged()
    })
  }

  const handleDelete = () => {
    if (!window.confirm('Permanently delete this account? This cannot be undone.')) return
    run('delete', async () => {
      await deleteUser(userId)
      onDeleted?.()
    })
  }

  const handleImpersonate = () => {
    run('impersonate', async () => {
      const result = await impersonateUser(userId)
      setImpersonateToken(result.accessToken)
      setCopied(false)
    })
  }

  const handleCopy = async () => {
    if (!impersonateToken) return
    await navigator.clipboard.writeText(impersonateToken)
    setCopied(true)
  }

  return (
    <Card className={className}>
      <h3 className="text-lg font-semibold text-ink">Account moderation</h3>
      <p className="mt-1 text-sm text-ink/60">
        Current status: <span className="font-semibold capitalize">{accountStatus}</span>
        {statusReason && <span className="text-ink/50"> — {statusReason}</span>}
      </p>

      <div className="mt-4 flex flex-col gap-1">
        <label className="text-sm font-medium text-ink" htmlFor={`mod-reason-${userId}`}>
          Reason (required for suspend/ban)
        </label>
        <textarea
          id={`mod-reason-${userId}`}
          className="rounded-card border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          rows={2}
          placeholder="Why is this account being actioned?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {accountStatus !== 'suspended' && (
          <Button type="button" size="sm" variant="secondary" loading={busy === 'suspend'} onClick={handleSuspend}>
            Suspend
          </Button>
        )}
        {accountStatus !== 'banned' && (
          <Button type="button" size="sm" variant="danger" loading={busy === 'ban'} onClick={handleBan}>
            Ban
          </Button>
        )}
        {accountStatus !== 'active' && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={busy === 'reactivate'}
            onClick={handleReactivate}
          >
            Reactivate
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" loading={busy === 'impersonate'} onClick={handleImpersonate}>
          Impersonate
        </Button>
        <Button type="button" size="sm" variant="danger" loading={busy === 'delete'} onClick={handleDelete}>
          Delete account
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {impersonateToken && (
        <div className="mt-4 rounded-card border border-boost/40 bg-boost/10 p-3">
          <p className="text-sm font-medium text-ink">Impersonation token (valid 5 minutes)</p>
          <p className="mt-1 break-all font-mono text-xs text-ink/70">{impersonateToken}</p>
          <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy to clipboard'}
          </Button>
        </div>
      )}
    </Card>
  )
}
