import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import PageHero from '@/components/ui/PageHero'
import PageLoader from '@/components/ui/PageLoader'
import SegmentedTabs from '@/components/ui/SegmentedTabs'
import PostCard from '@/components/feed/PostCard'
import {
  joinCommunity,
  leaveCommunity,
  listCommunities,
  listMyCommunityFeed,
  type CommunitySummary,
  type FeedPost,
} from '@/lib/feedApi'

type Tab = 'feed' | 'browse'

/**
 * The Community tab.
 *
 * Subreddit-shaped: a catalogue you join from, and a single feed stitched
 * together from whatever you have joined. The catalogue is fixed and
 * admin-curated (see the seeder), so this is a picker rather than a
 * create-a-community screen.
 *
 * Opens on Browse for someone who has joined nothing — a feed that is empty
 * because you have not chosen anything yet reads as a broken page, not as an
 * invitation.
 */
export default function CommunityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [communities, setCommunities] = useState<CommunitySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requestedTab = searchParams.get('tab')
  const joinedAny = communities?.some((community) => community.joined) ?? false
  const tab: Tab = requestedTab === 'browse' || (communities !== null && !joinedAny) ? 'browse' : 'feed'

  const loadCommunities = useCallback(async () => {
    try {
      setCommunities(await listCommunities())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load communities')
    }
  }, [])

  useEffect(() => {
    void loadCommunities()
  }, [loadCommunities])

  const setTab = (next: Tab) => setSearchParams(next === 'feed' ? {} : { tab: next }, { replace: true })

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow="Community"
        title="Community"
        subtitle="Pick the corners of the job hunt you care about, then read and post in them — openings, interview experiences, and the memes that come with all of it."
        actions={
          <Link to="/feed/new?kind=community">
            <Button variant="inverse" size="sm">
              New post
            </Button>
          </Link>
        }
      >
        <SegmentedTabs
          inverted
          aria-label="Your feed or all communities"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'feed', label: 'My feed', hint: 'communities you joined' },
            {
              value: 'browse',
              label: 'Browse',
              hint: communities ? `${communities.length} communities` : undefined,
            },
          ]}
        />
      </PageHero>

      {error && <p className="mt-6 text-danger">{error}</p>}

      {tab === 'browse' ? (
        <BrowseTab communities={communities} onChanged={loadCommunities} />
      ) : (
        <MyFeedTab onBrowse={() => setTab('browse')} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function BrowseTab({
  communities,
  onChanged,
}: {
  communities: CommunitySummary[] | null
  onChanged: () => void
}) {
  const [busySlug, setBusySlug] = useState<string | null>(null)

  const toggle = async (community: CommunitySummary) => {
    setBusySlug(community.slug)
    try {
      if (community.joined) await leaveCommunity(community.slug)
      else await joinCommunity(community.slug)
      await onChanged()
    } finally {
      setBusySlug(null)
    }
  }

  if (!communities) return <PageLoader compact label="Loading communities…" className="mt-10" />

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {communities.map((community) => (
        <Card key={community.slug} className="flex flex-col">
          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden="true">
              {community.icon ?? '💬'}
            </span>
            <div className="min-w-0">
              <Link to={`/community/${community.slug}`} className="hover:underline">
                <h2 className="text-lg font-bold text-ink">{community.name}</h2>
              </Link>
              <p className="mt-0.5 text-xs text-ink/50">
                {community.memberCount} {community.memberCount === 1 ? 'member' : 'members'} ·{' '}
                {community.postCount} {community.postCount === 1 ? 'post' : 'posts'}
              </p>
            </div>
          </div>

          {community.description && (
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink/70">{community.description}</p>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant={community.joined ? 'secondary' : 'primary'}
              loading={busySlug === community.slug}
              onClick={() => toggle(community)}
            >
              {community.joined ? 'Joined' : 'Join'}
            </Button>
            <Link to={`/community/${community.slug}`}>
              <Button size="sm" variant="secondary">
                Open
              </Button>
            </Link>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function MyFeedTab({ onBrowse }: { onBrowse: () => void }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listMyCommunityFeed({ limit: 50 })
        if (!cancelled) setPosts(result.results)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your feed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const patch = (updated: FeedPost) =>
    setPosts((prev) => (prev ?? []).map((post) => (post.id === updated.id ? updated : post)))
  const remove = (id: string) => setPosts((prev) => (prev ?? []).filter((post) => post.id !== id))

  if (error) return <p className="mt-6 text-danger">{error}</p>
  if (!posts) return <PageLoader compact label="Loading your feed…" className="mt-10" />

  if (posts.length === 0) {
    return (
      <Card className="mt-6 text-center">
        <p className="font-semibold text-ink">Nothing here yet.</p>
        <p className="mt-1 text-sm text-ink/60">
          The communities you joined have no posts yet — or you haven&apos;t joined any. Either way, the
          first post is worth making.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button size="sm" onClick={onBrowse}>
            Browse communities
          </Button>
          <Link to="/feed/new?kind=community">
            <Button size="sm" variant="secondary">
              Write a post
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onChange={patch} onRemoved={remove} />
      ))}
    </div>
  )
}
