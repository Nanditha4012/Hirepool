import { useEffect, useMemo, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import PageLoader from '@/components/ui/PageLoader'
import DocumentCheck from '@/components/candidate/DocumentCheck'
import {
  createEducation,
  deleteEducation,
  listEducation,
  updateEducation,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_SCORE_LABELS,
  type EducationLevel,
  type EducationRow,
  type EducationScoreType,
  type VerificationDocumentRow,
} from '@/lib/candidateApi'

/**
 * The candidate's qualifications, oldest first.
 *
 * Each entry carries its own document check inline rather than in a separate
 * "verify your documents" screen. That placement is the point: the moment a
 * candidate has finished typing a marks card's details is the moment they
 * still have the marks card open, and asking for it then costs them nothing.
 * Asking a week later costs a support ticket.
 */

const LEVEL_OPTIONS = (Object.keys(EDUCATION_LEVEL_LABELS) as EducationLevel[]).map((value) => ({
  value,
  label: EDUCATION_LEVEL_LABELS[value],
}))

const SCORE_OPTIONS = (Object.keys(EDUCATION_SCORE_LABELS) as EducationScoreType[]).map((value) => ({
  value,
  label: EDUCATION_SCORE_LABELS[value],
}))

/** School levels have no degree or branch — asking for them reads as a bug. */
function isSchoolLevel(level: EducationLevel): boolean {
  return level === 'tenth' || level === 'twelfth'
}

const LEVEL_ICON: Record<EducationLevel, string> = {
  tenth: '🏫',
  twelfth: '📗',
  diploma: '📐',
  undergraduate: '🎓',
  postgraduate: '🎖️',
  doctorate: '🔬',
}

const STATUS_TONE: Record<EducationRow['verificationStatus'], 'neutral' | 'verified' | 'danger'> = {
  pending: 'neutral',
  auto_verified: 'verified',
  verified: 'verified',
  rejected: 'danger',
}

const STATUS_LABEL: Record<EducationRow['verificationStatus'], string> = {
  pending: 'Awaiting review',
  // Named for what it is, so a candidate is never told a human agreed when
  // one hasn't. It still counts as verified everywhere it matters.
  auto_verified: 'Auto-verified',
  verified: 'Verified',
  rejected: 'Not accepted',
}

interface FormState {
  level: EducationLevel
  institution: string
  boardOrUniversity: string
  degree: string
  branch: string
  startYear: string
  endYear: string
  isOngoing: boolean
  scoreValue: string
  scoreType: string
  marksCardLink: string
}

const emptyForm: FormState = {
  level: 'undergraduate',
  institution: '',
  boardOrUniversity: '',
  degree: '',
  branch: '',
  startYear: '',
  endYear: '',
  isOngoing: false,
  scoreValue: '',
  scoreType: 'percentage',
  marksCardLink: '',
}

function rowToForm(row: EducationRow): FormState {
  return {
    level: row.level,
    institution: row.institution,
    boardOrUniversity: row.boardOrUniversity ?? '',
    degree: row.degree ?? '',
    branch: row.branch ?? '',
    startYear: row.startYear != null ? String(row.startYear) : '',
    endYear: row.endYear != null ? String(row.endYear) : '',
    isOngoing: row.isOngoing,
    scoreValue: row.scoreValue != null ? String(row.scoreValue) : '',
    scoreType: row.scoreType ?? 'percentage',
    marksCardLink: row.marksCardLink ?? '',
  }
}

function formatPeriod(row: EducationRow): string | null {
  if (row.isOngoing) return `${row.startYear ?? '…'} – present`
  if (row.startYear && row.endYear) return `${row.startYear} – ${row.endYear}`
  return row.endYear ? String(row.endYear) : row.startYear ? String(row.startYear) : null
}

function formatScore(row: EducationRow): string | null {
  if (row.scoreValue == null) return null
  if (row.scoreType === 'percentage') return `${row.scoreValue}%`
  return `${row.scoreValue} ${row.scoreType === 'cgpa_10' || row.scoreType === 'cgpa_4' ? 'CGPA' : 'GPA'}`
}

interface EducationSectionProps {
  /** Live count for the builder's readiness meter. */
  onCountChange?: (count: number) => void
  documents: VerificationDocumentRow[]
  onDocumentsChanged: () => void
}

export default function EducationSection({
  onCountChange,
  documents,
  onDocumentsChanged,
}: EducationSectionProps) {
  const [rows, setRows] = useState<EducationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const refetch = async () => {
    try {
      setRows(await listEducation())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load education')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listEducation()
        if (!cancelled) setRows(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load education')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    onCountChange?.(rows.length)
    // onCountChange is an inline setState from the parent; depending on it
    // would re-run this on every parent render. Same convention as
    // AchievementsSection's onCountsChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length])

  const documentsByEducation = useMemo(() => {
    const map = new Map<string, VerificationDocumentRow>()
    for (const doc of documents) {
      if (doc.educationId && !map.has(doc.educationId)) map.set(doc.educationId, doc)
    }
    return map
  }, [documents])

  const startAdd = () => {
    // Pre-select the level the candidate most likely still needs, so the
    // common path (10th → 12th → degree) is one fewer decision each time.
    const present = new Set(rows.map((r) => r.level))
    const nextLevel: EducationLevel = !present.has('tenth')
      ? 'tenth'
      : !present.has('twelfth')
        ? 'twelfth'
        : 'undergraduate'
    setForm({ ...emptyForm, level: nextLevel })
    setAdding(true)
    setEditingId(null)
    setFormError(null)
  }

  const startEdit = (row: EducationRow) => {
    setForm(rowToForm(row))
    setEditingId(row.id)
    setAdding(false)
    setFormError(null)
  }

  const cancel = () => {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      await deleteEducation(id)
      await refetch()
      onDocumentsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.institution.trim()) {
      setFormError('Institution name is required.')
      return
    }
    if (form.startYear && form.endYear && Number(form.endYear) < Number(form.startYear)) {
      setFormError('End year cannot be before start year.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const body = {
        level: form.level,
        institution: form.institution.trim(),
        boardOrUniversity: form.boardOrUniversity.trim() || null,
        degree: isSchoolLevel(form.level) ? null : form.degree.trim() || null,
        branch: isSchoolLevel(form.level) ? null : form.branch.trim() || null,
        startYear: form.startYear ? Number(form.startYear) : null,
        endYear: form.isOngoing || !form.endYear ? null : Number(form.endYear),
        isOngoing: form.isOngoing,
        scoreValue: form.scoreValue ? Number(form.scoreValue) : null,
        scoreType: form.scoreValue ? (form.scoreType as EducationScoreType) : null,
        marksCardLink: form.marksCardLink.trim() || null,
      }
      if (editingId) await updateEducation(editingId, body)
      else await createEducation(body)
      await refetch()
      cancel()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader compact label="Loading education…" />

  const showForm = adding || editingId !== null

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      {rows.length > 0 && (
        // A left rule with a node per entry — the qualifications read as one
        // progression rather than as unrelated cards, which is how a reader
        // actually parses "what did this person study".
        <ol className="relative flex flex-col gap-3 border-l-2 border-line pl-5">
          {rows.map((row) => {
            const period = formatPeriod(row)
            const score = formatScore(row)
            const doc = documentsByEducation.get(row.id)

            return (
              <li key={row.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.9rem] top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-line bg-card text-sm"
                >
                  {LEVEL_ICON[row.level]}
                </span>

                <div className="rounded-card border border-line bg-page/40 p-4 transition-shadow hover:shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                        {EDUCATION_LEVEL_LABELS[row.level]}
                      </p>
                      <p className="mt-0.5 font-semibold text-ink">{row.institution}</p>
                      <p className="mt-0.5 text-sm text-ink/60">
                        {[row.degree, row.branch, row.boardOrUniversity]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink/50">
                        {period && <span>{period}</span>}
                        {score && <span className="font-medium text-ink/70">{score}</span>}
                      </p>
                      {row.verificationStatus === 'rejected' && row.rejectionReason && (
                        <p className="mt-2 text-sm text-danger">{row.rejectionReason}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={STATUS_TONE[row.verificationStatus]}>
                        {STATUS_LABEL[row.verificationStatus]}
                      </Badge>
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(row)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={row.verificationStatus === 'verified'}
                          title={
                            row.verificationStatus === 'verified'
                              ? 'Verified entries cannot be deleted'
                              : undefined
                          }
                          onClick={() => handleDelete(row.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>

                  <DocumentCheck
                    className="mt-4"
                    docType="marks_card"
                    educationId={row.id}
                    existing={doc}
                    onChanged={() => {
                      onDocumentsChanged()
                      void refetch()
                    }}
                    title="Verify this instantly"
                    help="Link your marks card and we'll check the name, institution, year and marks against what you typed — no waiting for a reviewer."
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="animate-scale-in rounded-card border border-primary/30 bg-page/40 p-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Level"
              options={LEVEL_OPTIONS}
              value={form.level}
              onChange={(e) => setForm((p) => ({ ...p, level: e.target.value as EducationLevel }))}
            />
            <Input
              label="School / college"
              placeholder="e.g. RV College of Engineering"
              value={form.institution}
              onChange={(e) => setForm((p) => ({ ...p, institution: e.target.value }))}
            />
            <Input
              label={isSchoolLevel(form.level) ? 'Board' : 'University'}
              placeholder={isSchoolLevel(form.level) ? 'e.g. CBSE, Karnataka State Board' : 'e.g. VTU'}
              value={form.boardOrUniversity}
              onChange={(e) => setForm((p) => ({ ...p, boardOrUniversity: e.target.value }))}
            />

            {!isSchoolLevel(form.level) && (
              <>
                <Input
                  label="Degree"
                  placeholder="e.g. B.E., B.Tech, MBA"
                  value={form.degree}
                  onChange={(e) => setForm((p) => ({ ...p, degree: e.target.value }))}
                />
                <Input
                  label="Branch / specialisation"
                  placeholder="e.g. Computer Science"
                  value={form.branch}
                  onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))}
                />
              </>
            )}

            <Input
              label="Start year"
              type="number"
              min={1950}
              max={2100}
              placeholder="2019"
              value={form.startYear}
              onChange={(e) => setForm((p) => ({ ...p, startYear: e.target.value }))}
            />
            <Input
              label={form.isOngoing ? 'End year (still studying)' : 'End year'}
              type="number"
              min={1950}
              max={2100}
              placeholder="2023"
              disabled={form.isOngoing}
              value={form.isOngoing ? '' : form.endYear}
              onChange={(e) => setForm((p) => ({ ...p, endYear: e.target.value }))}
            />

            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink/70 sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                checked={form.isOngoing}
                onChange={(e) => setForm((p) => ({ ...p, isOngoing: e.target.checked }))}
              />
              I&apos;m still studying here
            </label>

            <Input
              label="Score (optional)"
              type="number"
              step="0.01"
              min={0}
              placeholder="82.5"
              value={form.scoreValue}
              onChange={(e) => setForm((p) => ({ ...p, scoreValue: e.target.value }))}
            />
            <Select
              label="Score type"
              options={SCORE_OPTIONS}
              value={form.scoreType}
              onChange={(e) => setForm((p) => ({ ...p, scoreType: e.target.value }))}
            />

            <div className="sm:col-span-2">
              <Input
                label="Marks card link (optional — lets us verify instantly)"
                type="url"
                placeholder="https://drive.google.com/file/d/..."
                value={form.marksCardLink}
                onChange={(e) => setForm((p) => ({ ...p, marksCardLink: e.target.value }))}
              />
            </div>
          </div>

          {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}

          <div className="mt-4 flex gap-2">
            <Button type="submit" size="sm" loading={saving}>
              {editingId ? 'Save changes' : 'Add education'}
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
          className="flex w-full flex-col items-center gap-2 rounded-card border border-dashed border-line/80 py-8 text-sm text-ink/50 transition-colors hover:border-primary/40 hover:bg-surface hover:text-ink"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xl">
            🎓
          </span>
          <span className="font-medium">Add your first qualification</span>
          <span className="text-xs text-ink/45">Start with your 10th — it takes about a minute</span>
        </button>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={startAdd}>
          + Add another qualification
        </Button>
      )}
    </div>
  )
}
