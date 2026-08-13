import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  deleteVerificationDocument,
  getDigilockerStatus,
  startDigilocker,
  submitVerificationDocument,
  type VerificationDocType,
  type VerificationDocumentRow,
} from '@/lib/candidateApi'

/**
 * "Link the document, we'll check it now" — the automated half of verification.
 *
 * The candidate pastes a link to a marks card or an Aadhaar; the server fetches
 * it, reads it, and compares what it finds against what they typed. Three
 * things about how that is presented matter more than the mechanism:
 *
 *  - A `manual_review` result is shown as *progress*, not as an error. It is
 *    the normal outcome for a photo taken at an angle, and it means the entry
 *    is in the reviewer's queue — the same place it would have gone anyway.
 *    Presenting it in red would push candidates to re-upload a document that
 *    was already accepted.
 *  - Only `failed` is red, and only ever with a reason they can act on
 *    ("that document is private", "try a sharper photo").
 *  - The per-field breakdown is shown on success too, not just on failure, so
 *    the candidate can see exactly what was matched and trust the result.
 *
 * Nothing here uploads a file. The document stays wherever the candidate keeps
 * it and the platform stores only the verdict — see the backend's
 * utils/documentReader.ts.
 */

interface DocumentCheckProps {
  docType: VerificationDocType
  /** Required for a marks card: which qualification this proves. */
  educationId?: string
  existing?: VerificationDocumentRow
  onChanged: () => void
  title?: string
  help?: string
  className?: string
}

/** Field keys are internal; these are what a person should read. */
const FIELD_LABELS: Record<string, string> = {
  fullName: 'Name',
  institution: 'Institution',
  boardOrUniversity: 'Board / university',
  passingYear: 'Year',
  scoreValue: 'Marks',
  dob: 'Date of birth',
}

export default function DocumentCheck({
  docType,
  educationId,
  existing,
  onChanged,
  title = 'Verify instantly',
  help,
  className = '',
}: DocumentCheckProps) {
  const [link, setLink] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [digilockerReady, setDigilockerReady] = useState(false)

  // DigiLocker is only offered for identity, and only once the deployment has
  // partner credentials — see the backend's utils/digilocker.ts. Asked for
  // rather than assumed, so no candidate is ever shown a button that errors.
  useEffect(() => {
    if (docType !== 'aadhaar' || !open) return
    let cancelled = false
    getDigilockerStatus()
      .then((status) => {
        if (!cancelled) setDigilockerReady(status.configured)
      })
      .catch(() => {
        // Treated as "not available": the document-link path below works
        // regardless, so there is nothing to tell the candidate.
      })
    return () => {
      cancelled = true
    }
  }, [docType, open])

  const handleDigilocker = async () => {
    setBusy(true)
    setError(null)
    try {
      const { authorizeUrl } = await startDigilocker()
      window.location.href = authorizeUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start DigiLocker')
      setBusy(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!link.trim()) {
      setError('Paste a link to the document first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await submitVerificationDocument({
        docType,
        documentLink: link.trim(),
        ...(educationId ? { educationId } : {}),
      })
      setLink('')
      setOpen(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check that document')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!existing) return
    setBusy(true)
    setError(null)
    try {
      await deleteVerificationDocument(existing.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that check')
    } finally {
      setBusy(false)
    }
  }

  // ----- Already checked -----
  if (existing && existing.status !== 'pending' && existing.status !== 'processing') {
    const tone =
      existing.status === 'auto_verified'
        ? {
            wrap: 'border-verified/30 bg-verified/5',
            head: 'text-verified',
            icon: '✓',
            label: 'Verified automatically',
          }
        : existing.status === 'manual_review'
          ? {
              wrap: 'border-boost/30 bg-boost/5',
              head: 'text-boost',
              icon: '👁',
              label: 'Sent to a reviewer',
            }
          : {
              wrap: 'border-danger/30 bg-danger/5',
              head: 'text-danger',
              icon: '!',
              label: 'Could not be read',
            }

    const matches = Object.entries(existing.fieldMatches ?? {})

    return (
      <div className={['rounded-card border p-3.5', tone.wrap, className].join(' ')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={['flex items-center gap-2 text-sm font-semibold', tone.head].join(' ')}>
            <span aria-hidden="true">{tone.icon}</span>
            {tone.label}
            {existing.confidence != null && existing.status === 'auto_verified' && (
              <span className="font-normal text-ink/50">
                · {Math.round(existing.confidence * 100)}% match
              </span>
            )}
            {existing.source === 'digilocker' && (
              <span className="rounded-full bg-verified/15 px-2 py-0.5 text-xs font-semibold">
                DigiLocker
              </span>
            )}
          </p>
          <Button type="button" variant="secondary" size="sm" loading={busy} onClick={handleRemove}>
            Replace
          </Button>
        </div>

        {existing.failureReason && (
          <p className="mt-1.5 text-sm text-ink/65">{existing.failureReason}</p>
        )}

        {matches.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {matches.map(([key, passed]) => (
              <li
                key={key}
                className={[
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  passed ? 'bg-verified/12 text-verified' : 'bg-ink/8 text-ink/55',
                ].join(' ')}
              >
                <span aria-hidden="true">{passed ? '✓' : '–'}</span>
                {FIELD_LABELS[key] ?? key}
              </li>
            ))}
          </ul>
        )}

        {existing.aadhaarLast4 && (
          <p className="mt-2 text-xs text-ink/45">
            Aadhaar ending {existing.aadhaarLast4} — we never store the full number or the document.
          </p>
        )}

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    )
  }

  // ----- Not checked yet -----
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'flex w-full items-center gap-3 rounded-card border border-dashed border-primary/35 bg-primary/[0.04] px-3.5 py-3 text-left transition-colors hover:bg-primary/[0.08]',
          className,
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
        >
          ⚡
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-primary">{title}</span>
          {help && <span className="mt-0.5 block text-xs text-ink/55">{help}</span>}
        </span>
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={['animate-scale-in rounded-card border border-primary/30 bg-primary/[0.04] p-3.5', className].join(' ')}
    >
      {digilockerReady && (
        <div className="mb-4 rounded-card border border-verified/30 bg-verified/5 p-3">
          <p className="text-sm font-semibold text-verified">Fastest: use DigiLocker</p>
          <p className="mt-0.5 text-xs text-ink/60">
            Your document comes signed by the issuer, so there is nothing to read and nothing to
            guess. We only receive your name and date of birth.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-2.5"
            loading={busy}
            onClick={handleDigilocker}
          >
            Continue with DigiLocker
          </Button>
          <p className="mt-3 text-center text-xs font-medium text-ink/35">or link it yourself</p>
        </div>
      )}

      <Input
        label="Link to the document"
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <p className="mt-1.5 text-xs text-ink/50">
        A Google Drive link works — set its sharing to “Anyone with the link can view”, or the
        checker won&apos;t be able to open it. PDF, JPG or PNG.
      </p>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={busy}>
          {busy ? 'Reading the document…' : 'Check it now'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          Cancel
        </Button>
      </div>

      {busy && (
        // Reading a scan takes real seconds — silence here reads as a hang,
        // and a candidate who reloads mid-check loses the attempt.
        <p className="mt-2 text-xs text-ink/50">
          Fetching and reading your document. This can take up to 20 seconds — please don&apos;t
          close this page.
        </p>
      )}
    </form>
  )
}
