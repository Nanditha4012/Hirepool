import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import PageHero from '@/components/ui/PageHero'
import PageLoader from '@/components/ui/PageLoader'
import SegmentedTabs from '@/components/ui/SegmentedTabs'
import Select from '@/components/ui/Select'
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
export default function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'jobs' ? 'jobs' : 'walkins'

  const setTab = (next: Tab) => {
    // `replace` so flipping tabs doesn't stack history entries a reader then
    // has to press Back through to leave the page.
    setSearchParams(next === 'walkins' ? {} : { tab: next }, { replace: true })
  }

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
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
      >
        <SegmentedTabs
          inverted
          aria-label="Walk-in Pedia or Job Book"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'walkins', label: 'Walk-in Pedia', hint: 'drives near you' },
            { value: 'jobs', label: 'Job Book', hint: 'openings & referrals' },
          ]}
        />
      </PageHero>

      {tab === 'walkins' ? <WalkinTab /> : <JobTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Walk-ins
// ---------------------------------------------------------------------------

/** The three sections, in the order the screen stacks them. */
const sections = [
  {
    key: 'today' as const,
    title: 'Today',
    hint: 'Happening right now — you can still turn up.',
    accent: 'text-verified',
  },
  {
    key: 'upcoming' as const,
    title: 'Upcoming',
    hint: 'Coming up. Plan your travel and documents.',
    accent: 'text-boost',
  },
  {
    key: 'over' as const,
    title: 'Over',
    hint: 'Already happened. Kept so you can see who hires this way, and how often.',
    accent: 'text-ink/50',
  },
]

function WalkinTab() {
  const [feed, setFeed] = useState<WalkinFeed | null>(null)
  const [locations, setLocations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      <Card className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {loading && <PageLoader compact label="Loading drives…" className="mt-10" />}
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

      {!loading &&
        !error &&
        feed &&
        sections.map((section) => {
          const posts = feed[section.key]
          if (posts.length === 0) return null
          return (
            <section key={section.key} className="mt-8">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className={['text-xl font-bold', section.accent].join(' ')}>{section.title}</h2>
                <span className="text-sm text-ink/40">
                  {posts.length} {posts.length === 1 ? 'drive' : 'drives'}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-ink/50">{section.hint}</p>

              <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-2">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} onChange={patch} onRemoved={remove} />
                ))}
              </div>
            </section>
          )
        })}
    </>
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
      <Card className="mt-6">
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

      {loading && <PageLoader compact label="Loading openings…" className="mt-10" />}
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
        <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onChange={patch} onRemoved={remove} />
          ))}
        </div>
      )}
    </>
  )
}
