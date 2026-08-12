import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import { HeroStat } from '@/components/ui/PageHero'
import ListSkeleton from '@/components/ui/ListSkeleton'
import SupportNote from '@/components/ui/SupportNote'
import TabWorkspace from '@/components/layout/TabWorkspace'
import SectionRoadmap, { type RoadmapStep } from '@/components/layout/SectionRoadmap'
import SectionArtwork from '@/components/layout/SectionArtwork'
import ChatLayout, { type ChatThread } from '@/components/messaging/ChatLayout'
import {
  blockCompany,
  listMyThreads,
  markThreadRead,
  replyToThread,
  type MessageThread,
} from '@/lib/candidateApi'

/**
 * The candidate's inbox, at `/candidate/messages`.
 *
 * This route is what the "new message" notification has always pointed at
 * (see the backend's companyMessageController.startOrReplyThread) — it just
 * never existed, so every message notification a candidate clicked landed on
 * the 404 page. The conversations themselves were reachable only as a
 * collapsed accordion card two thirds of the way down the dashboard, which is
 * why messaging read as "notifications only".
 *
 * Conversation rendering is ChatLayout's job; this page owns loading, sending
 * and blocking.
 */
export default function CandidateMessagesPage() {
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockingId, setBlockingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listMyThreads()
        if (!cancelled) setThreads(result)
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

  const chatThreads: ChatThread[] = useMemo(
    () =>
      threads.map((thread) => ({
        id: thread.companyId,
        name: thread.companyName,
        subtitle: [thread.industry, thread.verified ? 'Verified company' : null]
          .filter(Boolean)
          .join(' · '),
        avatarUrl: thread.logoLink,
        unreadCount: thread.unreadCount,
        lastMessageAt: thread.lastMessageAt,
        messages: thread.messages.map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          outgoing: message.senderRole === 'candidate',
        })),
      })),
    [threads],
  )

  const handleSend = useCallback(async (companyId: string, body: string) => {
    try {
      const message = await replyToThread(companyId, body)
      setThreads((prev) =>
        prev.map((thread) =>
          thread.companyId === companyId
            ? {
                ...thread,
                messages: [...thread.messages, message],
                lastMessageAt: message.createdAt,
              }
            : thread,
        ),
      )
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send your reply')
      return false
    }
  }, [])

  const handleOpen = useCallback((companyId: string) => {
    // Optimistic: the badge clearing is the whole point, and a failed PATCH
    // just means it comes back on the next load rather than anything breaking.
    setThreads((prev) =>
      prev.map((thread) =>
        thread.companyId === companyId ? { ...thread, unreadCount: 0 } : thread,
      ),
    )
    void markThreadRead(companyId).catch(() => undefined)
  }, [])

  const handleBlock = async (companyId: string) => {
    if (!window.confirm('Block this company? They will not be able to message you again.')) return
    setBlockingId(companyId)
    try {
      await blockCompany(companyId)
      setThreads((prev) =>
        prev.map((thread) =>
          thread.companyId === companyId ? { ...thread, blocked: true } : thread,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block that company')
    } finally {
      setBlockingId(null)
    }
  }

  const totalUnread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0)

  /**
   * Only one tab today, but the workspace shell is what gives this page the
   * same rail, artwork and roadmap as every other section — and an Archived
   * or Blocked tab has an obvious home the day it is wanted.
   */
  return (
    <TabWorkspace
      eyebrow="Candidate"
      title="Messages"
      subtitle="Companies that unlocked your contact can reach you here. Replying costs you nothing and does not use up anything on your side."
      stats={
        <div className="grid grid-cols-2 gap-2">
          <HeroStat label="Conversations" value={loading ? '—' : threads.length} />
          <HeroStat label="Unread" value={loading ? '—' : totalUnread} hint="waiting on you" />
        </div>
      }
      artwork={<SectionArtwork scene="messages" />}
      rail={<SectionRoadmap steps={ROADMAP} />}
      tabsAriaLabel="Message folders"
      value="inbox"
      onChange={() => undefined}
      tabs={[
        {
          value: 'inbox',
          label: 'Inbox',
          hint: loading ? '…' : `${threads.length} conversation${threads.length === 1 ? '' : 's'}`,
        },
      ]}
    >
      {error && (
        <Card className="mb-4 border border-danger/30 bg-danger/5">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <ChatLayout
          threads={chatThreads}
          onSend={handleSend}
          onOpen={handleOpen}
          composerDisabledReason={(thread) =>
            threads.find((t) => t.companyId === thread.id)?.blocked
              ? 'You blocked this company — they can no longer message you.'
              : null
          }
          threadActions={(thread) => {
            const source = threads.find((t) => t.companyId === thread.id)
            if (!source || source.blocked) return null
            return (
              <div className="flex justify-end border-b border-line px-4 py-1.5">
                <button
                  type="button"
                  disabled={blockingId === thread.id}
                  onClick={() => handleBlock(thread.id)}
                  className="text-xs font-medium text-ink/40 transition-colors hover:text-danger disabled:opacity-50"
                >
                  Block this company
                </button>
              </div>
            )
          }}
          emptyState={
            <Card className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface text-3xl">
                ✉️
              </span>
              <p className="mt-4 font-semibold text-ink">No messages yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
                Companies can message you once they unlock your contact details. Keeping
                &ldquo;Actively looking&rdquo; switched on and your profile complete is what puts
                you in front of them.
              </p>
            </Card>
          }
        />
      )}

      <SupportNote className="mt-10">Getting messages you would rather not?</SupportNote>
    </TabWorkspace>
  )
}

/** How a company ends up in this inbox. See SectionRoadmap. */
const ROADMAP: RoadmapStep[] = [
  {
    icon: '🔍',
    title: 'They find you',
    detail: 'Only verified profiles appear in candidate search, and only while you are looking.',
  },
  {
    icon: '🔓',
    title: 'They unlock your contact',
    detail: 'That costs the company a credit — an unlock is a deliberate act, not a browse.',
  },
  {
    icon: '💬',
    title: 'They write first',
    detail: 'You never have to open a conversation. Replies are free and unlimited on your side.',
  },
  {
    icon: '🚫',
    title: 'You can end it',
    detail: 'Blocking a company stops them messaging you again, permanently.',
  },
]
