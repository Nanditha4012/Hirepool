import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ListSkeleton from '@/components/ui/ListSkeleton'
import {
  decideAchievement,
  listAchievementQueue,
  listRejectionReasons,
  type AchievementQueueRow,
  type ItemDecision,
  type RejectionReason,
} from '@/lib/verifierApi'

type TypeFilter = '' | 'project' | 'research' | 'achievement'

const typeTabs: { value: TypeFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'project', label: 'Projects' },
  { value: 'research', label: 'Research' },
  { value: 'achievement', label: 'Achievements' },
]

export default function AchievementQueuePage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [rows, setRows] = useState<AchievementQueueRow[]>([])
  const [reasons, setReasons] = useState<RejectionReason[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [activeDecision, setActiveDecision] = useState<ItemDecision | null>(null)
  const [reasonId, setReasonId] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [rowsResult, reasonsResult] = await Promise.all([
          listAchievementQueue(typeFilter || undefined),
          listRejectionReasons('item'),
        ])
        if (cancelled) return
        setRows(rowsResult)
        setReasons(reasonsResult)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the achievement queue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [typeFilter])

  const openDecision = (rowId: string, decision: ItemDecision) => {
    setActiveRowId(rowId)
    setActiveDecision(decision)
    setReasonId('')
    setNote('')
    setSubmitError(null)
  }

  const cancelDecision = () => {
    setActiveRowId(null)
    setActiveDecision(null)
    setReasonId('')
    setNote('')
    setSubmitError(null)
  }

  const handleSubmit = async (rowId: string) => {
    if (!activeDecision) return
    if (activeDecision === 'incorrect' && !reasonId) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      await decideAchievement(rowId, {
        decision: activeDecision,
        reasonId: activeDecision === 'incorrect' ? reasonId : undefined,
        note: note.trim() || undefined,
      })
      setRows((prev) => prev.filter((r) => r.id !== rowId))
      cancelDecision()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit decision')
    } finally {
      setSubmitting(false)
    }
  }

  const reasonOptions = reasons.map((r) => ({ value: r.id, label: r.reasonText }))

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Achievement queue</h1>
      <p className="mt-1 text-ink/60">Verify projects, research, and achievements claimed by candidates.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {typeTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={typeFilter === tab.value}
            onClick={() => setTypeFilter(tab.value)}
            className={[
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              typeFilter === tab.value
                ? 'bg-primary text-white'
                : 'border border-line text-ink/70 hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="mt-6" style={{ width: '100%' }}>
        {loading && <ListSkeleton rows={3} />}
        {!loading && error && <p className="text-danger">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="text-ink/60">No achievements pending verification.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          // Single column, full row width — matches how wide the Catalogs
          // table reads. The `lg:` padding bump is desktop-only; below `lg`
          // this is unchanged from before (p-4, same gap).
          <div className="flex flex-col gap-3 lg:gap-4">
            {rows.map((row) => {
              const isActive = activeRowId === row.id
              return (
                <div key={row.id} className="rounded-card border border-line p-4 lg:-mx-6 lg:px-6 lg:py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{row.candidateFullName || 'Unnamed candidate'}</p>
                      <p className="mt-0.5 text-sm text-ink/70">
                        [{row.type}] {row.title}
                      </p>
                      {row.description && <p className="mt-1 text-sm text-ink/60">{row.description}</p>}
                      <a
                        href={row.certificateOrProofLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                      >
                        Open proof link ↗
                      </a>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      <Button type="button" size="sm" onClick={() => openDecision(row.id, 'verified')}>
                        Verified
                      </Button>
                      <Button type="button" size="sm" variant="danger" onClick={() => openDecision(row.id, 'incorrect')}>
                        Incorrect
                      </Button>
                    </div>
                  </div>

                  {isActive && (
                    <div className="mt-4 border-t border-line pt-4">
                      {activeDecision === 'incorrect' && (
                        <Select
                          label="Reason"
                          placeholder="Select a reason…"
                          options={reasonOptions}
                          value={reasonId}
                          onChange={(e) => setReasonId(e.target.value)}
                        />
                      )}
                      <div className="mt-3">
                        <Input
                          label="Note (optional)"
                          placeholder="Add context…"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          loading={submitting}
                          disabled={activeDecision === 'incorrect' && !reasonId}
                          onClick={() => handleSubmit(row.id)}
                        >
                          Submit
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={cancelDecision}>
                          Cancel
                        </Button>
                      </div>
                      {submitError && <p className="mt-2 text-sm text-danger">{submitError}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
