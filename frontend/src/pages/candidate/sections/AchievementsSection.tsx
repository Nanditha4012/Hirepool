import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PageLoader from '@/components/ui/PageLoader'
import {
  createAchievement,
  deleteAchievement,
  listAchievements,
  updateAchievement,
  type AchievementRow,
  type AchievementType,
} from '@/lib/candidateApi'

const typeLabel: Record<AchievementType, string> = {
  project: 'Project',
  research: 'Research paper',
  achievement: 'Achievement',
}

const statusTone: Record<AchievementRow['verificationStatus'], 'neutral' | 'verified' | 'danger'> = {
  pending: 'neutral',
  verified: 'verified',
  rejected: 'danger',
}

interface FormState {
  title: string
  description: string
  links: string
  certificateOrProofLink: string
}

const emptyForm: FormState = { title: '', description: '', links: '', certificateOrProofLink: '' }

interface TypeGroupProps {
  type: AchievementType
  rows: AchievementRow[]
  onChanged: () => void
}

function TypeGroup({ type, rows, onChanged }: TypeGroupProps) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const startAdd = () => {
    setAdding(true)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const startEdit = (row: AchievementRow) => {
    setEditingId(row.id)
    setAdding(false)
    setForm({
      title: row.title,
      description: row.description || '',
      links: row.links || '',
      certificateOrProofLink: row.certificateOrProofLink,
    })
    setFormError(null)
  }

  const cancel = () => {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const handleDelete = async (id: string) => {
    setDeleteError(null)
    try {
      await deleteAchievement(id)
      onChanged()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.certificateOrProofLink) {
      setFormError('Title and certificate/proof link are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const body = {
        title: form.title,
        description: form.description || undefined,
        links: form.links || undefined,
        certificateOrProofLink: form.certificateOrProofLink,
      }
      if (editingId) {
        await updateAchievement(editingId, body)
      } else {
        await createAchievement({ type, ...body })
      }
      onChanged()
      cancel()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const showForm = adding || editingId

  return (
    <div className="flex flex-col gap-3">
      <p className="font-semibold text-ink">{typeLabel[type]}s</p>
      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      {rows.map((row) => (
        <Card key={row.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-ink">{row.title}</p>
              {row.description && <p className="mt-1 text-sm text-ink/60">{row.description}</p>}
              {row.links && (
                <a href={row.links} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                  {row.links}
                </a>
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
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={row.verificationStatus === 'verified'}
                  title={row.verificationStatus === 'verified' ? 'Verified entries cannot be deleted' : undefined}
                  onClick={() => handleDelete(row.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}

      {showForm ? (
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <Input
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <Input
              label="Links (optional)"
              type="url"
              placeholder="https://..."
              value={form.links}
              onChange={(e) => setForm((prev) => ({ ...prev, links: e.target.value }))}
            />
            <Input
              label="Certificate / proof link"
              type="url"
              placeholder="https://..."
              value={form.certificateOrProofLink}
              onChange={(e) => setForm((prev) => ({ ...prev, certificateOrProofLink: e.target.value }))}
            />
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={saving}>
                {editingId ? 'Save changes' : `Add ${typeLabel[type].toLowerCase()}`}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={startAdd}>
          + Add {typeLabel[type].toLowerCase()}
        </Button>
      )}
    </div>
  )
}

interface AchievementsSectionProps {
  typesToShow: AchievementType[]
}

export default function AchievementsSection({ typesToShow }: AchievementsSectionProps) {
  const [rows, setRows] = useState<AchievementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = async () => {
    try {
      const results = await Promise.all(typesToShow.map((t) => listAchievements(t)))
      setRows(results.flat())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load achievements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const results = await Promise.all(typesToShow.map((t) => listAchievements(t)))
        if (!cancelled) setRows(results.flat())
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load achievements')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesToShow.join(',')])

  if (loading) return <PageLoader compact label="Loading achievements…" />

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-danger">{error}</p>}
      {typesToShow.map((type) => (
        <TypeGroup key={type} type={type} rows={rows.filter((r) => r.type === type)} onChanged={refetch} />
      ))}
    </div>
  )
}
