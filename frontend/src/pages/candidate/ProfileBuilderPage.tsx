import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Combobox from '@/components/ui/Combobox'
import ChipMultiSelect from '@/components/ui/ChipMultiSelect'
import PlatformBadgesSection from './sections/PlatformBadgesSection'
import AchievementsSection from './sections/AchievementsSection'
import {
  getMyProfile,
  listAchievements,
  listCompanies,
  listDomains,
  listRoles,
  listSkills,
  requestCompany,
  upsertMyProfile,
  submitMyProfile,
  type CandidateProfileResponse,
  type CompanyMaster,
  type DomainMaster,
  type RoleMaster,
  type SkillMaster,
  type UpsertProfileBody,
} from '@/lib/candidateApi'

const statusText: Record<CandidateProfileResponse['status'], string> = {
  draft: 'Draft — not yet submitted for review.',
  submitted: 'Submitted — waiting for a verifier to pick it up.',
  under_review: 'Under review — a verifier is checking your details.',
  approved: 'Approved — your profile is live to companies.',
  rejected: 'Rejected — please address the feedback below and resubmit.',
  needs_info: 'More information needed — please address the note below and resubmit.',
}

const companyTypeOptions = [
  { value: 'mnc', label: 'MNC' },
  { value: 'startup', label: 'Startup' },
  { value: 'agency', label: 'Agency' },
]

const noticePeriodOptions = [
  { value: 'immediate', label: 'Immediate' },
  { value: '15_days', label: '15 days' },
  { value: '30_days', label: '30 days' },
  { value: '60_days', label: '60 days' },
  { value: '90_plus_days', label: '90+ days' },
]

interface FormState {
  fullName: string
  phone: string
  primaryRoleId: string | null
  secondaryRoleIds: string[]
  skillIds: string[]
  domainId: string | null
  resumeLink: string
  portfolioLink: string
  yearsOfExperience: string
  currentCompanyId: string | null
  designationRoleId: string | null
  offerLetterOrLinkedinLink: string
  companyType: string
  teamSizeManaged: string
  budgetOwned: string
  titleLevel: string
  location: string
  noticePeriod: string
}

function profileToForm(profile: CandidateProfileResponse): FormState {
  return {
    fullName: profile.fullName || '',
    phone: profile.phone || '',
    primaryRoleId: profile.primaryRole?.id || null,
    secondaryRoleIds: profile.secondaryRoles.map((r) => r.id),
    skillIds: profile.skills.map((s) => s.id),
    domainId: profile.domain?.id || null,
    resumeLink: profile.resumeLink || '',
    portfolioLink: profile.portfolioLink || '',
    yearsOfExperience: profile.yearsOfExperience != null ? String(profile.yearsOfExperience) : '',
    currentCompanyId: profile.currentCompany?.id || null,
    designationRoleId: profile.designationRole?.id || null,
    offerLetterOrLinkedinLink: profile.offerLetterOrLinkedinLink || '',
    companyType: profile.companyType || '',
    teamSizeManaged: profile.teamSizeManaged != null ? String(profile.teamSizeManaged) : '',
    budgetOwned: profile.budgetOwned || '',
    titleLevel: profile.titleLevel || '',
    location: profile.location || '',
    noticePeriod: profile.noticePeriod || '',
  }
}

function formToBody(form: FormState): UpsertProfileBody {
  return {
    fullName: form.fullName,
    phone: form.phone,
    primaryRoleId: form.primaryRoleId,
    secondaryRoleIds: form.secondaryRoleIds,
    skillIds: form.skillIds,
    domainId: form.domainId,
    resumeLink: form.resumeLink,
    portfolioLink: form.portfolioLink,
    yearsOfExperience: form.yearsOfExperience !== '' ? Number(form.yearsOfExperience) : undefined,
    currentCompanyId: form.currentCompanyId,
    designationRoleId: form.designationRoleId,
    offerLetterOrLinkedinLink: form.offerLetterOrLinkedinLink,
    companyType: (form.companyType || undefined) as UpsertProfileBody['companyType'],
    teamSizeManaged: form.teamSizeManaged !== '' ? Number(form.teamSizeManaged) : undefined,
    budgetOwned: form.budgetOwned,
    titleLevel: form.titleLevel,
    location: form.location,
    noticePeriod: (form.noticePeriod || undefined) as UpsertProfileBody['noticePeriod'],
  }
}

export default function ProfileBuilderPage() {
  const [profile, setProfile] = useState<CandidateProfileResponse | null>(null)
  const [roles, setRoles] = useState<RoleMaster[]>([])
  const [skills, setSkills] = useState<SkillMaster[]>([])
  const [domains, setDomains] = useState<DomainMaster[]>([])
  const [companies, setCompanies] = useState<CompanyMaster[]>([])
  const [projectCount, setProjectCount] = useState(0)

  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [companyRequestName, setCompanyRequestName] = useState('')
  const [companyRequestNotice, setCompanyRequestNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [profileResult, rolesResult, skillsResult, domainsResult, companiesResult] = await Promise.all([
          getMyProfile(),
          listRoles(),
          listSkills(),
          listDomains(),
          listCompanies(),
        ])
        if (cancelled) return
        setProfile(profileResult)
        setForm(profileToForm(profileResult))
        setRoles(rolesResult)
        setSkills(skillsResult)
        setDomains(domainsResult)
        setCompanies(companiesResult)

        if (profileResult.category === 'fresher') {
          const projects = await listAchievements('project')
          if (!cancelled) setProjectCount(projects.length)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load your profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.id, label: r.roleName })), [roles])
  const skillOptions = useMemo(() => skills.map((s) => ({ value: s.id, label: s.skillName })), [skills])
  const domainOptions = useMemo(() => domains.map((d) => ({ value: d.id, label: d.domainName })), [domains])
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.companyName })),
    [companies],
  )

  const secondaryRoleOptions = useMemo(
    () => roleOptions.filter((o) => o.value !== form?.primaryRoleId),
    [roleOptions, form?.primaryRoleId],
  )

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSaveDraft = async () => {
    if (!form) return
    setSaving(true)
    setSaveError(null)
    setSaveNotice(null)
    setSubmitError(null)
    try {
      const updated = await upsertMyProfile(formToBody(form))
      setProfile(updated)
      setForm(profileToForm(updated))
      setSaveNotice('Saved.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (!form) return
    setSubmitting(true)
    setSubmitError(null)
    setSaveNotice(null)
    try {
      // Persist current form state first so submit validates against the latest edits.
      await upsertMyProfile(formToBody(form))
      const updated = await submitMyProfile()
      setProfile(updated)
      setForm(profileToForm(updated))
      setSaveNotice('Submitted for review.')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestCompany = async () => {
    if (!companyRequestName.trim()) return
    setCompanyRequestNotice(null)
    try {
      await requestCompany(companyRequestName.trim())
      setCompanyRequestNotice('Requested — we will review and add it soon.')
      setCompanyRequestName('')
    } catch (err) {
      setCompanyRequestNotice(err instanceof Error ? err.message : 'Failed to request company')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="text-ink/60">Loading your profile…</p>
      </div>
    )
  }

  if (loadError || !profile || !form) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{loadError || 'Something went wrong loading your profile.'}</p>
        </Card>
      </div>
    )
  }

  if (!profile.category) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <Card>
          <p className="text-ink">Please complete onboarding before building your profile.</p>
          <Link to="/onboarding/category" className="mt-3 inline-block text-primary hover:underline">
            Choose your category →
          </Link>
        </Card>
      </div>
    )
  }

  const isFresher = profile.category === 'fresher'
  const isApproved = profile.status === 'approved'
  const canSubmit = ['draft', 'rejected', 'needs_info'].includes(profile.status)
  const showVerificationNote =
    (profile.status === 'rejected' || profile.status === 'needs_info') && profile.latestVerificationNote

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Build your profile</h1>
      <p className="mt-1 text-ink/60">This is what companies will see once you&apos;re approved.</p>

      <div
        className={[
          'mt-6 rounded-card px-4 py-3 text-sm font-medium',
          profile.status === 'rejected' || profile.status === 'needs_info'
            ? 'bg-danger/10 text-danger'
            : profile.status === 'approved'
              ? 'bg-verified/10 text-verified'
              : 'bg-surface text-ink/70',
        ].join(' ')}
      >
        {statusText[profile.status]}
      </div>

      {showVerificationNote && (
        <div className="mt-3 rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <p className="font-semibold">What to fix:</p>
          <p className="mt-1">{profile.latestVerificationNote}</p>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-8">
        <Card>
          <h2 className="text-lg font-semibold text-ink">Basics</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              value={form.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
            />
            <Input label="Phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
            <Combobox
              label="Primary role"
              options={roleOptions}
              value={form.primaryRoleId}
              onChange={(v) => updateField('primaryRoleId', v)}
              placeholder="Search roles…"
            />
            <Combobox
              label="Domain"
              options={domainOptions}
              value={form.domainId}
              onChange={(v) => updateField('domainId', v)}
              placeholder="Search domains…"
            />
            <div className="sm:col-span-2">
              <ChipMultiSelect
                label="Secondary roles"
                options={secondaryRoleOptions}
                value={form.secondaryRoleIds}
                onChange={(v) => updateField('secondaryRoleIds', v)}
                placeholder="Add secondary roles…"
              />
            </div>
            <div className="sm:col-span-2">
              <ChipMultiSelect
                label="Skills"
                options={skillOptions}
                value={form.skillIds}
                onChange={(v) => updateField('skillIds', v)}
                placeholder="Add skills…"
              />
            </div>
            <Input
              label="Resume link"
              type="url"
              placeholder="https://..."
              value={form.resumeLink}
              onChange={(e) => updateField('resumeLink', e.target.value)}
            />
            <Input
              label="Portfolio link (optional)"
              type="url"
              placeholder="https://..."
              value={form.portfolioLink}
              onChange={(e) => updateField('portfolioLink', e.target.value)}
            />
            <Input
              label="Location"
              placeholder="City, State"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
            />
            <Select
              label="Notice period"
              placeholder="Choose one"
              options={noticePeriodOptions}
              value={form.noticePeriod}
              onChange={(e) => updateField('noticePeriod', e.target.value)}
            />
          </div>
        </Card>

        {isFresher && (
          <Card>
            <h2 className="text-lg font-semibold text-ink">Platform badges</h2>
            <p className="mt-1 text-sm text-ink/60">Show off your coding platform standing.</p>
            <div className="mt-4">
              <PlatformBadgesSection />
            </div>
            <p className="mt-4 text-sm font-medium text-ink/70">
              {projectCount}/3 projects added — at least 3 project achievements are required for approval.
            </p>
          </Card>
        )}

        {!isFresher && (
          <Card>
            <h2 className="text-lg font-semibold text-ink">Experience</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Years of experience"
                type="number"
                min={0}
                value={form.yearsOfExperience}
                onChange={(e) => updateField('yearsOfExperience', e.target.value)}
              />
              <Combobox
                label="Designation"
                options={roleOptions}
                value={form.designationRoleId}
                onChange={(v) => updateField('designationRoleId', v)}
                placeholder="Search roles…"
              />
              <Combobox
                label="Current company"
                options={companyOptions}
                value={form.currentCompanyId}
                onChange={(v) => updateField('currentCompanyId', v)}
                placeholder="Search companies…"
              />
              <Select
                label="Company type"
                placeholder="Choose one"
                options={companyTypeOptions}
                value={form.companyType}
                onChange={(e) => updateField('companyType', e.target.value)}
              />
              <Input
                label="Offer letter or LinkedIn URL"
                type="url"
                placeholder="https://..."
                value={form.offerLetterOrLinkedinLink}
                onChange={(e) => updateField('offerLetterOrLinkedinLink', e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-card bg-surface p-3">
              <div className="flex-1">
                <Input
                  label="Can't find your company? Request it"
                  placeholder="Company name"
                  value={companyRequestName}
                  onChange={(e) => setCompanyRequestName(e.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleRequestCompany}>
                Request company
              </Button>
              {companyRequestNotice && <p className="w-full text-sm text-ink/60">{companyRequestNotice}</p>}
            </div>

            {profile.category === 'executive' && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Team size managed"
                  type="number"
                  min={0}
                  value={form.teamSizeManaged}
                  onChange={(e) => updateField('teamSizeManaged', e.target.value)}
                />
                <Input
                  label="Budget owned (optional)"
                  value={form.budgetOwned}
                  onChange={(e) => updateField('budgetOwned', e.target.value)}
                />
                <Input
                  label="Title / level"
                  value={form.titleLevel}
                  onChange={(e) => updateField('titleLevel', e.target.value)}
                />
              </div>
            )}
          </Card>
        )}

        <Card>
          <h2 className="text-lg font-semibold text-ink">Achievements &amp; work</h2>
          {isFresher ? (
            <div className="mt-4">
              <AchievementsSection typesToShow={isApproved ? ['project', 'research', 'achievement'] : ['project']} />
            </div>
          ) : isApproved ? (
            <div className="mt-4">
              <AchievementsSection typesToShow={['project', 'research', 'achievement']} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink/40">Available once your profile is approved.</p>
          )}
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" onClick={handleSaveDraft} loading={saving}>
            {isApproved ? 'Save changes' : 'Save draft'}
          </Button>
          {canSubmit && (
            <Button type="button" variant="secondary" onClick={handleSubmitForReview} loading={submitting} disabled={saving}>
              Submit for review
            </Button>
          )}
          {saveNotice && <p className="text-sm text-verified">{saveNotice}</p>}
        </div>
        {saveError && <p className="text-sm text-danger">{saveError}</p>}
        {submitError && <p className="text-sm text-danger">{submitError}</p>}
      </div>
    </div>
  )
}
