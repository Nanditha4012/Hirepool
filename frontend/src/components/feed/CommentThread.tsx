import { useEffect, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import {
  addComment,
  deleteComment,
  listComments,
  type PostComment as PostCommentType,
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

/**
 * The discussion under a post.
 *
 * Mounted only once the reader opens it, so a feed of thirty posts is one
 * request rather than thirty-one — the tally on the button comes down with
 * the post itself and is enough until someone actually wants to read.
 */
export default function CommentThread({ postId, onCountChange }: CommentThreadProps) {
  const [comments, setComments] = useState<PostCommentType[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return

    setPosting(true)
    setError(null)
    try {
      await addComment(postId, body)
      const refreshed = await listComments(postId)
      setComments(refreshed)
      onCountChange(refreshed.length)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post your reply')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId)
      setComments((prev) => {
        const next = (prev ?? []).filter((comment) => comment.id !== commentId)
        onCountChange(next.length)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete that reply')
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
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar name={comment.author.name} size="sm" />
              <div className="min-w-0 flex-1 rounded-card bg-surface px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink">
                    {comment.author.name}
                    {comment.author.role === 'company' && (
                      <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Company
                      </span>
                    )}
                  </p>
                  <span className="flex-shrink-0 text-[11px] text-ink/40">{timeAgo(comment.createdAt)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink/80">{comment.body}</p>
                {comment.canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="mt-1 text-[11px] font-semibold text-ink/40 transition-colors hover:text-danger"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Add to the discussion…"
          className="min-w-0 flex-1 resize-y rounded-card border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button type="submit" size="sm" loading={posting} disabled={!draft.trim()}>
          Reply
        </Button>
      </form>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
