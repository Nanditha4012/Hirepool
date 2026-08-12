import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import PageHero from '@/components/ui/PageHero'
import Select from '@/components/ui/Select'
import SegmentedTabs from '@/components/ui/SegmentedTabs'
import FormProgress, { type FormRequirement } from '@/components/ui/FormProgress'
import { useAuth } from '@/lib/authStore'
import {
  createPost,
  listCommunities,
  type CommunitySummary,
  type CreatePostBody,
  type FeedPostKind,
} from '@/lib/feedApi'

/** Multi-line field. There is no Textarea primitive in the UI kit yet. */
function TextArea({
  label,
  hint,
  rows = 4,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-ink">{label}</label>
      <textarea
        rows={rows}
        className="resize-y rounded-card border border-line bg-card px-3 py-2 text-ink placeholder:text-ink/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        {...rest}
      />
      {hint && <p className="text-xs text-ink/50">{hint}</p>}
    </div>
  )
}

interface FormState {
  title: string
  body: string
  companyName: string
  roleTitle: string
  location: string
  qualification: string
  experience: string
  salary: string
  walkinDate: string
  walkinStartTime: string
  walkinEndTime: string
  venue: string
  applyLink: string
  contactPerson: string
  contactEmail: string
  contactPhone: string
  whatsappLink: string
  imageLink: string
  communityId: string
  postedOnBehalf: boolean
}

const emptyForm: FormState = {
  title: '',
  body: '',
  companyName: '',
  roleTitle: '',
  location: '',
  qualification: '',
  experience: '',
  salary: '',
  walkinDate: '',
  walkinStartTime: '',
  walkinEndTime: '',
  venue: '',
  applyLink: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  whatsappLink: '',
  imageLink: '',
  communityId: '',
  postedOnBehalf: false,
}

function isKind(value: string | null): value is FeedPostKind {
  return value === 'walkin' || value === 'job' || value === 'community'
}

/**
 * The one composer behind the raised + button.
 *
 * Which kind you are writing is a tab rather than three separate routes,
 * because the three overlap almost entirely — everything except the drive
 * date/venue block and the community picker is shared, and a candidate who
 * starts typing a walk-in and realises it is really a Job Book post should
 * not have to retype it.
 *
 * The required-field rules are the server's (see feedController.ts); this
 * marks the same fields with an asterisk and surfaces whatever the server
 * says rather than trying to re-implement the validation and drift from it.
 */
export default function CreatePostPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const kindParam = searchParams.get('kind')
  const kind: FeedPostKind = isKind(kindParam) ? kindParam : 'walkin'

  const [form, setForm] = useState<FormState>(emptyForm)
  const [communities, setCommunities] = useState<CommunitySummary[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Drives the publish animation between a successful POST and the redirect. */
  const [published, setPublished] = useState(false)

  // Only the communities you have joined — the server rejects a post into one
  // you have not, so offering the rest would be offering a guaranteed error.
  useEffect(() => {
    if (kind !== 'community') return
    listCommunities()
      .then((all) => setCommunities(all.filter((community) => community.joined)))
      .catch(() => setCommunities([]))
  }, [kind])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setKind = (next: FeedPostKind) => {
    setError(null)
    setSearchParams({ kind: next }, { replace: true })
  }

  const buildBody = (): CreatePostBody => {
    const shared = {
      title: form.title,
      body: form.body || undefined,
      imageLink: form.imageLink || undefined,
    }

    if (kind === 'community') {
      return { kind: 'community', communityId: form.communityId, ...shared }
    }

    const hiring = {
      ...shared,
      companyName: form.companyName,
      roleTitle: form.roleTitle,
      location: form.location,
      qualification: form.qualification,
      experience: form.experience || undefined,
      salary: form.salary || undefined,
      applyLink: form.applyLink || undefined,
      contactPerson: form.contactPerson || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      whatsappLink: form.whatsappLink || undefined,
      // A company posting under its own account is the company; only a
      // candidate can be relaying someone else's drive.
      postedOnBehalf: user?.role === 'company' ? false : form.postedOnBehalf,
    }

    if (kind === 'walkin') {
      return {
        kind: 'walkin',
        ...hiring,
        walkinDate: form.walkinDate,
        walkinStartTime: form.walkinStartTime || undefined,
        walkinEndTime: form.walkinEndTime || undefined,
        venue: form.venue,
      }
    }

    return { kind: 'job', ...hiring }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createPost(buildBody())
      // A beat of "it went out" before the board replaces the composer.
      // Publishing used to be silent — the page simply became a different
      // page — which reads the same as a mis-click on a busy feed.
      setPublished(true)
      window.setTimeout(() => {
        navigate(
          kind === 'community' ? '/community' : `/feed?tab=${kind === 'job' ? 'jobs' : 'walkins'}`,
        )
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish that post')
      setSaving(false)
    }
  }

  /**
   * The same fields the asterisks mark, as a live checklist.
   *
   * The server is still the authority (see feedController.ts) — this does not
   * gate the submit, and whatever the server says is what gets shown on
   * failure. It exists because the required set changes with the tab: a
   * walk-in needs a date and a venue that a Job Book post does not, and a
   * community post needs almost none of it. Switching tabs used to silently
   * change what "*" meant halfway down a long form.
   */
  const contactGiven = Boolean(
    form.applyLink || form.contactEmail || form.contactPhone || form.whatsappLink,
  )

  const requirements: FormRequirement[] =
    kind === 'community'
      ? [
          { key: 'community', label: 'A community to post in', done: Boolean(form.communityId) },
          { key: 'title', label: 'Title', done: form.title.trim().length > 0 },
        ]
      : [
          { key: 'title', label: 'Title', done: form.title.trim().length > 0 },
          { key: 'companyName', label: 'Company', done: form.companyName.trim().length > 0 },
          { key: 'roleTitle', label: 'Role', done: form.roleTitle.trim().length > 0 },
          {
            key: 'location',
            label: kind === 'walkin' ? 'City' : 'Location',
            done: form.location.trim().length > 0,
          },
          { key: 'qualification', label: 'Qualification', done: form.qualification.trim().length > 0 },
          ...(kind === 'walkin'
            ? [
                { key: 'walkinDate', label: 'Date', done: form.walkinDate.trim().length > 0 },
                {
                  key: 'venue',
                  label: 'Venue',
                  done: form.venue.trim().length > 0,
                  hint: 'The address people navigate to',
                },
              ]
            : []),
          {
            key: 'contact',
            label: 'A way to reach you',
            done: contactGiven,
            hint: 'Apply link, email, phone or WhatsApp — any one',
          },
        ]

  const outstanding = requirements.filter((r) => !r.done)

  const heroCopy: Record<FeedPostKind, { title: string; subtitle: string }> = {
    walkin: {
      title: 'Post a walk-in drive',
      subtitle:
        'Say when, where, for what role and who to ask for. A drive without those is one nobody can attend.',
    },
    job: {
      title: 'Post to the Job Book',
      subtitle: 'An opening needs a way to apply — a link, an email, a phone number or WhatsApp.',
    },
    community: {
      title: 'Post in a community',
      subtitle: 'A question, an interview experience, an opening you spotted, or a meme.',
    },
  }

  return (
    <div className="mx-auto max-w-app-narrow px-4 py-10 sm:px-6 lg:px-10">
      <PageHero eyebrow="New post" title={heroCopy[kind].title} subtitle={heroCopy[kind].subtitle}>
        <SegmentedTabs
          inverted
          aria-label="What are you posting?"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'walkin', label: 'Walk-in drive' },
            { value: 'job', label: 'Job Book' },
            { value: 'community', label: 'Community' },
          ]}
        />
      </PageHero>

      <FormProgress
        className="mt-6"
        requirements={requirements}
        title="What this post still needs"
        completeMessage="This post has everything someone needs to act on it."
      />

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">
            {kind === 'community' ? 'Your post' : 'The opening'}
          </h2>

          {kind === 'community' && (
            <>
              <Select
                label="Community *"
                placeholder={communities.length ? 'Choose a community' : 'Join a community first'}
                value={form.communityId}
                onChange={(event) => set('communityId', event.target.value)}
                options={communities.map((community) => ({
                  value: community.id,
                  // A native <option> can only hold text, so no crest here —
                  // just the plain name, rather than an emoji standing in for
                  // artwork the control cannot render.
                  label: community.name,
                }))}
                required
              />
              {communities.length === 0 && (
                <p className="text-sm text-ink/60">
                  You haven&apos;t joined any communities yet.{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/community')}
                    className="font-semibold text-primary hover:underline"
                  >
                    Browse them
                  </button>{' '}
                  and join one to post.
                </p>
              )}
            </>
          )}

          <Input
            label="Title *"
            placeholder={
              kind === 'walkin'
                ? 'e.g. Mega walk-in drive for Support Engineers'
                : kind === 'job'
                  ? 'e.g. Hiring Java developers — 2 to 4 years'
                  : 'e.g. Got rejected in round 3 — here is what they asked'
            }
            value={form.title}
            onChange={(event) => set('title', event.target.value)}
            required
          />

          {kind !== 'community' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Company *"
                placeholder="Who is hiring"
                value={form.companyName}
                onChange={(event) => set('companyName', event.target.value)}
                required
              />
              <Input
                label="Role *"
                placeholder="e.g. Process Associate"
                value={form.roleTitle}
                onChange={(event) => set('roleTitle', event.target.value)}
                required
              />
              <Input
                label={kind === 'walkin' ? 'City *' : 'Location *'}
                placeholder="e.g. Bengaluru"
                value={form.location}
                onChange={(event) => set('location', event.target.value)}
                required
              />
              <Input
                label="Qualification *"
                placeholder="e.g. Any degree, or B.E / B.Tech / B.Sc"
                value={form.qualification}
                onChange={(event) => set('qualification', event.target.value)}
                required
              />
              <Input
                label="Experience"
                placeholder="e.g. Freshers, or 2–5 years"
                value={form.experience}
                onChange={(event) => set('experience', event.target.value)}
              />
              <Input
                label="Salary"
                placeholder="e.g. ₹3.5–5 LPA"
                value={form.salary}
                onChange={(event) => set('salary', event.target.value)}
              />
            </div>
          )}

          <TextArea
            label={kind === 'community' ? 'Your post' : 'Description'}
            rows={5}
            placeholder={
              kind === 'community'
                ? 'Write it out…'
                : 'What the job involves, what to bring, anything else worth knowing.'
            }
            value={form.body}
            onChange={(event) => set('body', event.target.value)}
          />

          <Input
            label="Image link"
            type="url"
            placeholder="https://… (a poster, a screenshot, a meme)"
            value={form.imageLink}
            onChange={(event) => set('imageLink', event.target.value)}
          />
        </Card>

        {kind === 'walkin' && (
          <Card className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ink">When and where</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Date *"
                type="date"
                value={form.walkinDate}
                onChange={(event) => set('walkinDate', event.target.value)}
                required
              />
              <Input
                label="From"
                type="time"
                value={form.walkinStartTime}
                onChange={(event) => set('walkinStartTime', event.target.value)}
              />
              <Input
                label="To"
                type="time"
                value={form.walkinEndTime}
                onChange={(event) => set('walkinEndTime', event.target.value)}
              />
            </div>
            <TextArea
              label="Venue *"
              rows={3}
              placeholder="Full address, including landmark — this is what people navigate to."
              value={form.venue}
              onChange={(event) => set('venue', event.target.value)}
              required
            />
          </Card>
        )}

        {kind !== 'community' && (
          <Card className="flex flex-col gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">How to reach you</h2>
                {/* Answers "have I done enough here yet?" without making the
                    reader count the boxes they filled. */}
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-xs font-semibold transition-colors duration-300',
                    contactGiven ? 'bg-verified/10 text-verified' : 'bg-boost/10 text-boost',
                  ].join(' ')}
                >
                  {contactGiven ? '✓ Someone can reach you' : 'Fill in at least one'}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink/60">
                At least one of these is required — a post nobody can act on is noise.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Apply link"
                type="url"
                placeholder="https://…"
                value={form.applyLink}
                onChange={(event) => set('applyLink', event.target.value)}
              />
              <Input
                label="Email"
                type="email"
                placeholder="hr@company.com"
                value={form.contactEmail}
                onChange={(event) => set('contactEmail', event.target.value)}
              />
              <Input
                label="WhatsApp link"
                type="url"
                placeholder="https://wa.me/91…"
                value={form.whatsappLink}
                onChange={(event) => set('whatsappLink', event.target.value)}
              />
              <Input
                label="Phone"
                placeholder="+91…"
                value={form.contactPhone}
                onChange={(event) => set('contactPhone', event.target.value)}
              />
              <Input
                label="Contact person"
                placeholder="Who to ask for"
                value={form.contactPerson}
                onChange={(event) => set('contactPerson', event.target.value)}
              />
            </div>

            {user?.role !== 'company' && (
              <label className="flex items-start gap-2.5 rounded-card bg-surface px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.postedOnBehalf}
                  onChange={(event) => set('postedOnBehalf', event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-sm text-ink/75">
                  I&apos;m sharing this on the company&apos;s behalf — I don&apos;t work there.
                  <span className="mt-0.5 block text-xs text-ink/50">
                    The post gets a note saying so, so nobody mistakes it for an official listing.
                  </span>
                </span>
              </label>
            )}
          </Card>
        )}

        {error && <p className="animate-fade-in text-sm text-danger">{error}</p>}

        <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-card border border-line bg-card/95 p-4 shadow-lift backdrop-blur-md sm:flex-row sm:items-center">
          <Button type="submit" loading={saving}>
            {outstanding.length === 0 ? 'Publish' : `Publish — ${outstanding.length} left`}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
            Cancel
          </Button>
          {outstanding.length > 0 && (
            <p className="text-sm text-ink/50">
              Still needed:{' '}
              <span className="font-medium text-ink/70">
                {outstanding
                  .slice(0, 2)
                  .map((r) => r.label)
                  .join(', ')}
                {outstanding.length > 2 && ` +${outstanding.length - 2} more`}
              </span>
            </p>
          )}
        </div>
      </form>

      {published && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/50 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="mx-4 animate-scale-in rounded-card bg-card px-8 py-10 text-center shadow-lift">
            <span
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-verified/10 text-3xl"
              aria-hidden="true"
            >
              📣
            </span>
            <p className="mt-4 text-xl font-bold text-ink">Posted</p>
            <p className="mt-1 text-sm text-ink/60">
              {kind === 'community'
                ? 'Taking you back to your communities.'
                : 'Taking you to the board — your post is at the top.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
