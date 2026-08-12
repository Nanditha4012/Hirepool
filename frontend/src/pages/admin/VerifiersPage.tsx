import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import ListSkeleton from '@/components/ui/ListSkeleton'
import UserModerationActions from '@/components/admin/UserModerationActions'
import {
  createVerifier,
  listVerifiers,
  createVerifierInvite,
  listVerifierInvites,
  deleteVerifierInvite,
  type AdminVerifierRow,
  type AdminVerifierInviteRow,
} from '@/lib/adminApi'

export default function VerifiersPage() {
  const [verifiers, setVerifiers] = useState<AdminVerifierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [managingId, setManagingId] = useState<string | null>(null)

  const [invites, setInvites] = useState<AdminVerifierInviteRow[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [invitesError, setInvitesError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listVerifiers()
      setVerifiers(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load verifiers')
    } finally {
      setLoading(false)
    }
  }

  const loadInvites = async () => {
    setInvitesLoading(true)
    setInvitesError(null)
    try {
      const result = await listVerifierInvites({ limit: 50 })
      setInvites(result.results)
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : 'Failed to load invites')
    } finally {
      setInvitesLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadInvites()
  }, [])

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setInviteError('Enter a valid email.')
      return
    }
    setInviting(true)
    setInviteError(null)
    try {
      await createVerifierInvite(inviteEmail.trim())
      setInviteEmail('')
      await loadInvites()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    try {
      await deleteVerifierInvite(id)
      await loadInvites()
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : 'Failed to revoke invite')
    } finally {
      setRevokingId(null)
    }
  }

  const handleCreate = async () => {
    if (username.trim().length < 3) {
      setCreateError('Username must be at least 3 characters.')
      return
    }
    if (!fullName.trim()) {
      setCreateError('Full name is required.')
      return
    }
    if (password.length < 8) {
      setCreateError('Password must be at least 8 characters.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await createVerifier({ username: username.trim(), fullName: fullName.trim(), password })
      setUsername('')
      setFullName('')
      setPassword('')
      await load()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create verifier')
    } finally {
      setCreating(false)
    }
  }

  const managing = verifiers.find((v) => v.id === managingId) || null

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Verifiers</h1>
      <p className="mt-1 text-ink/60">Verification throughput per reviewer, and provisioning new accounts.</p>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Create verifier</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {createError && <p className="mt-2 text-sm text-danger">{createError}</p>}
        <Button type="button" size="sm" className="mt-4" loading={creating} onClick={handleCreate}>
          Create verifier
        </Button>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Invite by email</h2>
        <p className="mt-1 text-sm text-ink/60">
          Whitelist an email so the invited person can set their own password at{' '}
          <span className="font-mono text-xs">/verifier/signup</span>, instead of you choosing one for them.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="Email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="sm:flex-1"
          />
          <Button type="button" size="sm" loading={inviting} onClick={handleInvite}>
            Send invite
          </Button>
        </div>
        {inviteError && <p className="mt-2 text-sm text-danger">{inviteError}</p>}

        {invitesLoading && <ListSkeleton rows={3} />}
        {!invitesLoading && invitesError && <p className="mt-3 text-sm text-danger">{invitesError}</p>}
        {!invitesLoading && !invitesError && invites.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink/60">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Invited by</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink">{invite.email}</td>
                    <td className="py-2 pr-4 text-ink/60">{invite.invitedByEmail || '—'}</td>
                    <td className="py-2 pr-4">
                      {invite.consumedAt ? (
                        <Badge tone="verified">Used{invite.consumedByUserFullName ? ` — ${invite.consumedByUserFullName}` : ''}</Badge>
                      ) : (
                        <Badge tone="boost">Pending</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {!invite.consumedAt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          loading={revokingId === invite.id}
                          onClick={() => handleRevoke(invite.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        {loading && <ListSkeleton rows={3} />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && verifiers.length === 0 && (
          <p className="py-8 text-center text-ink/50">No verifiers provisioned yet.</p>
        )}
        {!loading && !error && verifiers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink/60">
                  <th className="py-2 pr-4 font-medium">Verifier</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Decisions</th>
                  <th className="py-2 pr-4 font-medium">Avg turnaround</th>
                  <th className="py-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {verifiers.map((verifier) => (
                  <tr key={verifier.id} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{verifier.fullName || verifier.username || verifier.email}</p>
                      <p className="text-xs text-ink/50">{verifier.username ? `@${verifier.username}` : verifier.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={verifier.accountStatus === 'active' ? 'verified' : 'danger'}>{verifier.accountStatus}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-ink/70">{verifier.decisionCount}</td>
                    <td className="py-3 pr-4 text-ink/70">
                      {verifier.avgTurnaroundHours === null ? '—' : `${verifier.avgTurnaroundHours.toFixed(1)}h`}
                    </td>
                    <td className="py-3 pr-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setManagingId(managingId === verifier.id ? null : verifier.id)}
                      >
                        {managingId === verifier.id ? 'Close' : 'Manage'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {managing && (
        <UserModerationActions
          className="mt-6"
          userId={managing.id}
          accountStatus={managing.accountStatus}
          onChanged={async () => {
            await load()
          }}
          onDeleted={async () => {
            setManagingId(null)
            await load()
          }}
        />
      )}
    </div>
  )
}
