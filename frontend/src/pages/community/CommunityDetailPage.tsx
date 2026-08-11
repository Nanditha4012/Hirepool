import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import PageHero from '@/components/ui/PageHero'
import PageLoader from '@/components/ui/PageLoader'
import PostCard from '@/components/feed/PostCard'
import { joinCommunity, leaveCommunity, listCommunityPosts, type CommunityFeed, type FeedPost } from '@/lib/feedApi'

/**
 * One community's own feed.
 *
 * Readable whether or not you have joined — joining is what puts it in your
 * feed and lets you post, not what lets you look. Deciding whether to join
 * something you cannot see would be a strange thing to ask of anyone.
 */
export default function CommunityDetailPage() {
  const { slug = '' } = useParams()
  const [feed, setFeed] = useState<CommunityFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setFeed(await listCommunityPosts(slug, { limit: 50 }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this community')
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const toggleMembership = async () => {
    if (!feed) return
    setBusy(true)
    try {
      const result = feed.community.joined ? await leaveCommunity(slug) : await joinCommunity(slug)
      setFeed({
        ...feed,
        community: { ...feed.community, joined: result.joined, memberCount: result.memberCount },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your membership')
    } finally {
      setBusy(false)
    }
  }

  const patch = (updated: FeedPost) =>
    setFeed((prev) =>
      prev ? { ...prev, results: prev.results.map((post) => (post.id === updated.id ? updated : post)) } : prev,
    )
  const remove = (id: string) =>
    setFeed((prev) => (prev ? { ...prev, results: prev.results.filter((post) => post.id !== id) } : prev))

  if (error) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{error}</p>
          <Link to="/community" className="mt-4 inline-block">
            <Button size="sm" variant="secondary">
              Back to communities
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (!feed) return <PageLoader label="Loading…" />

  const { community } = feed

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow="Community"
        title={`${community.icon ?? ''} ${community.name}`.trim()}
        subtitle={community.description ?? undefined}
        meta={
          <span className="text-sm text-white/70">
            {community.memberCount} {community.memberCount === 1 ? 'member' : 'members'}
          </span>
        }
        actions={
          <>
            <Button
              variant={community.joined ? 'outlineInverse' : 'inverse'}
              size="sm"
              loading={busy}
              onClick={toggleMembership}
            >
              {community.joined ? 'Leave' : 'Join'}
            </Button>
            {community.joined && (
              <Link to="/feed/new?kind=community">
                <Button variant="inverse" size="sm">
                  New post
                </Button>
              </Link>
            )}
          </>
        }
      />

      {!community.joined && (
        <Card className="mt-6 border border-primary/30 bg-primary/5">
          <p className="text-sm text-ink/75">
            Join this community to post in it and to see its posts in your own feed.
          </p>
        </Card>
      )}

      {feed.results.length === 0 ? (
        <Card className="mt-6 text-center">
          <p className="font-semibold text-ink">No posts here yet.</p>
          <p className="mt-1 text-sm text-ink/60">Be the first — that is how every one of these starts.</p>
          {community.joined && (
            <Link to="/feed/new?kind=community" className="mt-4 inline-block">
              <Button size="sm">Write the first post</Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {feed.results.map((post) => (
            <PostCard key={post.id} post={post} onChange={patch} onRemoved={remove} />
          ))}
        </div>
      )}
    </div>
  )
}
