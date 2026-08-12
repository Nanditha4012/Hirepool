import React, { useEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'

/**
 * The messaging surface, shared by the candidate inbox and the company inbox.
 *
 * Both used to be an accordion: a stack of rows that expanded in place to
 * reveal the conversation, with a single `replyBody` state shared across every
 * row — so typing in one thread and opening another carried the draft over.
 * Reading a conversation meant scrolling past every other conversation, the
 * message list had no timestamps, and nothing scrolled to the newest message.
 *
 * This is the layout every messaging app converges on because it is the one
 * that works: a conversation list beside an open thread on desktop, and on a
 * phone the list *or* the thread, with a back arrow between them. The two
 * inboxes differ only in who the other party is and what a message costs to
 * send, so that is all the pages supply — everything about presenting a
 * conversation lives here once.
 */

export interface ChatMessage {
  id: string
  body: string
  createdAt: string
  /** True when the signed-in user wrote it — decides the bubble's side. */
  outgoing: boolean
}

export interface ChatThread {
  /** The other party's user id; also the React key and selection token. */
  id: string
  name: string
  /** Role, industry — whatever identifies them past the name. */
  subtitle?: string | null
  /** Company logo. Falls back to initials when absent. */
  avatarUrl?: string | null
  messages: ChatMessage[]
  unreadCount?: number
  lastMessageAt?: string | null
}

interface ChatLayoutProps {
  threads: ChatThread[]
  /** Rendered under the open thread's header — block/report controls, plan notices. */
  threadActions?: (thread: ChatThread) => React.ReactNode
  /** Return false to keep the composer's text (e.g. the send failed). */
  onSend: (threadId: string, body: string) => Promise<boolean>
  /** Fired once when a thread with unread messages is opened. */
  onOpen?: (threadId: string) => void
  /** Disables the composer with an explanation, e.g. a blocked company. */
  composerDisabledReason?: (thread: ChatThread) => string | null
  emptyState: React.ReactNode
  /** Shown above the list — the company's "message a candidate" entry point. */
  listHeaderAction?: React.ReactNode
}

/** "14:32" today, "Mon" this week, "12 Aug" beyond it. */
function shortTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const daysAgo = (now.getTime() - date.getTime()) / 86_400_000
  if (daysAgo < 7) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/** Date separators between runs of messages, as in every chat client. */
function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ChatLayout({
  threads,
  threadActions,
  onSend,
  onOpen,
  composerDisabledReason,
  emptyState,
  listHeaderAction,
}: ChatLayoutProps) {
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const active = threads.find((thread) => thread.id === activeId) ?? null

  // Keeps a valid selection when the thread list changes underneath us — a
  // new conversation arriving, or the first load resolving after mount.
  useEffect(() => {
    if (threads.length === 0) {
      setActiveId(null)
      return
    }
    if (!threads.some((thread) => thread.id === activeId)) {
      setActiveId(threads[0].id)
    }
  }, [threads, activeId])

  // Pin to the newest message on open and after each send — a chat that opens
  // scrolled to the oldest message is a chat you have to scroll to use.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [activeId, active?.messages.length])

  const openThread = (threadId: string) => {
    setActiveId(threadId)
    // Per-thread drafts are deliberately NOT preserved across a switch: the
    // old shared-state version leaked one thread's half-written reply into
    // another, which is the worse failure by far.
    setDraft('')
    const thread = threads.find((t) => t.id === threadId)
    if (thread?.unreadCount) onOpen?.(threadId)
  }

  const handleSend = async () => {
    if (!active || !draft.trim() || sending) return
    setSending(true)
    const sent = await onSend(active.id, draft.trim())
    if (sent) setDraft('')
    setSending(false)
  }

  if (threads.length === 0) return <>{emptyState}</>

  const disabledReason = active && composerDisabledReason ? composerDisabledReason(active) : null

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* Conversation list. Hidden on a phone once a thread is open, which is
          what makes this one component work at both sizes. */}
      <aside
        className={[
          'flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-soft',
          active ? 'hidden md:flex' : 'flex',
        ].join(' ')}
      >
        {listHeaderAction && <div className="border-b border-line p-3">{listHeaderAction}</div>}

        <div className="max-h-[32rem] flex-1 overflow-y-auto md:max-h-[38rem]">
          {threads.map((thread) => {
            const last = thread.messages[thread.messages.length - 1]
            const isActive = thread.id === activeId
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => openThread(thread.id)}
                className={[
                  'flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left transition-colors last:border-0',
                  isActive ? 'bg-primary/5' : 'hover:bg-surface',
                ].join(' ')}
              >
                {thread.avatarUrl ? (
                  <img
                    src={thread.avatarUrl}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-full border border-line object-contain"
                  />
                ) : (
                  <Avatar name={thread.name} size="md" />
                )}

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{thread.name}</span>
                    {last && (
                      <span className="flex-shrink-0 text-[11px] text-ink/40">
                        {shortTime(last.createdAt)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-ink/55">
                      {last ? `${last.outgoing ? 'You: ' : ''}${last.body}` : 'No messages yet'}
                    </span>
                    {Boolean(thread.unreadCount) && (
                      <span className="flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                        {thread.unreadCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Open conversation */}
      {active && (
        <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-card border border-line bg-card shadow-soft md:min-h-[38rem]">
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            {/* Phone-only: the list is the other half of this pane. */}
            <button
              type="button"
              onClick={() => setActiveId(null)}
              aria-label="Back to conversations"
              className="-ml-2 rounded-card p-2 text-ink/60 transition-colors hover:bg-surface hover:text-ink md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {active.avatarUrl ? (
              <img
                src={active.avatarUrl}
                alt=""
                className="h-10 w-10 flex-shrink-0 rounded-full border border-line object-contain"
              />
            ) : (
              <Avatar name={active.name} size="md" />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{active.name}</p>
              {active.subtitle && (
                <p className="truncate text-xs text-ink/50">{active.subtitle}</p>
              )}
            </div>
          </header>

          {threadActions?.(active)}

          <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto bg-surface/40 px-4 py-4">
            {active.messages.map((message, index) => {
              const previous = active.messages[index - 1]
              const showDay =
                !previous ||
                new Date(previous.createdAt).toDateString() !==
                  new Date(message.createdAt).toDateString()

              return (
                <div key={message.id}>
                  {showDay && (
                    <p className="my-3 text-center text-[11px] font-medium text-ink/40">
                      {dayLabel(message.createdAt)}
                    </p>
                  )}
                  <div
                    className={[
                      'flex animate-fade-in',
                      message.outgoing ? 'justify-end' : 'justify-start',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'max-w-[85%] rounded-card px-3.5 py-2 shadow-soft sm:max-w-[70%]',
                        message.outgoing
                          ? 'rounded-br-sm bg-primary text-white'
                          : 'rounded-bl-sm bg-card text-ink',
                      ].join(' ')}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                      <p
                        className={[
                          'mt-1 text-right text-[10px]',
                          message.outgoing ? 'text-white/60' : 'text-ink/35',
                        ].join(' ')}
                      >
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <footer className="border-t border-line p-3">
            {disabledReason ? (
              <p className="rounded-card bg-surface px-3 py-2.5 text-center text-sm text-ink/50">
                {disabledReason}
              </p>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter sends, Shift+Enter breaks the line — the
                    // convention every chat client uses.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder="Write a message…"
                  className="max-h-32 flex-1 resize-none rounded-card border border-line bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  type="button"
                  loading={sending}
                  disabled={!draft.trim()}
                  onClick={handleSend}
                  aria-label="Send message"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              </div>
            )}
          </footer>
        </section>
      )}
    </div>
  )
}
