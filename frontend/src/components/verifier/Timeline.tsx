import type { TimelineEntry } from '@/lib/verifierApi'

interface TimelineProps {
  entries: TimelineEntry[]
  /** Caps how many are rendered; the rest sit behind a "show all" toggle. */
  limit?: number
  emptyMessage?: string
}

const toneDot: Record<TimelineEntry['tone'], string> = {
  pass: 'bg-verified',
  fail: 'bg-danger',
  neutral: 'bg-primary',
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Vertical activity feed for a candidate profile — submission, every field
 * verdict, every decision, newest first.
 *
 * The connecting rail is a pseudo-element on each item rather than one
 * absolutely-positioned line down the container, so it can't overshoot past
 * the final entry when the list is short.
 */
export default function Timeline({ entries, limit, emptyMessage }: TimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="py-4 text-sm text-ink/40">
        {emptyMessage || 'Nothing has happened on this profile yet.'}
      </p>
    )
  }

  const shown = limit ? entries.slice(0, limit) : entries

  return (
    <ol className="mt-2 flex flex-col">
      {shown.map((entry, index) => {
        const isLast = index === shown.length - 1
        return (
          <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={['mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full', toneDot[entry.tone]].join(' ')}
                aria-hidden="true"
              />
              {!isLast && <span className="mt-1 w-px flex-1 bg-line" aria-hidden="true" />}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{entry.title}</p>
              {entry.detail && <p className="mt-0.5 break-words text-sm text-ink/60">{entry.detail}</p>}
              <p className="mt-0.5 text-xs text-ink/40">
                {formatWhen(entry.at)}
                {entry.actorName ? ` · ${entry.actorName}` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
