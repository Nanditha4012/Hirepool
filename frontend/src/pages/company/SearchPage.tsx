import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Combobox from '@/components/ui/Combobox'
import ChipMultiSelect from '@/components/ui/ChipMultiSelect'
import ProfileCard, { type ProfileCardData } from '@/components/candidate/ProfileCard'
import PageLoader from '@/components/ui/PageLoader'
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

const tierOptions = [
  { value: '', label: 'Any' },
  { value: 'fresher', label: 'Fresher' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'executive', label: 'Executive' },
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
  category: string
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
        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-primary text-white' : 'border border-line text-ink/70 hover:border-primary hover:text-primary',
      ].join(' ')}
    >
      {children}
    </button>
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

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [unlockErrors, setUnlockErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [profileResult, rolesResult, skillsResult, domainsResult, platformBadgesResult] = await Promise.all([
          getMyCompanyProfile(),
          listRoles(),
          listSkills(),
          listDomains(),
          listPlatformBadgeMasters(),
        ])
        if (cancelled) return
        setCompanyProfile(profileResult)
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

  const runSearch = async (targetPage: number) => {
    setSearching(true)
    setSearchError(null)
    try {
      const response = await searchCandidates({
        category: (filters.category || undefined) as 'fresher' | 'experienced' | 'executive' | undefined,
        primaryRoleId: filters.primaryRoleId || undefined,
        skillIds: filters.skillIds.length > 0 ? filters.skillIds.join(',') : undefined,
        domainId: filters.domainId || undefined,
        experienceMin: filters.experienceMin !== '' ? Number(filters.experienceMin) : undefined,
        experienceMax: filters.experienceMax !== '' ? Number(filters.experienceMax) : undefined,
        location: filters.location || undefined,
        noticePeriod: (filters.noticePeriod || undefined) as NoticePeriod | undefined,
        platformName: filters.platformName || undefined,
        badgeSelected: filters.platformName ? filters.badgeSelected || undefined : undefined,
        questionsSolvedMin:
          filters.platformName && filters.questionsSolvedMin !== '' ? Number(filters.questionsSolvedMin) : undefined,
        questionsSolvedMax:
          filters.platformName && filters.questionsSolvedMax !== '' ? Number(filters.questionsSolvedMax) : undefined,
        mncAlumni: filters.mncAlumni ? 'true' : undefined,
        startupAlumni: filters.startupAlumni ? 'true' : undefined,
        faangMaangAlumni: filters.faangMaangAlumni ? 'true' : undefined,
        hasResearch: filters.hasResearch ? 'true' : undefined,
        hasHackathonWin: filters.hasHackathonWin ? 'true' : undefined,
        sort: filters.sort as 'relevance' | 'recent' | 'boosted',
        page: targetPage,
        pageSize: PAGE_SIZE,
      })
      setResults(response.results)
      setTotalCount(response.totalCount)
      setPage(response.page)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to search candidates')
    } finally {
      setSearching(false)
    }
  }

  // Initial search once filter master data has loaded.
  useEffect(() => {
    if (!initialLoading && !initialError) {
      runSearch(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoading, initialError])

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleSearchClick = () => {
    runSearch(1)
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
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <PageLoader label="Loading search…" />
      </div>
    )
  }

  if (initialError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{initialError}</p>
        </Card>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const isVerified = Boolean(companyProfile?.verified)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Search candidates</h1>
          <p className="mt-1 text-ink/60">Browse verified candidates and unlock contact details.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-card border border-line px-3 py-2 text-sm font-medium text-ink md:hidden"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <aside className={`${filtersOpen ? 'block' : 'hidden'} w-full flex-shrink-0 md:block md:w-72`}>
          <Card className="flex flex-col gap-4">
            <Select
              label="Tier"
              options={tierOptions}
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value)}
            />
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

            <Select
              label="Coding platform"
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

            <div>
              <p className="text-sm font-medium text-ink">Background</p>
              <div className="mt-2 flex flex-wrap gap-2">
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

            <Select
              label="Sort"
              options={sortOptions}
              value={filters.sort}
              onChange={(e) => updateFilter('sort', e.target.value)}
            />

            <Button type="button" onClick={handleSearchClick} loading={searching}>
              Search
            </Button>
          </Card>
        </aside>

        <div className="min-w-0 flex-1">
          {searchError && (
            <Card className="mb-4">
              <p className="text-danger">{searchError}</p>
            </Card>
          )}

          {!searching && results.length === 0 && !searchError && (
            <Card>
              <p className="text-ink/60">No candidates match your filters.</p>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => (
              <div key={result.id} className="flex flex-col gap-2">
                <ProfileCard profile={mapToProfileCardData(result)} />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap gap-2">
                    {/* Messaging never requires an unlock first — companies can
                        reach out before committing a credit, per spec. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        navigate('/company/messages', { state: { candidateId: result.id } })
                      }
                    >
                      Message
                    </Button>
                    {!result.isUnlockedByMe &&
                      (isVerified ? (
                        <Button
                          type="button"
                          size="sm"
                          loading={unlockingId === result.id}
                          onClick={() => handleUnlock(result.id)}
                        >
                          Unlock Contact
                        </Button>
                      ) : (
                        <Button type="button" size="sm" disabled>
                          Unlock Contact
                        </Button>
                      ))}
                  </div>
                  {!result.isUnlockedByMe && !isVerified && (
                    <p className="text-xs text-danger">Verification required to unlock candidates</p>
                  )}
                  {unlockErrors[result.id] && (
                    <p className="text-xs text-danger">{unlockErrors[result.id]}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalCount > 0 && (
            <div className="mt-8 flex items-center justify-center gap-4">
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
        </div>
      </div>
    </div>
  )
}
