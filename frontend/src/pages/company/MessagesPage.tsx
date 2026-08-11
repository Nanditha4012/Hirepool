import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PageLoader from '@/components/ui/PageLoader'
import {
  listMyThreads,
  sendMessage,
  type CompanyMessageThread,
} from '@/lib/companyMessageApi'

export default function MessagesPage() {
  const location = useLocation()

  const [threads, setThreads] = useState<CompanyMessageThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedThread, setExpandedThread] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  // "Message a candidate" composer — either prefilled via router state from
  // the Search page's "Message" action, or filled in manually as a fallback.
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerCandidateId, setComposerCandidateId] = useState('')
  const [composerBody, setComposerBody] = useState('')
  const [composerSending, setComposerSending] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listMyThreads()
        if (cancelled) return
        setThreads(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your messages')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const state = location.state as { candidateId?: string } | null
    if (state?.candidateId) {
      setComposerCandidateId(state.candidateId)
      setComposerOpen(true)
    }
  }, [location.state])

  const handleReply = async (candidateId: string) => {
    if (!replyBody.trim()) return
    setSendingReply(true)
    try {
      const message = await sendMessage(candidateId, replyBody.trim())
      setThreads((prev) =>
        prev.map((t) => (t.candidateId === candidateId ? { ...t, messages: [...t.messages, message] } : t)),
      )
      setReplyBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply')
    } finally {
      setSendingReply(false)
    }
  }

  const handleStartThread = async () => {
    const candidateId = composerCandidateId.trim()
    if (!candidateId || !composerBody.trim()) return
    setComposerSending(true)
    setComposerError(null)
    try {
      const message = await sendMessage(candidateId, composerBody.trim())
      setThreads((prev) => {
        const existing = prev.find((t) => t.candidateId === candidateId)
        if (existing) {
          return prev.map((t) =>
            t.candidateId === candidateId ? { ...t, messages: [...t.messages, message] } : t,
          )
        }
        return [...prev, { candidateId, candidateName: null, messages: [message] }]
      })
      setComposerBody('')
      setComposerOpen(false)
      setExpandedThread(candidateId)
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setComposerSending(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-app-narrow px-4 py-16 text-center sm:px-6 lg:px-10">
        <PageLoader label="Loading your messages…" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-app-narrow px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">Messages</h1>
      <p className="mt-1 text-ink/60">Conversations with candidates.</p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <Card className="mt-6">
        {!composerOpen ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setComposerOpen(true)}>
            Message a candidate
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">Message a candidate</h2>
            <Input
              label="Candidate ID"
              placeholder="Candidate ID"
              value={composerCandidateId}
              onChange={(e) => setComposerCandidateId(e.target.value)}
            />
            <Input
              label="Message"
              placeholder="Write a message…"
              value={composerBody}
              onChange={(e) => setComposerBody(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" loading={composerSending} onClick={handleStartThread}>
                Send
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setComposerOpen(false)
                  setComposerError(null)
                }}
              >
                Cancel
              </Button>
            </div>
            {composerError && <p className="text-sm text-danger">{composerError}</p>}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Conversations</h2>
        {threads.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">No conversations yet.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {threads.map((thread) => {
              const lastMessage = thread.messages[thread.messages.length - 1]
              const isExpanded = expandedThread === thread.candidateId
              return (
                <div key={thread.candidateId} className="rounded-card border border-line p-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left"
                    onClick={() => setExpandedThread(isExpanded ? null : thread.candidateId)}
                  >
                    <div>
                      <p className="font-medium text-ink">{thread.candidateName || 'Unknown candidate'}</p>
                      {lastMessage && (
                        <p className="mt-0.5 truncate text-sm text-ink/60">{lastMessage.body}</p>
                      )}
                    </div>
                    <span className="text-ink/40" aria-hidden="true">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                      <div className="flex flex-col gap-2">
                        {thread.messages.map((message) => (
                          <div
                            key={message.id}
                            className={[
                              'max-w-[80%] rounded-card px-3 py-2 text-sm',
                              message.senderRole === 'company'
                                ? 'self-end bg-primary/10 text-ink'
                                : 'self-start bg-surface text-ink',
                            ].join(' ')}
                          >
                            {message.body}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Write a reply…"
                          value={expandedThread === thread.candidateId ? replyBody : ''}
                          onChange={(e) => setReplyBody(e.target.value)}
                        />
                        <Button
                          type="button"
                          size="sm"
                          loading={sendingReply}
                          onClick={() => handleReply(thread.candidateId)}
                        >
                          Send
                        </Button>
                      </div>
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
