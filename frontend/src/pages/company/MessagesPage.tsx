import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { HeroStat } from '@/components/ui/PageHero'
import ListSkeleton from '@/components/ui/ListSkeleton'
import SupportNote from '@/components/ui/SupportNote'
import TabWorkspace from '@/components/layout/TabWorkspace'
import SectionRoadmap, { type RoadmapStep } from '@/components/layout/SectionRoadmap'
import SectionArtwork from '@/components/layout/SectionArtwork'
import ChatLayout, { type ChatThread } from '@/components/messaging/ChatLayout'
import {
  listMyThreads,
  markThreadRead,
  sendMessage,
  type CompanyMessageThread,
} from '@/lib/companyMessageApi'

/**
 * The company's inbox.
 *
 * Two things were wrong beyond the accordion layout (see ChatLayout for that
 * story). Threads with no full_name on the candidate's user row rendered as
 * "Unknown candidate", and starting a conversation meant typing a candidate
 * UUID into a text box labelled "Candidate ID" — a field nobody can fill in
 * from the UI, since no screen shows a candidate's id. Names now come from
 * the server with a real fallback, and starting a conversation is done from
 * the candidate's card in search, which is the only place you have actually
 * decided who you want to talk to.
 */
export default function CompanyMessagesPage() {
  const location = useLocation()

  const [threads, setThreads] = useState<CompanyMessageThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Set by Search's "Message" action so the right thread opens on arrival. */
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null)

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

  useEffect(() => {
    const state = location.state as { candidateId?: string; candidateName?: string } | null
    if (state?.candidateId) setPendingCandidateId(state.candidateId)
  }, [location.state])

  /**
   * A candidate arrived from Search who has no thread yet gets an empty one,
   * so the composer is open on the right person immediately. It is local
   * until the first message is sent — nothing is written server-side by
   * merely intending to write to someone.
   */
  const allThreads: CompanyMessageThread[] = useMemo(() => {
    if (!pendingCandidateId || threads.some((t) => t.candidateId === pendingCandidateId)) {
      return threads
    }
    const state = location.state as { candidateName?: string } | null
    return [
      {
        candidateId: pendingCandidateId,
        candidateName: state?.candidateName || 'New conversation',
        primaryRole: null,
        location: null,
        unreadCount: 0,
        lastMessageAt: null,
        messages: [],
      },
      ...threads,
    ]
  }, [threads, pendingCandidateId, location.state])

  const chatThreads: ChatThread[] = useMemo(
    () =>
      allThreads.map((thread) => ({
        id: thread.candidateId,
        name: thread.candidateName,
        subtitle: [thread.primaryRole, thread.location].filter(Boolean).join(' · '),
        unreadCount: thread.unreadCount,
        lastMessageAt: thread.lastMessageAt,
        messages: thread.messages.map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          outgoing: message.senderRole === 'company',
        })),
      })),
    [allThreads],
  )

  const handleSend = useCallback(
    async (candidateId: string, body: string) => {
      setError(null)
      try {
        const message = await sendMessage(candidateId, body)
        setThreads((prev) => {
          const existing = prev.find((thread) => thread.candidateId === candidateId)
          if (existing) {
            return prev.map((thread) =>
              thread.candidateId === candidateId
                ? {
                    ...thread,
                    messages: [...thread.messages, message],
                    lastMessageAt: message.createdAt,
                  }
                : thread,
            )
          }
          // First message of a brand-new conversation: promote the local
          // placeholder into a real thread.
          const placeholder = allThreads.find((thread) => thread.candidateId === candidateId)
          return [
            {
              candidateId,
              candidateName: placeholder?.candidateName ?? 'Candidate',
              primaryRole: placeholder?.primaryRole ?? null,
              location: placeholder?.location ?? null,
              unreadCount: 0,
              lastMessageAt: message.createdAt,
              messages: [message],
            },
            ...prev,
          ]
        })
        setPendingCandidateId(null)
        return true
      } catch (err) {
        // Plan caps and the daily new-conversation limit surface here, and
        // they are the reason a failed send must keep the typed text.
        setError(err instanceof Error ? err.message : 'Failed to send that message')
        return false
      }
    },
    [allThreads],
  )

  const handleOpen = useCallback((candidateId: string) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.candidateId === candidateId ? { ...thread, unreadCount: 0 } : thread,
      ),
    )
    void markThreadRead(candidateId).catch(() => undefined)
  }, [])

  const totalUnread = threads.reduce((sum, thread) => sum + thread.unreadCount, 0)
  const repliedCount = threads.filter((thread) =>
    thread.messages.some((message) => message.senderRole === 'candidate'),
  ).length

  return (
    <TabWorkspace
      eyebrow="Company portal"
      title="Messages"
      subtitle="Conversations with candidates. Replies are always free — only starting a new conversation counts against your plan."
      stats={
        <div className="grid grid-cols-3 gap-2">
          <HeroStat label="Threads" value={loading ? '—' : threads.length} />
          <HeroStat label="Unread" value={loading ? '—' : totalUnread} />
          <HeroStat label="Replied" value={loading ? '—' : repliedCount} />
        </div>
      }
      actions={
        <Link to="/company/search">
          <Button variant="inverse" size="sm">
            Find candidates
          </Button>
        </Link>
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
          listHeaderAction={
            <Link to="/company/search" className="block">
              <Button type="button" variant="secondary" size="sm" className="w-full">
                + Message a candidate
              </Button>
            </Link>
          }
          emptyState={
            <Card className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface text-3xl">
                💬
              </span>
              <p className="mt-4 font-semibold text-ink">No conversations yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
                Find a candidate in search and use the Message action on their card. Their name and
                role carry through, so you never have to look up an id.
              </p>
              <Link to="/company/search" className="mt-4 inline-block">
                <Button size="sm">Find candidates</Button>
              </Link>
            </Card>
          }
        />
      )}

      <SupportNote className="mt-10" />
    </TabWorkspace>
  )
}

/** What a conversation costs and how one starts. See SectionRoadmap. */
const ROADMAP: RoadmapStep[] = [
  {
    icon: '🔍',
    title: 'Find them in search',
    detail: 'Filter by role, skills, badges and contest scores. Messaging needs no unlock first.',
  },
  {
    icon: '✉️',
    title: 'Open the conversation',
    detail: 'Use Message on their card — the name carries through, so no ids to look up.',
  },
  {
    icon: '💳',
    title: 'Only the first one counts',
    detail: 'A new conversation uses your plan allowance. Every reply after it is free.',
  },
  {
    icon: '🤝',
    title: 'Unlock when it is worth it',
    detail: 'Phone, email and WhatsApp sit behind a separate unlock, spent when you are serious.',
  },
]
