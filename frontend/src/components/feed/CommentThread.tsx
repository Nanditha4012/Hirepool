import { useEffect, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import {
  addComment,
  deleteComment,
  listComments,
  toggleCommentLike,
  type PostComment as PostCommentType,
  type PostCommentReply,
} from '@/lib/feedApi'

interface CommentThreadProps {
  postId: string
  /** Lets the parent card keep its comment tally in step with the thread. */
  onCountChange: (count: number) => void
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

/** The heart. Optimistic — a like is not worth a spinner. */
function LikeButton({
  comment,
  onToggle,
}: {
  comment: PostCommentReply
  onToggle: (commentId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(comment.id)}
      aria-pressed={comment.likedByMe}
      className={[
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold transition-colors',
        comment.likedByMe ? 'text-danger' : 'text-ink/40 hover:text-danger',
      ].join(' ')}
    >
      <svg
        viewBox="0 0 24 24"
        className={['h-3.5 w-3.5 transition-transform', comment.likedByMe ? 'scale-110' : ''].join(
          ' ',
        )}
        fill={comment.likedByMe ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          d="M20.8 5.6a5 5 0 00-7.1 0L12 7.3l-1.7-1.7a5 5 0 10-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 000-7.1z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {comment.likeCount > 0 && comment.likeCount}
      <span className="sr-only">{comment.likedByMe ? 'Unlike' : 'Like'} this comment</span>
    </button>
  )
}

/** One comment or reply. `onReply` is omitted for a reply — depth is capped. */
function CommentRow({
  comment,
  onLike,
  onDelete,
  onReply,
  isReply = false,
}: {
  comment: PostCommentReply
  onLike: (commentId: string) => void
  onDelete: (commentId: string) => void
  onReply?: (commentId: string, authorName: string) => void
  isReply?: boolean
}) {
  return (
    <div className="flex gap-2.5">
      <Avatar name={comment.author.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div
          className={[
            'rounded-card px-3 py-2',
            isReply ? 'bg-card ring-1 ring-line' : 'bg-surface',
          ].join(' ')}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-ink">
              {comment.author.name}
              {comment.author.role === 'company' && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Company
                </span>
              )}
            </p>
            <span className="flex-shrink-0 text-[11px] text-ink/40">
              {timeAgo(comment.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink/80">
            {comment.body}
          </p>
        </div>

        <div className="mt-1 flex items-center gap-3 pl-1">
          <LikeButton comment={comment} onToggle={onLike} />
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(comment.id, comment.author.name)}
              className="text-[11px] font-semibold text-ink/40 transition-colors hover:text-primary"
            >
              Reply
            </button>
          )}
          {comment.canDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="text-[11px] font-semibold text-ink/40 transition-colors hover:text-danger"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The discussion under a post.
 *
 * Mounted only once the reader opens it, so a feed of thirty posts is one
 * request rather than thirty-one — the tally on the button comes down with
 * the post itself and is enough until someone actually wants to read.
 *
 * A comment can now be liked and answered. Both were missing, and their
 * absence showed: the same question got asked four times under a popular
 * drive because there was no way to endorse the answer already there, and
 * every answer was addressed to the post rather than to the person who asked,
 * so readers had to infer who was replying to whom from the wording. Replies
 * are one level deep — see the note in the backend's addComment.
 */
export default function CommentThread({ postId, onCountChange }: CommentThreadProps) {
  const [comments, setComments] = useState<PostCommentType[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  /** Which comment the composer is currently answering, if any. */
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listComments(postId)
        if (!cancelled) setComments(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the discussion')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [postId])

  /** Total including replies — what the card's tally counts. */
  const totalCount = (list: PostCommentType[]) =>
    list.reduce((sum, comment) => sum + 1 + comment.replies.length, 0)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return

    setPosting(true)
    setError(null)
    try {
      await addComment(postId, body, replyTo?.id)
      const refreshed = await listComments(postId)
      setComments(refreshed)
      onCountChange(totalCount(refreshed))
      setDraft('')
      setReplyTo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post your reply')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId)
      const refreshed = await listComments(postId)
      setComments(refreshed)
      onCountChange(totalCount(refreshed))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete that reply')
    }
  }

  /**
   * Optimistic, then reconciled with the server's count.
   *
   * A like has to feel instant, and the failure mode is mild: the heart flips
   * back on the next load. Applied across both levels because the target may
   * be a top-level comment or one of its replies.
   */
  const handleLike = async (commentId: string) => {
    const apply = (
      list: PostCommentType[],
      patch: (comment: PostCommentReply) => PostCommentReply,
    ): PostCommentType[] =>
      list.map((comment) => ({
        ...(comment.id === commentId ? { ...comment, ...patch(comment) } : comment),
        replies: comment.replies.map((reply) => (reply.id === commentId ? patch(reply) : reply)),
      }))

    setComments((prev) =>
      prev === null
        ? prev
        : apply(prev, (comment) => ({
            ...comment,
            likedByMe: !comment.likedByMe,
            likeCount: comment.likeCount + (comment.likedByMe ? -1 : 1),
          })),
    )

    try {
      const settled = await toggleCommentLike(commentId)
      setComments((prev) => (prev === null ? prev : apply(prev, (comment) => ({ ...comment, ...settled }))))
    } catch {
      // Roll back to whatever the server actually holds.
      try {
        setComments(await listComments(postId))
      } catch {
        setError('Could not register that like.')
      }
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      {comments === null && !error && <p className="text-sm text-ink/50">Loading the discussion…</p>}

      {comments?.length === 0 && (
        <p className="text-sm text-ink/50">
          No replies yet. Been to this one, or know something about it? Say so.
        </p>
      )}

      {comments && comments.length > 0 && (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentRow
                comment={comment}
                onLike={handleLike}
                onDelete={handleDelete}
                onReply={(id, name) => setReplyTo({ id, name })}
              />

              {comment.replies.length > 0 && (
                // Indented and rail-marked so a reply is visibly subordinate
                // to the comment it answers rather than another entry in the
                // same flat list.
                <ul className="ml-4 mt-2 flex flex-col gap-3 border-l-2 border-line pl-3 sm:ml-6">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        comment={reply}
                        onLike={handleLike}
                        onDelete={handleDelete}
                        isReply
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-4">
        {replyTo && (
          <div className="mb-1.5 flex items-center gap-2 rounded-card bg-primary/5 px-3 py-1.5 text-xs">
            <span className="text-ink/60">
              Replying to <span className="font-semibold text-ink">{replyTo.name}</span>
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="ml-auto font-semibold text-ink/40 transition-colors hover:text-danger"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-start gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add to the discussion…'}
            className="min-w-0 flex-1 resize-y rounded-card border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="submit" size="sm" loading={posting} disabled={!draft.trim()}>
            {replyTo ? 'Reply' : 'Post'}
          </Button>
        </div>
      </form>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
