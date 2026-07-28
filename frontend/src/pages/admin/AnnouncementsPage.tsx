import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import PageLoader from '@/components/ui/PageLoader'
import { createAnnouncement, listAnnouncements, type AdminAnnouncement, type AnnouncementAudience } from '@/lib/adminApi'

const audienceOptions: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'candidate', label: 'Candidates' },
  { value: 'company', label: 'Companies' },
  { value: 'verifier', label: 'Verifiers' },
]

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>('all')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listAnnouncements()
      setAnnouncements(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handlePost = async () => {
    if (!title.trim() || !body.trim()) {
      setPostError('Title and body are both required.')
      return
    }
    setPosting(true)
    setPostError(null)
    try {
      await createAnnouncement({ title: title.trim(), body: body.trim(), audience })
      setTitle('')
      setBody('')
      setAudience('all')
      await load()
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post announcement')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Announcements</h1>
      <p className="mt-1 text-ink/60">Broadcast a notification to every account (or one role) at once.</p>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Compose</h2>
        <div className="mt-3 flex flex-col gap-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink" htmlFor="announcement-body">
              Body
            </label>
            <textarea
              id="announcement-body"
              rows={4}
              className="rounded-card border border-line bg-card px-3 py-2 text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Select
            label="Audience"
            options={audienceOptions}
            value={audience}
            onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
          />
        </div>
        {postError && <p className="mt-2 text-sm text-danger">{postError}</p>}
        <Button type="button" className="mt-4" loading={posting} onClick={handlePost}>
          Post announcement
        </Button>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Past announcements</h2>
        {loading && <PageLoader compact label="Loading announcements…" />}
        {!loading && error && <p className="mt-2 text-danger">{error}</p>}
        {!loading && !error && announcements.length === 0 && (
          <p className="mt-2 text-sm text-ink/50">No announcements posted yet.</p>
        )}
        {!loading && !error && announcements.length > 0 && (
          <div className="mt-3 flex flex-col gap-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="border-b border-line pb-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{announcement.title}</p>
                  <Badge tone="neutral">{audienceOptions.find((a) => a.value === announcement.audience)?.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink/70">{announcement.body}</p>
                <p className="mt-1 text-xs text-ink/40">{new Date(announcement.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
