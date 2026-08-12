import { useEffect, useState } from 'react'
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

// Each entry type gets its own accent, drawn from tokens already in the
// palette (primary/accent/boost) rather than new colour — build in blue,
// research in the "insight" purple already used for platform stats,
// achievement in the same amber the app uses for boosted/starred profiles.
const typeAccent: Record<AchievementType, 'primary' | 'accent' | 'boost'> = {
  project: 'primary',
  research: 'accent',
  achievement: 'boost',
}

const accentClasses: Record<'primary' | 'accent' | 'boost', { icon: string; ring: string }> = {
  primary: { icon: 'bg-primary/10 text-primary', ring: 'border-primary/30' },
  accent: { icon: 'bg-accent/10 text-accent', ring: 'border-accent/30' },
  boost: { icon: 'bg-boost/10 text-boost', ring: 'border-boost/30' },
}

function TypeIcon({ type, className }: { type: AchievementType; className?: string }) {
  const common = { className, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', 'aria-hidden': true }
  if (type === 'project') {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
        />
      </svg>
    )
  }
  if (type === 'research') {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5m4.75-11.396c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3m-5.55-12.196c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
        />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.006 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0"
      />
    </svg>
  )
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
  /** Minimum entries required for approval. 0/undefined means optional. */
  minRequired?: number
  onChanged: () => void
}

function TypeGroup({ type, rows, minRequired = 0, onChanged }: TypeGroupProps) {
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
  const accent = accentClasses[typeAccent[type]]
  const required = minRequired > 0
  const complete = rows.length >= minRequired

  return (
    <div className={['rounded-card border bg-card/60 p-4', required ? accent.ring : 'border-line'].join(' ')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className={['flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', accent.icon].join(' ')}>
            <TypeIcon type={type} className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-ink">{typeLabel[type]}s</p>
            <p className="text-xs text-ink/50">
              {rows.length} added{required ? ` · at least ${minRequired} required` : ''}
            </p>
          </div>
        </div>
        {required && (
          <Badge tone={complete ? 'verified' : 'neutral'}>
            {complete ? '✓ Complete' : `${rows.length}/${minRequired}`}
          </Badge>
        )}
      </div>

      {deleteError && <p className="mt-3 text-sm text-danger">{deleteError}</p>}

      {rows.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-card border border-line/70 bg-page/40 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{row.title}</p>
                  {row.description && <p className="mt-1 text-sm text-ink/60">{row.description}</p>}
                  {row.links && (
                    <a
                      href={row.links}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
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
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-card border border-line/70 bg-page/40 p-4">
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
      ) : rows.length === 0 ? (
        <button
          type="button"
          onClick={startAdd}
          className={[
            'mt-4 flex w-full flex-col items-center gap-1.5 rounded-card border border-dashed py-5 text-sm transition-colors',
            'border-line/80 text-ink/50 hover:border-line hover:bg-surface hover:text-ink',
          ].join(' ')}
        >
          <span className={['flex h-8 w-8 items-center justify-center rounded-full', accent.icon].join(' ')}>
            <TypeIcon type={type} className="h-4 w-4" />
          </span>
          <span className="font-medium">Add your first {typeLabel[type].toLowerCase()}</span>
        </button>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={startAdd}>
          + Add another {typeLabel[type].toLowerCase()}
        </Button>
      )}
    </div>
  )
}

interface AchievementsSectionProps {
  typesToShow: AchievementType[]
  /** Minimum entries required per type, e.g. { project: 3, achievement: 1 }. Omitted types are optional. */
  requiredCounts?: Partial<Record<AchievementType, number>>
  /**
   * Fires with the live per-type counts whenever they change (load, add,
   * delete). The profile builder's readiness meter subscribes to this so
   * adding a third project ticks "3 projects" off in the same beat as the row
   * appearing — without it the meter would have to refetch, and would sit
   * visibly stale in between.
   */
  onCountsChange?: (counts: Record<AchievementType, number>) => void
}

export default function AchievementsSection({
  typesToShow,
  requiredCounts = {},
  onCountsChange,
}: AchievementsSectionProps) {
  const [rows, setRows] = useState<AchievementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onCountsChange?.({
      project: rows.filter((r) => r.type === 'project').length,
      research: rows.filter((r) => r.type === 'research').length,
      achievement: rows.filter((r) => r.type === 'achievement').length,
    })
    // onCountsChange intentionally excluded: parents pass an inline setState
    // callback, and depending on it would re-run this on every parent render.
    // Same convention as PlatformBadgesSection's onCountChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

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
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      {typesToShow.map((type) => (
        <TypeGroup
          key={type}
          type={type}
          rows={rows.filter((r) => r.type === type)}
          minRequired={requiredCounts[type] ?? 0}
          onChanged={refetch}
        />
      ))}
    </div>
  )
}
