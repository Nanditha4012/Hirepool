import { useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import CommentThread from './CommentThread'
import { deletePost, toggleLike, toggleScamReport, type FeedPost } from '@/lib/feedApi'

interface PostCardProps {
  post: FeedPost
  /** Called with the mutated post so the list can hold the new counts. */
  onChange: (post: FeedPost) => void
  /** Called after a successful delete so the list can drop the row. */
  onRemoved: (id: string) => void
}

function formatDate(value: string): string {
  // The value is a plain `YYYY-MM-DD`. Splitting it rather than feeding it to
  // `new Date()` avoids the UTC-midnight parse, which renders a drive dated
  // the 5th as the 4th for anyone west of Greenwich.
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** A labelled fact in the detail grid. Renders nothing when there's no value. */
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{label}</p>
      <p className="mt-0.5 break-words text-sm text-ink/80">{value}</p>
    </div>
  )
}

/** One of the ways to reach the poster, as a button. */
function ContactLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-card border border-line bg-card px-3 py-1.5 text-sm font-semibold text-ink/80 transition-colors hover:border-primary hover:text-primary"
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </a>
  )
}

/**
 * One post, on any of the three surfaces.
 *
 * A walk-in, a Job Book vacancy and a community post are the same row with
 * different columns filled in (see feedController.ts), so they are one card
 * with the kind-specific blocks switched on rather than three near-identical
 * components — the like/discuss/report footer in particular is the same
 * behaviour everywhere and only wants writing once.
 *
 * Today's drives carry a green border. That is the whole reason the walk-in
 * screen is grouped rather than sorted: "can I still go to this?" is the only
 * question a candidate is asking, and it should be answerable without reading
 * a date.
 */
export default function PostCard({ post, onChange, onRemoved }: PostCardProps) {
  const [showComments, setShowComments] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isToday = post.bucket === 'today'
  const isOver = post.bucket === 'over'

  const handleLike = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await toggleLike(post.id)
      onChange({ ...post, likeCount: result.likeCount, likedByMe: result.likedByMe })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register that')
    } finally {
      setBusy(false)
    }
  }

  const handleReport = async () => {
    // Flagging someone as a scammer is not a thing to do by accident, so the
    // first press asks. Un-flagging doesn't — undoing a mistake should be the
    // frictionless direction.
    if (!post.reportedByMe) {
      const confirmed = window.confirm(
        'Report this post as a scam? Other candidates will see the warning count on it.',
      )
      if (!confirmed) return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await toggleScamReport(post.id)
      onChange({ ...post, scamCount: result.scamCount, reportedByMe: result.reportedByMe })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register that')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setBusy(true)
    try {
      await deletePost(post.id)
      onRemoved(post.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that')
      setBusy(false)
    }
  }

  return (
    <article
      className={[
        'rounded-card border bg-card p-5 shadow-soft transition-shadow duration-200',
        isToday ? 'border-2 border-verified shadow-lift' : 'border-line',
        isOver ? 'opacity-70' : '',
      ].join(' ')}
    >
      {/* Who posted it */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={post.author.name} size="md" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
              {post.author.name}
              {/* Whether the employer posted this themselves, or someone else
                  did, is the single most useful trust signal on a job feed —
                  so the account type is stated, not left to be guessed from
                  the name. */}
              {post.author.role === 'company' && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Company
                </span>
              )}
            </p>
            <p className="truncate text-xs text-ink/50">
              {timeAgo(post.createdAt)}
              {post.community && ` · ${post.community.icon ?? ''} ${post.community.name}`}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {isToday && <Badge tone="verified">Today</Badge>}
          {post.bucket === 'upcoming' && <Badge tone="boost">Upcoming</Badge>}
          {isOver && <Badge tone="neutral">Over</Badge>}
          {post.canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              aria-label="Delete post"
              className="rounded-card p-1.5 text-ink/30 transition-colors hover:bg-surface hover:text-danger"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4h6v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Posted by someone other than the employer — say so plainly, so
          nobody reads a second-hand listing as an official one. */}
      {post.postedOnBehalf && (
        <p className="mt-3 rounded-card bg-boost/10 px-3 py-1.5 text-xs font-medium text-boost">
          Shared by a candidate on the company&apos;s behalf — verify the details before you travel.
        </p>
      )}

      {/* The scam warning goes above the content, not in the footer with the
          button that produces it: someone who is about to act on this needs to
          see it before they read the contact details, not after. */}
      {post.scamCount > 0 && (
        <p className="mt-3 rounded-card bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger">
          ⚠ {post.scamCount} {post.scamCount === 1 ? 'person has' : 'people have'} flagged this as a possible
          scam. Never pay a fee to attend an interview.
        </p>
      )}

      <h3 className="mt-3 text-lg font-bold leading-snug text-ink">{post.title}</h3>

      {(post.companyName || post.roleTitle) && (
        <p className="mt-1 text-sm font-semibold text-primary">
          {[post.roleTitle, post.companyName].filter(Boolean).join(' · ')}
        </p>
      )}

      {post.body && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/75">{post.body}</p>
      )}

      {post.imageLink && (
        <img
          src={post.imageLink}
          alt=""
          loading="lazy"
          className="mt-3 max-h-96 w-full rounded-card border border-line object-contain"
        />
      )}

      {/* When and where — walk-ins only */}
      {post.kind === 'walkin' && (
        <div
          className={[
            'mt-4 rounded-card px-4 py-3',
            isToday ? 'bg-verified/10' : 'bg-surface',
          ].join(' ')}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact
              label="When"
              value={
                post.walkinDate
                  ? [
                      formatDate(post.walkinDate),
                      [post.walkinStartTime, post.walkinEndTime].filter(Boolean).join(' – '),
                    ]
                      .filter(Boolean)
                      .join(', ')
                  : null
              }
            />
            <Fact label="City" value={post.location} />
          </div>
          <div className="mt-3">
            <Fact label="Venue" value={post.venue} />
          </div>
        </div>
      )}

      {/* What they want */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {post.kind !== 'walkin' && <Fact label="Location" value={post.location} />}
        <Fact label="Qualification" value={post.qualification} />
        <Fact label="Experience" value={post.experience} />
        <Fact label="Salary" value={post.salary} />
        <Fact label="Contact person" value={post.contactPerson} />
      </div>

      {/* How to reach them */}
      {(post.applyLink || post.contactEmail || post.contactPhone || post.whatsappLink) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {post.applyLink && <ContactLink href={post.applyLink} icon="🔗" label="Apply" />}
          {post.contactEmail && (
            <ContactLink href={`mailto:${post.contactEmail}`} icon="✉️" label={post.contactEmail} />
          )}
          {post.whatsappLink && <ContactLink href={post.whatsappLink} icon="🟢" label="WhatsApp" />}
          {post.contactPhone && (
            <ContactLink href={`tel:${post.contactPhone}`} icon="📞" label={post.contactPhone} />
          )}
        </div>
      )}

      {/* Like · discussion · scam */}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line pt-3">
        <button
          type="button"
          onClick={handleLike}
          disabled={busy}
          aria-pressed={post.likedByMe}
          className={[
            'inline-flex items-center gap-1.5 rounded-card px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50',
            post.likedByMe ? 'bg-primary/10 text-primary' : 'text-ink/60 hover:bg-surface hover:text-ink',
          ].join(' ')}
        >
          <span aria-hidden="true">{post.likedByMe ? '👍' : '👍🏻'}</span>
          Like{post.likeCount > 0 && ` · ${post.likeCount}`}
        </button>

        <button
          type="button"
          onClick={() => setShowComments((prev) => !prev)}
          aria-expanded={showComments}
          className={[
            'inline-flex items-center gap-1.5 rounded-card px-3 py-1.5 text-sm font-semibold transition-colors',
            showComments ? 'bg-surface text-ink' : 'text-ink/60 hover:bg-surface hover:text-ink',
          ].join(' ')}
        >
          <span aria-hidden="true">💬</span>
          Discussion{post.commentCount > 0 && ` · ${post.commentCount}`}
        </button>

        <button
          type="button"
          onClick={handleReport}
          disabled={busy}
          aria-pressed={post.reportedByMe}
          className={[
            'inline-flex items-center gap-1.5 rounded-card px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50',
            post.reportedByMe ? 'bg-danger/10 text-danger' : 'text-ink/60 hover:bg-surface hover:text-danger',
          ].join(' ')}
        >
          <span aria-hidden="true">🚩</span>
          {post.reportedByMe ? 'Reported' : 'Scam'}
          {post.scamCount > 0 && ` · ${post.scamCount}`}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {showComments && (
        <CommentThread
          postId={post.id}
          onCountChange={(count) => onChange({ ...post, commentCount: count })}
        />
      )}
    </article>
  )
}
