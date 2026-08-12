import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Combobox from '@/components/ui/Combobox'
import ChipMultiSelect from '@/components/ui/ChipMultiSelect'
import ProfileCard, { type ProfileCardData } from '@/components/candidate/ProfileCard'
import PageSkeleton from '@/components/ui/PageSkeleton'
import PageHero, { HeroStat } from '@/components/ui/PageHero'
import SegmentedTabs, { type SegmentedTabOption } from '@/components/ui/SegmentedTabs'
import SupportNote from '@/components/ui/SupportNote'
import Skeleton from '@/components/ui/Skeleton'
import { ApiRequestError } from '@/lib/apiClient'
import {
  getMyCompanyProfile,
  listDomains,
  listPlatformBadgeMasters,
  listRoles,
  listSkills,
  searchCandidates,
  unlockCandidate,
  type CandidateSearchResult,
  type CompanyProfileResponse,
  type DomainMaster,
  type NoticePeriod,
  type PlatformBadgeMaster,
  type RoleMaster,
  type SkillMaster,
} from '@/lib/companyApi'

// ---------------------------------------------------------------------------
// The top-level switch: Fresher / Experienced / Executive, plus an "everyone"
// segment. These map straight onto candidate_profiles.category, so switching
// re-runs the search rather than filtering client-side — a page of results is
// 20 rows, not the whole pool.
// ---------------------------------------------------------------------------

type TierValue = '' | 'fresher' | 'experienced' | 'executive'

const tierTabs: SegmentedTabOption<TierValue>[] = [
  { value: '', label: 'All talent' },
  { value: 'fresher', label: 'Fresher', hint: '0–1 yrs' },
  { value: 'experienced', label: 'Experienced', hint: '2–10 yrs' },
  { value: 'executive', label: 'Executive', hint: 'Leadership' },
]

const noticePeriodOptions: { value: NoticePeriod | ''; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'immediate', label: 'Immediate' },
  { value: '15_days', label: '15 days' },
  { value: '30_days', label: '30 days' },
  { value: '60_days', label: '60 days' },
  { value: '90_plus_days', label: '90+ days' },
]

const sortOptions = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'recent', label: 'Most recently approved' },
  { value: 'boosted', label: 'Boosted first' },
]

const PAGE_SIZE = 20

interface FilterState {
  category: TierValue
  primaryRoleId: string | null
  skillIds: string[]
  domainId: string | null
  experienceMin: string
  experienceMax: string
  location: string
  noticePeriod: string
  platformName: string
  badgeSelected: string
  questionsSolvedMin: string
  questionsSolvedMax: string
  mncAlumni: boolean
  startupAlumni: boolean
  faangMaangAlumni: boolean
  hasResearch: boolean
  hasHackathonWin: boolean
  sort: string
}

const initialFilters: FilterState = {
  category: '',
  primaryRoleId: null,
  skillIds: [],
  domainId: null,
  experienceMin: '',
  experienceMax: '',
  location: '',
  noticePeriod: '',
  platformName: '',
  badgeSelected: '',
  questionsSolvedMin: '',
  questionsSolvedMax: '',
  mncAlumni: false,
  startupAlumni: false,
  faangMaangAlumni: false,
  hasResearch: false,
  hasHackathonWin: false,
  sort: 'relevance',
}

function mapToProfileCardData(result: CandidateSearchResult): ProfileCardData {
  return {
    id: result.id,
    fullName: result.fullName,
    status: 'approved',
    category: result.category,
    primaryRole: result.primaryRole,
    yearsOfExperience: result.yearsOfExperience,
    secondaryRoles: result.secondaryRoles,
    skills: result.skills,
    domain: result.domain,
    resumeLink: result.resumeLink,
    portfolioLink: result.portfolioLink,
    location: result.location,
    isMncAlumni: result.isMncAlumni,
    isFaangMaangAlumni: result.isFaangMaangAlumni,
    isStartupAlumni: result.isStartupAlumni,
    platformBadges: result.platformBadges,
    verifiedAchievementCounts: result.verifiedAchievementCounts,
    phone: result.phone,
    email: result.email,
    whatsappLink: result.whatsappLink,
  }
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200',
        active
          ? 'bg-primary text-white shadow-soft'
          : 'border border-line text-ink/70 hover:border-primary hover:text-primary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** A collapsible group in the filter rail. */
function FilterGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-line pb-4 last:border-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-1 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-ink/50">{title}</span>
        <span className="text-ink/30 transition-transform duration-200" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-4">{children}</div>}
    </div>
  )
}

/**
 * Shown instead of the portal while an admin hasn't verified the company yet.
 *
 * Candidate profiles are the product, so an unverified account doesn't get to
 * enumerate them at all — not even names and roles with the phone number
 * withheld. The backend enforces this too (GET /companies/search 403s); this
 * screen exists so the block reads as a step in a process rather than an
 * error.
 */
function AwaitingVerification({ profile }: { profile: CompanyProfileResponse | null }) {
  const missingBasics = !profile?.industry || Boolean(profile?.companyName.includes('@'))

  return (
    // max-w-app, not max-w-3xl: this is the company's main working screen and
    // it was capped at 768px, so candidate cards rendered as a narrow strip
    // down the middle of a laptop with empty gutters either side.
    <div className="mx-auto w-full max-w-app px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
      <PageHero
        eyebrow="Company portal"
        title="Your candidate portal is almost open"
        subtitle="An admin is reviewing your company details. The moment that's approved, the full verified candidate pool unlocks here — no further action needed from you."
      />

      <Card className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Where you are</h2>
        <ol className="mt-5 flex flex-col gap-5">
          {[
            {
              title: 'Company profile submitted',
              body: missingBasics
                ? 'Some basics are still missing — a real company name and industry help this move faster.'
                : 'We have your company name, industry and size.',
              done: !missingBasics,
            },
            {
              title: 'Admin verification',
              body: 'Our team is confirming your company is genuine. This is usually same-day.',
              done: false,
            },
            {
              title: 'Candidate portal unlocked',
              body: 'Search, filter and unlock contact details for every verified candidate.',
              done: false,
            },
          ].map((step, index, all) => (
            <li key={step.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={[
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    step.done ? 'bg-verified text-white' : 'border-2 border-line text-ink/40',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {step.done ? '✓' : index + 1}
                </span>
                {index < all.length - 1 && <span className="mt-1 w-px flex-1 bg-line" aria-hidden="true" />}
              </div>
              <div className="pb-1">
                <p className="font-semibold text-ink">{step.title}</p>
                <p className="mt-0.5 text-sm text-ink/60">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {missingBasics && (
          <div className="mt-6">
            <Link to="/company/setup">
              <Button size="sm">Complete company profile</Button>
            </Link>
          </div>
        )}
      </Card>

      <SupportNote className="mt-8">Waiting longer than you expected?</SupportNote>
    </div>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileResponse | null>(null)
  const [roles, setRoles] = useState<RoleMaster[]>([])
  const [skills, setSkills] = useState<SkillMaster[]>([])
  const [domains, setDomains] = useState<DomainMaster[]>([])
  const [platformBadgeMasters, setPlatformBadgeMasters] = useState<PlatformBadgeMaster[]>([])

  const [initialLoading, setInitialLoading] = useState(true)
  const [initialError, setInitialError] = useState<string | null>(null)

  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [page, setPage] = useState(1)

  const [results, setResults] = useState<CandidateSearchResult[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  /** Set when the backend itself refuses the search because we're unverified. */
  const [accessDenied, setAccessDenied] = useState(false)

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [unlockErrors, setUnlockErrors] = useState<Record<string, string>>({})

  const isVerified = Boolean(companyProfile?.verified)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const profileResult = await getMyCompanyProfile()
        if (cancelled) return
        setCompanyProfile(profileResult)

        // Master data is only needed to populate filter controls that an
        // unverified company will never see — skip the four extra round trips
        // for them entirely.
        if (!profileResult.verified) return

        const [rolesResult, skillsResult, domainsResult, platformBadgesResult] = await Promise.all([
          listRoles(),
          listSkills(),
          listDomains(),
          listPlatformBadgeMasters(),
        ])
        if (cancelled) return
        setRoles(rolesResult)
        setSkills(skillsResult)
        setDomains(domainsResult)
        setPlatformBadgeMasters(platformBadgesResult)
      } catch (err) {
        if (!cancelled) setInitialError(err instanceof Error ? err.message : 'Failed to load search filters')
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // `filters` is read inside runSearch but deliberately not a dependency of
  // the auto-search effect below — otherwise every keystroke in the location
  // box would fire a query. The ref keeps runSearch stable while still seeing
  // current values.
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const runSearch = useCallback(async (targetPage: number) => {
    const current = filtersRef.current
    setSearching(true)
    setSearchError(null)
    try {
      const response = await searchCandidates({
        category: (current.category || undefined) as 'fresher' | 'experienced' | 'executive' | undefined,
        primaryRoleId: current.primaryRoleId || undefined,
        skillIds: current.skillIds.length > 0 ? current.skillIds.join(',') : undefined,
        domainId: current.domainId || undefined,
        experienceMin: current.experienceMin !== '' ? Number(current.experienceMin) : undefined,
        experienceMax: current.experienceMax !== '' ? Number(current.experienceMax) : undefined,
        location: current.location || undefined,
        noticePeriod: (current.noticePeriod || undefined) as NoticePeriod | undefined,
        platformName: current.platformName || undefined,
        badgeSelected: current.platformName ? current.badgeSelected || undefined : undefined,
        questionsSolvedMin:
          current.platformName && current.questionsSolvedMin !== '' ? Number(current.questionsSolvedMin) : undefined,
        questionsSolvedMax:
          current.platformName && current.questionsSolvedMax !== '' ? Number(current.questionsSolvedMax) : undefined,
        mncAlumni: current.mncAlumni ? 'true' : undefined,
        startupAlumni: current.startupAlumni ? 'true' : undefined,
        faangMaangAlumni: current.faangMaangAlumni ? 'true' : undefined,
        hasResearch: current.hasResearch ? 'true' : undefined,
        hasHackathonWin: current.hasHackathonWin ? 'true' : undefined,
        sort: current.sort as 'relevance' | 'recent' | 'boosted',
        page: targetPage,
        pageSize: PAGE_SIZE,
      })
      setResults(response.results)
      setTotalCount(response.totalCount)
      setPage(response.page)
    } catch (err) {
      // A 403 here means verification lapsed (or was revoked) since this page
      // was loaded — swap to the pending screen rather than showing the
      // message as a generic search failure.
      if (err instanceof ApiRequestError && err.status === 403) {
        setAccessDenied(true)
        return
      }
      setSearchError(err instanceof Error ? err.message : 'Failed to search candidates')
    } finally {
      setSearching(false)
    }
  }, [])

  // Initial search once filter master data has loaded, and again whenever the
  // tier tab or sort changes — those two are a direct expression of intent, so
  // making the user press "Search" afterwards would feel broken. Every other
  // filter is applied on the button, since half-typed values shouldn't query.
  useEffect(() => {
    if (initialLoading || initialError || !isVerified) return
    runSearch(1)
  }, [initialLoading, initialError, isVerified, filters.category, filters.sort, runSearch])

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.id, label: r.roleName })), [roles])
  const skillOptions = useMemo(() => skills.map((s) => ({ value: s.id, label: s.skillName })), [skills])
  const domainOptions = useMemo(() => domains.map((d) => ({ value: d.id, label: d.domainName })), [domains])

  const platformNames = useMemo(() => {
    const names = new Set(platformBadgeMasters.map((p) => p.platformName))
    return Array.from(names)
  }, [platformBadgeMasters])

  const platformOptions = useMemo(
    () => [{ value: '', label: 'Any' }, ...platformNames.map((name) => ({ value: name, label: name }))],
    [platformNames],
  )

  const badgeOptions = useMemo(() => {
    if (!filters.platformName) return [{ value: '', label: 'Any' }]
    const badges = platformBadgeMasters
      .filter((p) => p.platformName === filters.platformName)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    return [{ value: '', label: 'Any' }, ...badges.map((b) => ({ value: b.badgeName, label: b.badgeName }))]
  }, [platformBadgeMasters, filters.platformName])

  /**
   * Every applied filter as a removable chip, so what's narrowing the results
   * is visible without scrolling the rail — and reversible in one click. The
   * tier tab is excluded on purpose: it's already the most prominent control
   * on the page.
   */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = []
    const add = (key: string, label: string, clear: () => void) => chips.push({ key, label, clear })

    if (filters.primaryRoleId) {
      const role = roles.find((r) => r.id === filters.primaryRoleId)
      add('role', role ? role.roleName : 'Role', () => updateFilter('primaryRoleId', null))
    }
    for (const id of filters.skillIds) {
      const skill = skills.find((s) => s.id === id)
      add(`skill-${id}`, skill ? skill.skillName : 'Skill', () =>
        updateFilter(
          'skillIds',
          filters.skillIds.filter((s) => s !== id),
        ),
      )
    }
    if (filters.domainId) {
      const domain = domains.find((d) => d.id === filters.domainId)
      add('domain', domain ? domain.domainName : 'Domain', () => updateFilter('domainId', null))
    }
    if (filters.experienceMin !== '' || filters.experienceMax !== '') {
      add('exp', `${filters.experienceMin || '0'}–${filters.experienceMax || '∞'} yrs`, () => {
        updateFilter('experienceMin', '')
        updateFilter('experienceMax', '')
      })
    }
    if (filters.location) add('loc', filters.location, () => updateFilter('location', ''))
    if (filters.noticePeriod) {
      const notice = noticePeriodOptions.find((n) => n.value === filters.noticePeriod)
      add('notice', notice ? notice.label : 'Notice', () => updateFilter('noticePeriod', ''))
    }
    if (filters.platformName) {
      add('platform', filters.platformName, () => {
        updateFilter('platformName', '')
        updateFilter('badgeSelected', '')
      })
    }
    if (filters.badgeSelected) add('badge', filters.badgeSelected, () => updateFilter('badgeSelected', ''))
    if (filters.mncAlumni) add('mnc', 'MNC alumni', () => updateFilter('mncAlumni', false))
    if (filters.startupAlumni) add('startup', 'Startup experience', () => updateFilter('startupAlumni', false))
    if (filters.faangMaangAlumni)
      add('faang', 'FAANG/MAANG alumni', () => updateFilter('faangMaangAlumni', false))
    if (filters.hasResearch) add('research', 'Published research', () => updateFilter('hasResearch', false))
    if (filters.hasHackathonWin) add('hack', 'Hackathon win', () => updateFilter('hasHackathonWin', false))

    return chips
  }, [filters, roles, skills, domains])

  const handleUnlock = async (candidateId: string) => {
    setUnlockingId(candidateId)
    setUnlockErrors((prev) => ({ ...prev, [candidateId]: '' }))
    try {
      const response = await unlockCandidate(candidateId)
      setResults((prev) =>
        prev.map((r) =>
          r.id === candidateId
            ? {
                ...r,
                isUnlockedByMe: true,
                phone: response.phone,
                email: response.email,
                whatsappLink: response.whatsappLink,
              }
            : r,
        ),
      )
    } catch (err) {
      setUnlockErrors((prev) => ({
        ...prev,
        [candidateId]: err instanceof Error ? err.message : 'Failed to unlock candidate',
      }))
    } finally {
      setUnlockingId(null)
    }
  }

  if (initialLoading) {
    return <PageSkeleton blocks={3} />
  }

  if (initialError) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{initialError}</p>
        </Card>
        <SupportNote className="mt-6" />
      </div>
    )
  }

  if (!isVerified || accessDenied) {
    return <AwaitingVerification profile={companyProfile} />
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const activeTier = tierTabs.find((t) => t.value === filters.category)

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow="Candidate portal"
        title="Every candidate here is verified"
        subtitle="Field-by-field checked by our team before they appear. Filter down to exactly who you need, then unlock contact details."
        actions={
          <>
            <Link to="/company/unlocked">
              <Button variant="outlineInverse" size="sm">
                My unlocked
              </Button>
            </Link>
            <Link to="/company/messages">
              <Button variant="inverse" size="sm">
                Messages
              </Button>
            </Link>
          </>
        }
      >
        {/* The store switch. Sits in the hero rather than above the results so
            it reads as "which pool am I in", not "another filter". */}
        <SegmentedTabs
          aria-label="Candidate tier"
          inverted
          options={tierTabs}
          value={filters.category}
          onChange={(value) => updateFilter('category', value)}
        />

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat
            label="Matches"
            value={searching ? '…' : totalCount.toLocaleString()}
            hint={activeTier && activeTier.value ? activeTier.label.toLowerCase() : 'all tiers'}
          />
          <HeroStat label="Unlocks left" value={companyProfile?.remainingUnlocks ?? 0} hint="this period" />
          <HeroStat label="Plan" value={companyProfile?.plan?.name ?? 'Free'} />
          <HeroStat
            label="Messages"
            value={companyProfile?.messagesSentThisPeriod ?? 0}
            hint={
              companyProfile?.plan?.monthlyMessageCap == null
                ? 'unlimited'
                : `of ${companyProfile.plan.monthlyMessageCap}`
            }
          />
        </div>
      </PageHero>

      <div className="mt-8 flex items-center justify-between gap-3 md:hidden">
        <p className="text-sm text-ink/60">
          {searching ? 'Searching…' : `${totalCount.toLocaleString()} candidates`}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-card border border-line px-3 py-2 text-sm font-semibold text-ink"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters
          {activeChips.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-white">
              {activeChips.length}
            </span>
          )}
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <aside className={`${filtersOpen ? 'block' : 'hidden'} w-full flex-shrink-0 md:block md:w-72`}>
          {/* sticky so the rail stays reachable through a long result list
              instead of scrolling away after the first row of cards. */}
          <Card className="flex flex-col gap-4 md:sticky md:top-24">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">Filters</h2>
              {activeChips.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...initialFilters, category: prev.category, sort: prev.sort }))}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <FilterGroup title="Role & skills">
              <Combobox
                label="Primary role"
                options={roleOptions}
                value={filters.primaryRoleId}
                onChange={(v) => updateFilter('primaryRoleId', v)}
                placeholder="Search roles…"
              />
              <ChipMultiSelect
                label="Skills"
                options={skillOptions}
                value={filters.skillIds}
                onChange={(v) => updateFilter('skillIds', v)}
                placeholder="Add skills…"
              />
              <Combobox
                label="Domain"
                options={domainOptions}
                value={filters.domainId}
                onChange={(v) => updateFilter('domainId', v)}
                placeholder="Search domains…"
              />
            </FilterGroup>

            <FilterGroup title="Experience & availability">
              <div>
                <p className="text-sm font-medium text-ink">Experience (years)</p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={filters.experienceMin}
                    onChange={(e) => updateFilter('experienceMin', e.target.value)}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={filters.experienceMax}
                    onChange={(e) => updateFilter('experienceMax', e.target.value)}
                  />
                </div>
              </div>

              <Input
                label="Location"
                placeholder="City, state…"
                value={filters.location}
                onChange={(e) => updateFilter('location', e.target.value)}
              />

              <Select
                label="Notice period"
                options={noticePeriodOptions}
                value={filters.noticePeriod}
                onChange={(e) => updateFilter('noticePeriod', e.target.value)}
              />
            </FilterGroup>

            <FilterGroup title="Coding platforms" defaultOpen={false}>
              <Select
                label="Platform"
                options={platformOptions}
                value={filters.platformName}
                onChange={(e) => {
                  updateFilter('platformName', e.target.value)
                  updateFilter('badgeSelected', '')
                }}
              />
              <Select
                label="Badge"
                options={badgeOptions}
                value={filters.badgeSelected}
                disabled={!filters.platformName}
                onChange={(e) => updateFilter('badgeSelected', e.target.value)}
              />
              {filters.platformName && (
                <div>
                  <p className="text-sm font-medium text-ink">Questions solved</p>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Min"
                      value={filters.questionsSolvedMin}
                      onChange={(e) => updateFilter('questionsSolvedMin', e.target.value)}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Max"
                      value={filters.questionsSolvedMax}
                      onChange={(e) => updateFilter('questionsSolvedMax', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </FilterGroup>

            <FilterGroup title="Background">
              <div className="flex flex-wrap gap-2">
                <ToggleChip active={filters.mncAlumni} onClick={() => updateFilter('mncAlumni', !filters.mncAlumni)}>
                  MNC Alumni
                </ToggleChip>
                <ToggleChip
                  active={filters.startupAlumni}
                  onClick={() => updateFilter('startupAlumni', !filters.startupAlumni)}
                >
                  Startup Experience
                </ToggleChip>
                <ToggleChip
                  active={filters.faangMaangAlumni}
                  onClick={() => updateFilter('faangMaangAlumni', !filters.faangMaangAlumni)}
                >
                  FAANG-MAANG Alumni
                </ToggleChip>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={filters.hasResearch}
                    onChange={(e) => updateFilter('hasResearch', e.target.checked)}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                  />
                  Has published research
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={filters.hasHackathonWin}
                    onChange={(e) => updateFilter('hasHackathonWin', e.target.checked)}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                  />
                  Has hackathon win
                </label>
              </div>
            </FilterGroup>

            <Select
              label="Sort"
              options={sortOptions}
              value={filters.sort}
              onChange={(e) => updateFilter('sort', e.target.value)}
            />

            <Button type="button" onClick={() => runSearch(1)} loading={searching}>
              Apply filters
            </Button>
          </Card>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="hidden items-baseline justify-between gap-3 md:flex">
            <p className="text-sm text-ink/60">
              {searching ? (
                'Searching…'
              ) : (
                <>
                  <span className="font-semibold text-ink">{totalCount.toLocaleString()}</span> verified{' '}
                  {activeTier && activeTier.value ? activeTier.label.toLowerCase() : ''} candidate
                  {totalCount === 1 ? '' : 's'}
                </>
              )}
            </p>
            {totalCount > 0 && (
              <p className="text-sm text-ink/40">
                Page {page} of {totalPages}
              </p>
            )}
          </div>

          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
            </div>
          )}

          {searchError && (
            <Card className="mt-4 border border-danger/30 bg-danger/5">
              <p className="text-danger">{searchError}</p>
            </Card>
          )}

          {searching && results.length === 0 && (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-64" />
              ))}
            </div>
          )}

          {!searching && results.length === 0 && !searchError && (
            <Card className="mt-4 text-center">
              <p className="text-4xl" aria-hidden="true">
                🔍
              </p>
              <p className="mt-3 font-semibold text-ink">No candidates match these filters</p>
              <p className="mt-1 text-sm text-ink/60">
                Try widening the experience range, clearing a skill, or switching tier.
              </p>
              {activeChips.length > 0 && (
                <Button
                  className="mt-4"
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilters((prev) => ({ ...initialFilters, category: prev.category }))}
                >
                  Clear all filters
                </Button>
              )}
            </Card>
          )}

          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((result, index) => (
              <div
                key={result.id}
                className="flex animate-fade-up flex-col gap-2"
                // Small per-card stagger so a page of results settles in as a
                // wave rather than snapping in all at once. Capped so the last
                // card on a full page isn't left waiting.
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <ProfileCard profile={mapToProfileCardData(result)} />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap gap-2">
                    {/* Messaging never requires an unlock first — companies can
                        reach out before committing a credit, per spec. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      // The name travels with the id so the inbox can open a
                      // brand-new conversation headed by who it is with,
                      // rather than by a UUID it would have to resolve.
                      onClick={() =>
                        navigate('/company/messages', {
                          state: { candidateId: result.id, candidateName: result.fullName },
                        })
                      }
                    >
                      Message
                    </Button>
                    {!result.isUnlockedByMe && (
                      <Button
                        type="button"
                        size="sm"
                        loading={unlockingId === result.id}
                        onClick={() => handleUnlock(result.id)}
                      >
                        Unlock Contact
                      </Button>
                    )}
                  </div>
                  {unlockErrors[result.id] && <p className="text-xs text-danger">{unlockErrors[result.id]}</p>}
                </div>
              </div>
            ))}
          </div>

          {totalCount > 0 && (
            <div className="mt-10 flex items-center justify-center gap-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1 || searching}
                onClick={() => runSearch(page - 1)}
              >
                Previous
              </Button>
              <p className="text-sm text-ink/60">
                Page {page} of {totalPages}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page >= totalPages || searching}
                onClick={() => runSearch(page + 1)}
              >
                Next
              </Button>
            </div>
          )}

          <SupportNote className="mt-10" />
        </div>
      </div>
    </div>
  )
}
