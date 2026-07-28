import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import type { ChecklistItem, RejectionReason } from '@/lib/verifierApi'

/** The verifier's answer for one checklist row, held in the page's local state. */
export interface RowVerdict {
  passed: boolean
  reasonId: string
  note: string
}

interface ChecklistRowProps {
  item: ChecklistItem
  verdict: RowVerdict | undefined
  /** The verdict already stored on the server, shown when nothing is pending. */
  savedVerdict: { passed: boolean; reasonText: string | null; checkedAt: string } | undefined
  reasons: RejectionReason[]
  disabled: boolean
  onChange: (fieldKey: string, verdict: RowVerdict) => void
}

/**
 * One row of the review checklist: what the candidate claimed, and a Yes/No.
 *
 * Answering No opens a reason picker and note box inline. A reason OR a note
 * is required — the backend enforces this too (resolveCheckReason), but
 * catching it here means the verifier finds out while looking at the field
 * rather than after hitting Approve.
 */
export default function ChecklistRow({
  item,
  verdict,
  savedVerdict,
  reasons,
  disabled,
  onChange,
}: ChecklistRowProps) {
  const isEmpty = item.value === null || item.value === ''
  const answered = verdict !== undefined
  const effective = verdict ?? savedVerdict
  const needsJustification =
    verdict !== undefined && !verdict.passed && !verdict.reasonId && !verdict.note.trim()

  const set = (next: Partial<RowVerdict>) => {
    onChange(item.fieldKey, {
      passed: verdict?.passed ?? true,
      reasonId: verdict?.reasonId ?? '',
      note: verdict?.note ?? '',
      ...next,
    })
  }

  return (
    <div
      className={[
        'rounded-card border p-4 transition-colors',
        effective === undefined
          ? 'border-line'
          : effective.passed
            ? 'border-verified/40 bg-verified/5'
            : 'border-danger/40 bg-danger/5',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{item.label}</p>
            {!item.required && <Badge tone="neutral">Optional</Badge>}
            {isEmpty && <Badge tone="boost">Not provided</Badge>}
          </div>

          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block break-all text-sm font-medium text-primary hover:underline"
            >
              {item.value} ↗
            </a>
          ) : (
            <p className="mt-1 break-words text-sm text-ink/70">{item.value ?? '—'}</p>
          )}

          {item.hint && <p className="mt-1 text-xs text-ink/40">{item.hint}</p>}

          {/* Only shown when there's no pending answer — once the verifier
              touches this row, the live buttons are the source of truth and
              repeating the old verdict underneath is just noise. */}
          {!answered && savedVerdict && (
            <p className="mt-2 text-xs text-ink/50">
              Previously marked{' '}
              <span className={savedVerdict.passed ? 'font-semibold text-verified' : 'font-semibold text-danger'}>
                {savedVerdict.passed ? 'Yes' : 'No'}
              </span>{' '}
              on {new Date(savedVerdict.checkedAt).toLocaleDateString()}
              {savedVerdict.reasonText ? ` — ${savedVerdict.reasonText}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={effective?.passed === true}
            onClick={() => set({ passed: true, reasonId: '', note: '' })}
            className={[
              'rounded-card px-4 py-1.5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40',
              effective?.passed === true
                ? 'bg-verified text-white shadow-soft'
                : 'border border-line text-ink/60 hover:border-verified hover:text-verified',
            ].join(' ')}
          >
            Yes
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={effective?.passed === false}
            onClick={() => set({ passed: false })}
            className={[
              'rounded-card px-4 py-1.5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40',
              effective?.passed === false
                ? 'bg-danger text-white shadow-soft'
                : 'border border-line text-ink/60 hover:border-danger hover:text-danger',
            ].join(' ')}
          >
            No
          </button>
        </div>
      </div>

      {verdict?.passed === false && (
        <div className="mt-4 animate-fade-in border-t border-danger/20 pt-3">
          <Select
            label="What's wrong?"
            placeholder="Pick a reason…"
            options={reasons.map((r) => ({ value: r.id, label: r.reasonText }))}
            value={verdict.reasonId}
            onChange={(e) => set({ reasonId: e.target.value })}
          />
          <div className="mt-3">
            <label
              htmlFor={`note-${item.fieldKey}`}
              className="mb-1 block text-sm font-medium text-ink"
            >
              Note to the candidate
            </label>
            <textarea
              id={`note-${item.fieldKey}`}
              rows={2}
              placeholder="Explain what they need to fix…"
              value={verdict.note}
              onChange={(e) => set({ note: e.target.value })}
              className="w-full rounded-card border border-line px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {needsJustification && (
            <p className="mt-2 text-xs font-medium text-danger">
              Pick a reason or write a note before submitting a decision.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
