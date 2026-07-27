import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
  getMyCompanyProfile,
  upsertMyCompanyProfile,
  type CompanyProfileResponse,
  type CompanySize,
  type UpsertCompanyProfileBody,
} from '@/lib/companyApi'

const sizeOptions: { value: CompanySize; label: string }[] = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-1000', label: '201-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
]

interface FormState {
  companyName: string
  logoLink: string
  website: string
  industry: string
  size: string
  gstNumber: string
}

function profileToForm(profile: CompanyProfileResponse): FormState {
  return {
    companyName: profile.companyName || '',
    logoLink: profile.logoLink || '',
    website: profile.website || '',
    industry: profile.industry || '',
    size: profile.size || '',
    gstNumber: profile.gstNumber || '',
  }
}

function formToBody(form: FormState): UpsertCompanyProfileBody {
  return {
    companyName: form.companyName,
    logoLink: form.logoLink,
    website: form.website,
    industry: form.industry,
    size: (form.size || undefined) as UpsertCompanyProfileBody['size'],
    gstNumber: form.gstNumber,
  }
}

// A company/domain email (not a free personal one) is preferred but not
// required — this is a soft inline hint, not a blocking validation.
const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com']

function looksLikeFreeEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return Boolean(domain && freeEmailDomains.includes(domain))
}

export default function CompanySetupPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState<CompanyProfileResponse | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [hasSaved, setHasSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyCompanyProfile()
        if (cancelled) return
        setProfile(result)
        setForm(profileToForm(result))
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load your company profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setSaveError(null)
    setSaveNotice(null)
    try {
      const updated = await upsertMyCompanyProfile(formToBody(form))
      setProfile(updated)
      setForm(profileToForm(updated))
      setSaveNotice('Saved.')

      // "Complete enough" heuristic: a real company name (not a bare email
      // placeholder) plus an industry set.
      const isCompleteEnough = !updated.companyName.includes('@') && Boolean(updated.industry)
      if (isCompleteEnough && !hasSaved) {
        navigate('/company')
      }
      setHasSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="text-ink/60">Loading your company profile…</p>
      </div>
    )
  }

  if (loadError || !profile || !form) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{loadError || 'Something went wrong loading your company profile.'}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Company profile</h1>
      <p className="mt-1 text-ink/60">Tell us about your company so candidates know who they&apos;re talking to.</p>

      <div className="mt-8 flex flex-col gap-8">
        <Card>
          <h2 className="text-lg font-semibold text-ink">Account</h2>
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">Account email</p>
            <p className="mt-1 text-ink/80">{profile.email}</p>
            {looksLikeFreeEmail(profile.email) && (
              <p className="mt-2 text-sm text-ink/50">
                A company/domain email is preferred over a free personal one — it helps candidates and our
                verification team trust your account faster.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">Company details</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Company name"
              value={form.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
            />
            <Input
              label="Logo URL"
              type="url"
              placeholder="https://..."
              value={form.logoLink}
              onChange={(e) => updateField('logoLink', e.target.value)}
            />
            <Input
              label="Website"
              type="url"
              placeholder="https://..."
              value={form.website}
              onChange={(e) => updateField('website', e.target.value)}
            />
            <Input
              label="Industry"
              value={form.industry}
              onChange={(e) => updateField('industry', e.target.value)}
            />
            <Select
              label="Company size"
              placeholder="Choose one"
              options={sizeOptions}
              value={form.size}
              onChange={(e) => updateField('size', e.target.value)}
            />
            <Input
              label="GST / registration number (optional)"
              value={form.gstNumber}
              onChange={(e) => updateField('gstNumber', e.target.value)}
            />
          </div>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" onClick={handleSave} loading={saving}>
            Save
          </Button>
          {saveNotice && <p className="text-sm text-verified">{saveNotice}</p>}
        </div>
        {saveError && <p className="text-sm text-danger">{saveError}</p>}
      </div>
    </div>
  )
}
