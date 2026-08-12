import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import PageSkeleton from '@/components/ui/PageSkeleton'
import PageHero from '@/components/ui/PageHero'
import SupportNote from '@/components/ui/SupportNote'
import FormProgress, { type FormRequirement } from '@/components/ui/FormProgress'
import { Detail, DetailGrid, DetailSection, EditIconButton } from '@/components/ui/DetailGrid'
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

/**
 * "Have they actually filled this in?" — a real company name (signup seeds it
 * with the account email as a placeholder) plus an industry. Also decides
 * whether this page opens in edit mode or read mode.
 */
function isProfileFilledIn(profile: CompanyProfileResponse): boolean {
  return !profile.companyName.includes('@') && Boolean(profile.industry)
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
      {href.replace(/^https?:\/\//, '').slice(0, 40)} ↗
    </a>
  )
}

/**
 * The company's own profile, as a record rather than a form.
 *
 * Previously this was permanently a stack of inputs: a company that had
 * already filled everything in and came back a week later was handed the same
 * blank-looking data-entry screen, with no sense that anything had been saved
 * or what state verification was in. Now a filled-in profile reads back as a
 * card with its verification status, and the pencil is what turns it editable
 * — with an explicit Save/Cancel pair, so leaving without saving is a
 * deliberate act rather than an accident.
 */
export default function CompanySetupPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState<CompanyProfileResponse | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyCompanyProfile()
        if (cancelled) return
        setProfile(result)
        setForm(profileToForm(result))
        // A brand-new company has nothing to read back, so drop them straight
        // into the form rather than showing a card full of em dashes.
        setEditing(!isProfileFilledIn(result))
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

  /**
   * What an admin is actually looking at when they decide, recomputed as you
   * type. Not backend validation — PUT /companies/me/profile accepts a
   * partial profile on purpose, so a company can save progress — but the
   * difference between "saved" and "reviewable" was previously invisible: a
   * company could fill in a name, save, and sit in the queue indefinitely
   * with no idea that the blank industry and missing website were why.
   *
   * The signup-seeded company name is the account email, so a name still
   * containing '@' counts as unfilled — same test isProfileFilledIn() uses.
   */
  const requirements: FormRequirement[] = form
    ? [
        {
          key: 'companyName',
          label: 'Company name',
          done: form.companyName.trim().length > 0 && !form.companyName.includes('@'),
          hint: 'Your real registered or trading name',
        },
        { key: 'industry', label: 'Industry', done: form.industry.trim().length > 0 },
        {
          key: 'website',
          label: 'Website',
          done: form.website.trim().length > 0,
          hint: 'How an admin confirms you exist',
        },
        { key: 'size', label: 'Company size', done: form.size.trim().length > 0 },
      ]
    : []

  const handleCancel = () => {
    // Discard the draft by re-deriving the form from the last saved profile,
    // so reopening the editor doesn't show abandoned edits.
    if (profile) setForm(profileToForm(profile))
    setSaveError(null)
    setSaveNotice(null)
    setEditing(false)
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setSaveError(null)
    setSaveNotice(null)
    try {
      const updated = await upsertMyCompanyProfile(formToBody(form))
      const wasFirstCompletion = profile ? !isProfileFilledIn(profile) : false

      setProfile(updated)
      setForm(profileToForm(updated))
      setSaveNotice(
        wasFirstCompletion
          ? 'Saved — your company is now in the verification queue.'
          : 'Saved. Your changes are live on this profile.',
      )
      setEditing(false)

      // First time this profile becomes usable, hand them on to the dashboard.
      // On later edits they stay put — being bounced away from a page you just
      // corrected a typo on is disorienting.
      if (wasFirstCompletion && isProfileFilledIn(updated)) {
        navigate('/company')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      // `/company` resolves here for an unverified company, so this is on
      // the path taken every time a company clicks Home.
      <PageSkeleton width="narrow" blocks={3} />
    )
  }

  if (loadError || !profile || !form) {
    return (
      <div className="mx-auto w-full max-w-app-narrow px-4 py-16 sm:px-6 lg:px-8">
        <Card>
          <p className="text-danger">{loadError || 'Something went wrong loading your company profile.'}</p>
        </Card>
        <SupportNote className="mt-6" />
      </div>
    )
  }

  const displayName = profile.companyName.includes('@') ? 'Your company' : profile.companyName

  return (
    <div className="mx-auto w-full max-w-app-narrow px-4 py-8 sm:px-6 lg:px-8">
      <PageHero
        eyebrow="Company portal"
        title={displayName}
        subtitle={
          editing
            ? 'Tell us about your company so candidates know who they’re talking to.'
            : 'This is what our verification team and candidates see.'
        }
        meta={
          <>
            {profile.verified ? (
              <Badge tone="verified">✓ Verified by admin</Badge>
            ) : (
              <Badge tone="boost">Verification pending</Badge>
            )}
            {profile.plan && <Badge tone="neutral">{profile.plan.name} plan</Badge>}
          </>
        }
        actions={
          !editing && (
            <Button variant="inverse" size="sm" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          )
        }
      />

      {saveNotice && !editing && (
        <p className="mt-4 animate-fade-in rounded-card bg-verified/10 px-4 py-2 text-sm font-medium text-verified">
          {saveNotice}
        </p>
      )}

      {/* Live while editing: an admin reviewing this account is looking for
          exactly these four things, and a company that fills in two of them
          and stops has no way to know that is why it is still pending. */}
      {editing && (
        <FormProgress
          className="mt-6"
          requirements={requirements}
          title="What an admin needs to verify you"
          completeMessage="Everything an admin looks for is filled in. Save, and you're in the queue."
        />
      )}

      <div className="mt-8 flex flex-col gap-8">
        {editing ? (
          <>
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

            <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-card border border-line bg-card/95 p-4 shadow-lift backdrop-blur-md sm:flex-row sm:items-center">
              <Button type="button" onClick={handleSave} loading={saving}>
                Save changes
              </Button>
              {/* No Cancel on the very first fill-in — there is no saved
                  version to return to, so it would just strand them on an
                  empty card. */}
              {isProfileFilledIn(profile) && (
                <Button type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
              )}
            </div>
            {saveError && <p className="text-sm text-danger">{saveError}</p>}
          </>
        ) : (
          <Card className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                {profile.logoLink ? (
                  <img
                    src={profile.logoLink}
                    alt=""
                    className="h-14 w-14 flex-shrink-0 rounded-card border border-line object-contain"
                  />
                ) : (
                  <Avatar name={displayName} size="lg" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-ink">{displayName}</p>
                  <p className="truncate text-sm text-ink/50">{profile.email}</p>
                </div>
              </div>
              <EditIconButton onClick={() => setEditing(true)} label="Edit" />
            </div>

            <DetailSection title="Company details">
              <DetailGrid>
                <Detail label="Industry" value={profile.industry} />
                <Detail label="Company size" value={profile.size ? `${profile.size} employees` : null} />
                <Detail
                  label="Website"
                  value={profile.website ? <ExternalLink href={profile.website} /> : null}
                />
                <Detail label="GST / registration" value={profile.gstNumber} />
              </DetailGrid>
            </DetailSection>

            {/* What is still closed, named rather than left to be discovered
                by clicking. Until `verified` flips, this page is the whole of
                the account: the nav hides everything else, and both the route
                guard and the API refuse it (see lib/verification.ts and the
                backend's requireVerified). */}
            {!profile.verified && (
              <div className="rounded-card border border-boost/30 bg-boost/5 p-4">
                <p className="font-semibold text-boost">Waiting on admin verification</p>
                <p className="mt-1 text-sm text-ink/70">
                  Your account is limited to this page for now. Approval turns all of it on at once —
                  there is nothing else to do in the meantime except keep these details accurate.
                </p>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { icon: '🔍', label: 'Candidate search', hint: 'browse verified candidates' },
                    { icon: '🔓', label: 'Contact unlocks', hint: 'phone, email, WhatsApp' },
                    { icon: '✉️', label: 'Messaging', hint: 'reach candidates directly' },
                    { icon: '📋', label: 'Walk-ins, Jobs & Communities', hint: 'post your own drives' },
                  ].map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center gap-3 rounded-card bg-card px-3 py-2.5"
                    >
                      <span className="text-lg opacity-60" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink/70">{item.label}</span>
                        <span className="block text-xs text-ink/40">{item.hint}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DetailSection
              title="Status"
              description={
                profile.verified
                  ? 'Verified — the full candidate portal is open to you.'
                  : 'An admin is reviewing your details. Candidate search unlocks as soon as that passes.'
              }
            >
              <DetailGrid>
                <Detail
                  label="Verification"
                  value={
                    profile.verified ? (
                      <span className="font-semibold text-verified">Verified</span>
                    ) : (
                      <span className="font-semibold text-boost">Pending</span>
                    )
                  }
                />
                <Detail label="Plan" value={profile.plan?.name ?? 'Free'} />
                <Detail label="Unlocks remaining" value={profile.remainingUnlocks} />
                <Detail
                  label="Member since"
                  value={new Date(profile.createdAt).toLocaleDateString()}
                />
              </DetailGrid>
            </DetailSection>

            {profile.verified && (
              <div className="flex flex-wrap gap-3 border-t border-line pt-6">
                <Link to="/company/search">
                  <Button size="sm">Browse candidates</Button>
                </Link>
                <Link to="/company/dashboard">
                  <Button size="sm" variant="secondary">
                    Dashboard
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        )}
      </div>

      <SupportNote className="mt-10">Need to change something you can&apos;t edit here?</SupportNote>
    </div>
  )
}
