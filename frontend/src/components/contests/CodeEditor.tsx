import { useMemo, useRef } from 'react'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  /** Rendered but not editable once the question has been submitted. */
  readOnly?: boolean
  className?: string
}

const TAB = '    '

/**
 * A plain-textarea code editor with a synced line-number gutter.
 *
 * Deliberately not CodeMirror or Monaco: both are large dependencies (Monaco
 * alone dwarfs this app's entire bundle) and the artifact CSP forbids loading
 * them from a CDN, so they'd have to be bundled outright. For writing a
 * 20-line contest solution, the things that actually matter are a monospace
 * font, working Tab indentation, and line numbers to read a stack trace
 * against — all of which this does without adding a byte of dependency.
 *
 * The gutter is a sibling element scrolled in lockstep with the textarea
 * rather than a background image, so it stays aligned at any font size and
 * with any amount of wrapped content.
 */
export default function CodeEditor({ value, onChange, readOnly = false, className = '' }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)

  const lineCount = useMemo(() => Math.max(value.split('\n').length, 1), [value])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return
    // Without this, Tab moves focus out of the editor — unusable for code.
    // Escape is left alone as the documented way to tab out for keyboard
    // users, since trapping Tab unconditionally would strand them.
    event.preventDefault()

    const target = event.currentTarget
    const { selectionStart, selectionEnd } = target
    const next = value.slice(0, selectionStart) + TAB + value.slice(selectionEnd)
    onChange(next)

    // Restore the caret after React re-renders with the new value; setting it
    // synchronously would be overwritten by the controlled re-render.
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = selectionStart + TAB.length
        textareaRef.current.selectionEnd = selectionStart + TAB.length
      }
    })
  }

  return (
    <div
      className={[
        'flex overflow-hidden rounded-card border border-line bg-[#0f172a] font-mono text-sm',
        className,
      ].join(' ')}
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="select-none overflow-hidden bg-white/5 px-3 py-3 text-right text-slate-500"
      >
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index} className="leading-6">
            {index + 1}
          </div>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        // autoCorrect/autoCapitalize off matters on mobile keyboards, which
        // otherwise "helpfully" capitalise keywords and break the code.
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        aria-label="Code editor"
        onKeyDown={handleKeyDown}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop
        }}
        className="min-h-[280px] flex-1 resize-none bg-transparent px-3 py-3 leading-6 text-slate-100 outline-none placeholder:text-slate-600"
        placeholder="Write your solution here…"
      />
    </div>
  )
}
