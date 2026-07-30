import { SUPPORT_EMAIL } from '@/lib/config'

interface SupportNoteProps {
  /** Overrides the default lead-in sentence. */
  children?: React.ReactNode
  className?: string
}

/**
 * The "if it's urgent, write to us" line that closes every profile and status
 * surface. A single component rather than a repeated `<p>` so the address is
 * stated once (see SUPPORT_EMAIL) and can't drift between pages.
 */
export default function SupportNote({ children, className = '' }: SupportNoteProps) {
  return (
    <p className={['text-center text-sm text-ink/50', className].join(' ')}>
      {children ?? 'Something urgent, or not covered here?'}{' '}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="font-semibold text-primary underline-offset-2 hover:underline"
      >
        {SUPPORT_EMAIL}
      </a>
    </p>
  )
}
