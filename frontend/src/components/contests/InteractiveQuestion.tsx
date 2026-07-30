import { useMemo } from 'react'
import type { InteractiveContent } from '@/lib/contestApi'

interface InteractiveQuestionProps {
  content: InteractiveContent
  response: Record<string, unknown> | null
  onChange: (response: Record<string, unknown>) => void
}

/**
 * The three non-MCQ, non-coding question forms the Domain contest uses.
 *
 * Reordering is done with explicit Move up / Move down buttons rather than
 * HTML5 drag-and-drop. Native DnD does not fire on touch at all, so a
 * drag-only implementation would leave the question literally unanswerable on
 * a phone — and it is unreachable by keyboard. Buttons work on every input
 * method, and the item list still reads as a thing you are ordering.
 */
export default function InteractiveQuestion({
  content,
  response,
  onChange,
}: InteractiveQuestionProps) {
  // ----- drag-drop ordering -----
  const order = useMemo(() => {
    const saved = response?.order
    if (Array.isArray(saved) && saved.length === (content.items?.length ?? 0)) {
      return saved as string[]
    }
    return content.items ?? []
  }, [response, content.items])

  const move = (index: number, direction: -1 | 1) => {
    const next = [...order]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ order: next })
  }

  if (content.interactiveKind === 'drag_drop') {
    return (
      <div>
        <p className="font-medium text-ink">{content.question}</p>
        <p className="mt-1 text-xs text-ink/50">Put these in the correct order, first at the top.</p>
        <ol className="mt-4 flex flex-col gap-2">
          {order.map((item, index) => (
            <li
              key={item}
              className="flex items-center gap-3 rounded-card border border-line bg-card p-3"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink">{item}</span>
              <span className="flex flex-shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={`Move "${item}" up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="rounded border border-line px-2 py-1 text-xs text-ink/70 transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move "${item}" down`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                  className="rounded border border-line px-2 py-1 text-xs text-ink/70 transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  // ----- fill in the blanks -----
  if (content.interactiveKind === 'fill_blank') {
    const segments = (content.snippet ?? '').split('___')
    const blanks = Array.isArray(response?.blanks) ? (response!.blanks as string[]) : []

    const setBlank = (index: number, value: string) => {
      const next = [...blanks]
      while (next.length < segments.length - 1) next.push('')
      next[index] = value
      onChange({ blanks: next })
    }

    return (
      <div>
        <p className="font-medium text-ink">{content.question}</p>
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-[#0f172a] p-4 font-mono text-sm leading-7 text-slate-100">
          {/* Rendered as a run of text nodes with inputs spliced in at each
              `___`, so the blank sits inline in the code exactly where it
              belongs rather than in a separate answer list. */}
          {segments.map((segment, index) => (
            <span key={index}>
              <span className="whitespace-pre-wrap">{segment}</span>
              {index < segments.length - 1 && (
                <input
                  type="text"
                  value={blanks[index] ?? ''}
                  onChange={(event) => setBlank(index, event.target.value)}
                  aria-label={`Blank ${index + 1}`}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  className="mx-1 w-32 rounded border-b-2 border-boost bg-white/10 px-2 py-0.5 text-center font-mono text-boost outline-none focus:border-primary"
                />
              )}
            </span>
          ))}
        </div>
      </div>
    )
  }

  // ----- multi-part scenario -----
  const answers = Array.isArray(response?.answers) ? (response!.answers as number[]) : []

  const setAnswer = (partIndex: number, optionIndex: number) => {
    const next = [...answers]
    while (next.length < (content.parts?.length ?? 0)) next.push(-1)
    next[partIndex] = optionIndex
    onChange({ answers: next })
  }

  return (
    <div>
      <p className="font-medium text-ink">{content.question}</p>
      <div className="mt-4 flex flex-col gap-5">
        {(content.parts ?? []).map((part, partIndex) => (
          <fieldset key={partIndex} className="rounded-card border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              {partIndex + 1}. {part.prompt}
            </legend>
            <div className="mt-2 flex flex-col gap-2">
              {part.options.map((option, optionIndex) => (
                <label
                  key={optionIndex}
                  className={[
                    'flex cursor-pointer items-start gap-3 rounded-card border p-2.5 text-sm transition-colors',
                    answers[partIndex] === optionIndex
                      ? 'border-primary bg-primary/5 text-ink'
                      : 'border-line text-ink/80 hover:border-primary/40',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name={`part-${partIndex}`}
                    checked={answers[partIndex] === optionIndex}
                    onChange={() => setAnswer(partIndex, optionIndex)}
                    className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  )
}
