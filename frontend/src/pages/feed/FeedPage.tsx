import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import ListSkeleton from '@/components/ui/ListSkeleton'
import Select from '@/components/ui/Select'
import SubTabs from '@/components/ui/SubTabs'
import TabWorkspace from '@/components/layout/TabWorkspace'
import SectionRoadmap, { type RoadmapStep } from '@/components/layout/SectionRoadmap'
import SectionArtwork from '@/components/layout/SectionArtwork'
import PostCard from '@/components/feed/PostCard'
import {
  listJobs,
  listWalkinLocations,
  listWalkins,
  type FeedPost,
  type WalkinFeed,
} from '@/lib/feedApi'

type Tab = 'walkins' | 'jobs'

/**
 * Walk-in Pedia and the Job Book — two tabs of one screen.
 *
 * They are one screen rather than two routes because they answer the same
 * question ("what can I go for?") from two directions, and a candidate
 * checking one almost always wants a glance at the other. The tab lives in
 * the query string so a link can point at either, and so Back returns to the
 * tab you were on rather than the one that happens to be the default.
 */
/** The roadmap in the left rail, per tab. See SectionRoadmap. */
const ROADMAPS: Record<Tab, RoadmapStep[]> = {
  walkins: [
    {
      icon: '🔎',
      title: 'Find a drive',
      detail: 'Filter by date and city. Today’s drives are the ones you can still turn up to.',
    },
    {
      icon: '📍',
      title: 'Check venue and timing',
      detail: 'Every drive carries a full address and a contact, so nothing is a guess.',
    },
    {
      icon: '🧾',
      title: 'Turn up prepared',
      detail: 'Read the qualification line — most drives turn people away on documents.',
    },
    {
      icon: '💬',
      title: 'Report back',
      detail: 'Say how it went in the replies. That is what makes the next person’s trip worth it.',
    },
  ],
  jobs: [
    {
      icon: '📖',
      title: 'Browse openings',
      detail: 'Posted by companies directly, and passed on by candidates who spotted them.',
    },
    {
      icon: '🔗',
      title: 'Every post is actionable',
      detail: 'A link, an email, a phone number or WhatsApp — a post with none of those is rejected.',
    },
    {
      icon: '✍️',
      title: 'Apply, then say so',
      detail: 'Reply on the post if you hear back. Response rates are the useful part.',
    },
    {
      icon: '📣',
      title: 'Pass one on',
      detail: 'Found an opening elsewhere? Post it here — referrals travel further than job boards.',
    },
  ],
}

export default function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'jobs' ? 'jobs' : 'walkins'

  const setTab = (next: Tab) => {
    // `replace` so flipping tabs doesn't stack history entries a reader then
    // has to press Back through to leave the page.
    setSearchParams(next === 'walkins' ? {} : { tab: next }, { replace: true })
  }

  return (
    <TabWorkspace
      eyebrow="Walk-in Pedia · Job Book"
      title={tab === 'walkins' ? 'Walk-in Pedia' : 'Job Book'}
      subtitle={
        tab === 'walkins'
          ? 'Every drive people know about, grouped by whether you can still turn up. Companies post their own; candidates post the ones they hear about.'
          : 'Openings posted by companies and passed on by candidates — each one with a way to actually apply.'
      }
      actions={
        <Link to={`/feed/new?kind=${tab === 'walkins' ? 'walkin' : 'job'}`}>
          <Button variant="inverse" size="sm">
            {tab === 'walkins' ? 'Post a drive' : 'Post an opening'}
          </Button>
        </Link>
      }
      artwork={<SectionArtwork scene={tab} />}
      rail={<SectionRoadmap steps={ROADMAPS[tab]} />}
      tabsAriaLabel="Walk-in Pedia or Job Book"
      value={tab}
      onChange={setTab}
      tabs={[
        { value: 'walkins', label: 'Walk-in Pedia', hint: 'drives near you' },
        { value: 'jobs', label: 'Job Book', hint: 'openings & referrals' },
      ]}
    >
      {/* Keyed so each tab keeps its own filter state and replays its entrance
          instead of inheriting the other tab's in-flight request. */}
      {tab === 'walkins' ? <WalkinTab key="walkins" /> : <JobTab key="jobs" />}
    </TabWorkspace>
  )
}

// ---------------------------------------------------------------------------
// Walk-ins
// ---------------------------------------------------------------------------

/**
 * When a drive is happening — the second level of tabs on this screen.
 *
 * These used to be three stacked sections, so finding tomorrow's drives meant
 * scrolling past everything happening today, and "Over" (the longest list, and
 * the least useful one to a candidate planning a trip) sat at the bottom of a
 * page nobody reached. As tabs each one is one click away and carries its
 * count, which is the number you actually want before choosing.
 */
const sections = [
  {
    key: 'today' as const,
    title: 'Today',
    hint: 'Happening right now — you can still turn up.',
    accent: 'text-verified',
    tone: 'verified' as const,
  },
  {
    key: 'upcoming' as const,
    title: 'Upcoming',
    hint: 'Coming up. Plan your travel and documents.',
    accent: 'text-boost',
    tone: 'boost' as const,
  },
  {
    key: 'over' as const,
    title: 'Over',
    hint: 'Already happened. Kept so you can see who hires this way, and how often.',
    accent: 'text-ink/50',
    tone: 'neutral' as const,
  },
]

type SectionKey = (typeof sections)[number]['key']

function WalkinTab() {
  const [feed, setFeed] = useState<WalkinFeed | null>(null)
  const [locations, setLocations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<SectionKey>('today')

  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listWalkins({
        date: date || undefined,
        location: location || undefined,
        q: q || undefined,
      })
      setFeed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load walk-in drives')
    } finally {
      setLoading(false)
    }
  }, [date, location, q])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    listWalkinLocations()
      .then(setLocations)
      // The filter is an optional convenience — a failure here should not
      // take down the drives themselves, which have their own error path.
      .catch(() => setLocations([]))
  }, [])

  const patch = (updated: FeedPost) => {
    setFeed((prev) =>
      prev
        ? {
            ...prev,
            today: prev.today.map((post) => (post.id === updated.id ? updated : post)),
            upcoming: prev.upcoming.map((post) => (post.id === updated.id ? updated : post)),
            over: prev.over.map((post) => (post.id === updated.id ? updated : post)),
          }
        : prev,
    )
  }

  const remove = (id: string) => {
    setFeed((prev) =>
      prev
        ? {
            ...prev,
            today: prev.today.filter((post) => post.id !== id),
            upcoming: prev.upcoming.filter((post) => post.id !== id),
            over: prev.over.filter((post) => post.id !== id),
          }
        : prev,
    )
  }

  const hasFilters = Boolean(date || location || q)
  const total = feed ? feed.today.length + feed.upcoming.length + feed.over.length : 0

  return (
    <>
      {/* No top margin: TabWorkspace already spaces the content region from
          the tab bar, and these panels are the top of it. */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Select
            label="Location"
            placeholder="Anywhere"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            options={[
              { value: '', label: 'Anywhere' },
              ...locations.map((city) => ({ value: city, label: city })),
            ]}
          />
          <Input
            label="Company or role"
            placeholder="e.g. Infosys, or Support Engineer"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={!hasFilters}
              onClick={() => {
                setDate('')
                setLocation('')
                setQ('')
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Second level: when. A different control from the board tabs above —
          see components/ui/SubTabs for why the two levels must not match. */}
      <SubTabs
        className="mt-6"
        aria-label="When is the drive"
        value={section}
        onChange={setSection}
        options={sections.map((entry) => ({
          value: entry.key,
          label: entry.title,
          count: loading || !feed ? undefined : feed[entry.key].length,
          tone: entry.tone,
        }))}
      />

      {loading && <ListSkeleton className="mt-6" rows={3} variant="card" />}
      {error && <p className="mt-6 text-danger">{error}</p>}

      {!loading && !error && feed && total === 0 && (
        <Card className="mt-6 text-center">
          <p className="font-semibold text-ink">
            {hasFilters ? 'No drives match those filters.' : 'No drives posted yet.'}
          </p>
          <p className="mt-1 text-sm text-ink/60">
            {hasFilters
              ? 'Try a wider date or another city.'
              : 'Know one? Post it — the whole point of this page is that it is filled in by the people who hear about drives first.'}
          </p>
          <Link to="/feed/new?kind=walkin" className="mt-4 inline-block">
            <Button size="sm">Post a drive</Button>
          </Link>
        </Card>
      )}

      {!loading && !error && feed && total > 0 && <WalkinSection feed={feed} section={section} patch={patch} remove={remove} />}
    </>
  )
}

/** One timing bucket's drives. Split out so switching buckets replays the entrance. */
function WalkinSection({
  feed,
  section,
  patch,
  remove,
}: {
  feed: WalkinFeed
  section: SectionKey
  patch: (post: FeedPost) => void
  remove: (id: string) => void
}) {
  const meta = sections.find((entry) => entry.key === section)!
  const posts = feed[section]

  return (
    <div key={section} className="mt-5 animate-fade-up">
      <p className="text-sm text-ink/50">{meta.hint}</p>

      {posts.length === 0 ? (
        <Card className="mt-4 text-center">
          <p className="font-semibold text-ink">
            Nothing {section === 'over' ? 'in the archive' : `${meta.title.toLowerCase()}`} right now.
          </p>
          <p className="mt-1 text-sm text-ink/60">
            {section === 'today'
              ? 'Check Upcoming — there may be one worth planning for.'
              : 'Try another bucket, or widen your filters above.'}
          </p>
        </Card>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 2xl:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onChange={patch} onRemoved={remove} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Job Book
// ---------------------------------------------------------------------------

function JobTab() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listJobs({ location: location || undefined, q: q || undefined, limit: 50 })
      setPosts(result.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the Job Book')
    } finally {
      setLoading(false)
    }
  }, [location, q])

  useEffect(() => {
    void load()
  }, [load])

  const patch = (updated: FeedPost) =>
    setPosts((prev) => prev.map((post) => (post.id === updated.id ? updated : post)))
  const remove = (id: string) => setPosts((prev) => prev.filter((post) => post.id !== id))

  return (
    <>
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Location"
            placeholder="Any city"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
          <Input
            label="Company or role"
            placeholder="e.g. Zoho, or Data Analyst"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={!location && !q}
              onClick={() => {
                setLocation('')
                setQ('')
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      {loading && <ListSkeleton className="mt-6" rows={3} variant="card" />}
      {error && <p className="mt-6 text-danger">{error}</p>}

      {!loading && !error && posts.length === 0 && (
        <Card className="mt-6 text-center">
          <p className="font-semibold text-ink">Nothing in the Job Book yet.</p>
          <p className="mt-1 text-sm text-ink/60">
            Companies post their openings here, and candidates pass on the ones they find. Either way it
            has to carry a link or a contact, so nobody is left wondering how to apply.
          </p>
          <Link to="/feed/new?kind=job" className="mt-4 inline-block">
            <Button size="sm">Post an opening</Button>
          </Link>
        </Card>
      )}

      {!loading && !error && posts.length > 0 && (
        // 2xl, not xl: inside the workspace's right-hand column an `xl`
        // two-up put two post cards into roughly 380px each.
        <div className="mt-6 grid grid-cols-1 gap-5 2xl:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onChange={patch} onRemoved={remove} />
          ))}
        </div>
      )}
    </>
  )
}
