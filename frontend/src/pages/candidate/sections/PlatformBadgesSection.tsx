import { useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import PageLoader from '@/components/ui/PageLoader'
import {
  createPlatformBadge,
  deletePlatformBadge,
  listPlatformBadgeMasters,
  listPlatformBadges,
  updatePlatformBadge,
  type PlatformBadgeMaster,
  type PlatformBadgeRow,
} from '@/lib/candidateApi'

const statusTone: Record<PlatformBadgeRow['verificationStatus'], 'neutral' | 'verified' | 'danger'> = {
  pending: 'neutral',
  verified: 'verified',
  rejected: 'danger',
}

interface FormState {
  platformName: string
  badgeSelected: string
  platformProfileLink: string
  totalQuestionsSolved: string
}

const emptyForm: FormState = {
  platformName: '',
  badgeSelected: '',
  platformProfileLink: '',
  totalQuestionsSolved: '',
}

export default function PlatformBadgesSection() {
  const [rows, setRows] = useState<PlatformBadgeRow[]>([])
  const [masters, setMasters] = useState<PlatformBadgeMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const refetchRows = async () => {
    const list = await listPlatformBadges()
    setRows(list)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [rowsResult, mastersResult] = await Promise.all([listPlatformBadges(), listPlatformBadgeMasters()])
        if (cancelled) return
        setRows(rowsResult)
        setMasters(mastersResult)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load platform badges')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const platformOptions = useMemo(() => {
    const seen = new Set<string>()
    const list: { value: string; label: string }[] = []
    for (const m of masters) {
      if (!seen.has(m.platformName)) {
        seen.add(m.platformName)
        list.push({ value: m.platformName, label: m.platformName })
      }
    }
    return list
  }, [masters])

  const badgeOptions = useMemo(() => {
    return masters
      .filter((m) => m.platformName === form.platformName)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({ value: m.badgeName, label: m.badgeName }))
  }, [masters, form.platformName])

  const startEdit = (row: PlatformBadgeRow) => {
    setEditingId(row.id)
    setForm({
      platformName: row.platformName,
      badgeSelected: row.badgeSelected,
      platformProfileLink: row.platformProfileLink,
      totalQuestionsSolved: row.totalQuestionsSolved ? String(row.totalQuestionsSolved) : '',
    })
    setFormError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const handleDelete = async (id: string) => {
    try {
      await deletePlatformBadge(id)
      await refetchRows()
      if (editingId === id) cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.platformName || !form.badgeSelected || !form.platformProfileLink) {
      setFormError('Platform, badge, and profile link are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const body = {
        platformName: form.platformName,
        badgeSelected: form.badgeSelected,
        platformProfileLink: form.platformProfileLink,
        totalQuestionsSolved: form.totalQuestionsSolved ? Number(form.totalQuestionsSolved) : undefined,
      }
      if (editingId) {
        await updatePlatformBadge(editingId, body)
      } else {
        await createPlatformBadge(body)
      }
      await refetchRows()
      cancelEdit()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader compact label="Loading platform badges…" />

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">
                    {row.platformName} <span className="font-normal text-ink/60">· {row.badgeSelected}</span>
                  </p>
                  <a
                    href={row.platformProfileLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {row.platformProfileLink}
                  </a>
                  {row.totalQuestionsSolved > 0 && (
                    <p className="mt-1 text-sm text-ink/60">{row.totalQuestionsSolved} questions solved</p>
                  )}
                  {row.verificationStatus === 'rejected' && row.rejectionReason && (
                    <p className="mt-1 text-sm text-danger">{row.rejectionReason}</p>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                  <Badge tone={statusTone[row.verificationStatus]}>{row.verificationStatus}</Badge>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(row)}>
                      Edit
                    </Button>
                    <Button type="button" variant="danger" size="sm" onClick={() => handleDelete(row.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-4">
        <p className="mb-3 font-semibold text-ink">{editingId ? 'Edit platform badge' : 'Add a platform'}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Platform"
              placeholder="Choose a platform"
              options={platformOptions}
              value={form.platformName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, platformName: e.target.value, badgeSelected: '' }))
              }
              disabled={Boolean(editingId)}
            />
            <Select
              label="Badge"
              placeholder={form.platformName ? 'Choose a badge' : 'Choose a platform first'}
              options={badgeOptions}
              value={form.badgeSelected}
              onChange={(e) => setForm((prev) => ({ ...prev, badgeSelected: e.target.value }))}
              disabled={!form.platformName}
            />
          </div>
          <Input
            label="Profile link"
            type="url"
            placeholder="https://..."
            value={form.platformProfileLink}
            onChange={(e) => setForm((prev) => ({ ...prev, platformProfileLink: e.target.value }))}
          />
          <Input
            label="Questions solved (optional)"
            type="number"
            min={0}
            value={form.totalQuestionsSolved}
            onChange={(e) => setForm((prev) => ({ ...prev, totalQuestionsSolved: e.target.value }))}
          />
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saving}>
              {editingId ? 'Save changes' : 'Add platform'}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
