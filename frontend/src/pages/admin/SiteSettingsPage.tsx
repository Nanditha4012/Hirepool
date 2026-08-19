import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PageSkeleton from '@/components/ui/PageSkeleton'
import { getAdminSiteSettings, updateAdminSiteSettings, type SiteSettingsMap } from '@/lib/adminApi'

// The seeded keys per the Phase 5 spec. Any other key the backend happens to
// have is preserved on save (only fields actually edited here are sent), but
// this form only renders inputs for the known set.
const FIELDS: { key: string; label: string; kind: 'text' | 'textarea' }[] = [
  { key: 'app_name', label: 'App name', kind: 'text' },
  { key: 'hero_title', label: 'Hero title', kind: 'text' },
  { key: 'hero_subtitle', label: 'Hero subtitle', kind: 'text' },
  { key: 'boost_price_per_day', label: 'Boost price per day', kind: 'text' },
  { key: 'faq', label: 'FAQ (raw JSON)', kind: 'textarea' },
  {
    key: 'jd_parsing_prompt_template',
    label: 'JD parsing prompt template (AI Relevancy Packages)',
    kind: 'textarea',
  },
]

export default function SiteSettingsPage() {
  const [original, setOriginal] = useState<SiteSettingsMap>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getAdminSiteSettings()
      setOriginal(result)
      const nextDraft: Record<string, string> = {}
      FIELDS.forEach((field) => {
        nextDraft[field.key] = result[field.key] ?? ''
      })
      setDraft(nextDraft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load site settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    // Only send keys whose value actually changed from what's stored.
    const changed: Record<string, string> = {}
    FIELDS.forEach((field) => {
      const current = original[field.key] ?? ''
      if (draft[field.key] !== current) changed[field.key] = draft[field.key]
    })
    if (Object.keys(changed).length === 0) {
      setSaved(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const result = await updateAdminSiteSettings(changed)
      setOriginal(result)
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save site settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <PageSkeleton width="narrow" blocks={3} />
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Site settings</h1>
      <p className="mt-1 text-ink/60">Copy shown on the public landing page before any session exists.</p>

      <Card className="mt-6">
        {error && <p className="text-danger">{error}</p>}
        {!error && (
          <div className="flex flex-col gap-4">
            {FIELDS.map((field) =>
              field.kind === 'textarea' ? (
                <div key={field.key} className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-ink" htmlFor={`setting-${field.key}`}>
                    {field.label}
                  </label>
                  <textarea
                    id={`setting-${field.key}`}
                    rows={6}
                    className="rounded-card border border-line bg-card px-3 py-2 font-mono text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    value={draft[field.key] ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                </div>
              ) : (
                <Input
                  key={field.key}
                  label={field.label}
                  value={draft[field.key] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              ),
            )}
          </div>
        )}

        {saveError && <p className="mt-3 text-sm text-danger">{saveError}</p>}
        {saved && !saveError && <p className="mt-3 text-sm text-verified">Saved.</p>}

        <Button type="button" className="mt-6" loading={saving} onClick={handleSave} disabled={Boolean(error)}>
          Save changes
        </Button>
      </Card>
    </div>
  )
}
