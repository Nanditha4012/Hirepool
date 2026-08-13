import { useState } from 'react'
import Badge from '../ui/Badge'
import Avatar from '../ui/Avatar'
import BrandIcon, { contactIcons, platformIconFor } from '../ui/BrandIcon'
import ContestPerformance from '../contests/ContestPerformance'

/** One verified qualification. */
export interface ProfileCardEducation {
  id: string
  level: 'tenth' | 'twelfth' | 'diploma' | 'undergraduate' | 'postgraduate' | 'doctorate'
  institution: string
  boardOrUniversity: string | null
  degree: string | null
  branch: string | null
  startYear: number | null
  endYear: number | null
  isOngoing: boolean
  scoreValue: number | null
  scoreType: string | null
  humanVerified?: boolean
}

/**
 * The card is rendered for two very different viewers — the candidate looking
 * at their own profile, and a company looking at a search result — and they
 * are not entitled to the same fields.
 *
 * Rather than two components that drift apart, the restricted fields are
 * optional here and simply absent from the company payload: no resume link,
 * no portfolio, no coding-platform links, no project counts. Their blocks
 * don't render when the data isn't there, so the boundary is enforced by the
 * server not sending them (see the backend's utils/companyVisibleProfile.ts)
 * rather than by this component remembering to hide them.
 */
export interface ProfileCardData {
  id: string
  fullName: string | null
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_info'
  category: 'fresher' | 'experienced' | 'executive' | null
  primaryRole: { id: string; roleName: string } | null
  yearsOfExperience: number | null
  secondaryRoles: { id: string; roleName: string }[]
  skills: { id: string; skillName: string }[]
  domain: { id: string; domainName: string } | null
  education?: ProfileCardEducation[]
  isMncAlumni: boolean
  isFaangMaangAlumni: boolean
  isStartupAlumni: boolean
  /** Candidate's own view only. */
  resumeLink?: string | null
  /** Candidate's own view only. */
  portfolioLink?: string | null
  /** Candidate's own view only. */
  platformBadges?: {
    id: string
    platformName: string
    badgeSelected: string
    platformProfileLink: string
    verificationStatus: 'pending' | 'verified' | 'rejected'
  }[]
  /** Candidate's own view only. */
  verifiedAchievementCounts?: { projects: number; research: number; achievements: number }
  // contact fields are only ever populated for a company viewer after an unlock
  phone?: string | null
  email?: string | null
  whatsappLink?: string | null
  /** Optional context shown under the name when present. */
  location?: string | null
}

const EDUCATION_LEVEL_SHORT: Record<ProfileCardEducation['level'], string> = {
  tenth: '10th',
  twelfth: '12th',
  diploma: 'Diploma',
  undergraduate: 'UG',
  postgraduate: 'PG',
  doctorate: 'PhD',
}

interface ProfileCardProps {
  profile: ProfileCardData
}

const statusBannerText: Record<Exclude<ProfileCardData['status'], 'approved'>, string> = {
  draft: 'Preview — not yet visible to companies',
  submitted: 'Preview — not yet visible to companies',
  under_review: 'Preview — not yet visible to companies',
  rejected: 'Rejected — not visible to companies',
  needs_info: 'More information needed — not yet visible to companies',
}

const categoryLabel: Record<NonNullable<ProfileCardData['category']>, string> = {
  fresher: 'Fresher',
  experienced: 'Experienced',
  executive: 'Executive',
}

/**
 * One coding-platform profile, as a chip carrying that platform's own mark.
 *
 * The rank ("Knight", "5 star") is only shown once a verifier has confirmed
 * it — an unverified chip still links out, but says so, because the claim is
 * the part that needs checking, not the existence of the account.
 */
function PlatformChip({
  badge,
}: {
  badge: NonNullable<ProfileCardData['platformBadges']>[number]
}) {
  const isVerified = badge.verificationStatus === 'verified'
  const isRejected = badge.verificationStatus === 'rejected'

  return (
    <a
      href={badge.platformProfileLink}
      target="_blank"
      rel="noreferrer"
      title={`${badge.platformName} — ${badge.badgeSelected}`}
      className={[
        'group inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-xs font-medium transition-all',
        'hover:-translate-y-0.5 hover:border-primary hover:shadow-soft',
        isRejected ? 'border-line bg-surface text-ink/40' : 'border-line bg-card text-ink',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors',
          isVerified ? 'bg-verified/10 text-verified' : 'bg-surface text-ink/50',
          'group-hover:bg-primary/10 group-hover:text-primary',
        ].join(' ')}
      >
        <BrandIcon glyph={platformIconFor(badge.platformName)} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block leading-tight">{badge.platformName}</span>
        <span
          className={[
            'block text-[10px] leading-tight',
            isVerified ? 'font-semibold text-verified' : 'text-ink/40',
          ].join(' ')}
        >
          {isVerified ? badge.badgeSelected : isRejected ? 'not accepted' : 'unverified'}
        </span>
      </span>
    </a>
  )
}

/** One contact channel or document link, as an icon button with its value. */
function ContactLink({
  href,
  glyph,
  label,
  value,
  external = false,
}: {
  href: string
  glyph: React.ReactNode
  label: string
  value: string
  external?: boolean
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="group flex min-w-0 items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-soft"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-card text-ink/60 transition-colors group-hover:bg-primary group-hover:text-white">
        <BrandIcon glyph={glyph} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink/40">
          {label}
        </span>
        <span className="block truncate text-sm font-medium text-ink group-hover:text-primary">
          {value}
        </span>
      </span>
    </a>
  )
}

/**
 * A folding block inside the card.
 *
 * The card carries five or six unrelated groups — roles, skills, education,
 * coding profiles, achievements, contact — and rendering all of them expanded
 * produced a card two screens tall that had to be scrolled past to reach the
 * next candidate. Folding them means a search result is a consistent height
 * and the reader opens only what they care about.
 *
 * Deliberately lighter than components/ui/SectionCard: that one is a page
 * section with a step number and a progress ring, which would be absurd
 * nested inside a card.
 */
function FoldBlock({
  label,
  summary,
  defaultOpen = false,
  children,
}: {
  label: string
  /** Shown next to the label while folded — the answer without the detail. */
  summary?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-t border-line pt-4 first:border-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink/40 transition-colors group-hover:text-primary">
            {label}
          </span>
          {summary && !open && (
            <span className="truncate text-xs text-ink/55">{summary}</span>
          )}
        </span>
        <span
          aria-hidden="true"
          className={[
            'shrink-0 text-xs text-ink/30 transition-transform duration-200 motion-reduce:transition-none',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          ▾
        </span>
      </button>

      <div
        className={[
          'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          open ? 'mt-2 grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
      >
        <div className={['overflow-hidden', open ? '' : 'invisible'].join(' ')}>{children}</div>
      </div>
    </div>
  )
}

function formatEducationPeriod(entry: ProfileCardEducation): string | null {
  if (entry.isOngoing) return `${entry.startYear ?? '…'} – present`
  if (entry.startYear && entry.endYear) return `${entry.startYear} – ${entry.endYear}`
  return entry.endYear ? String(entry.endYear) : null
}

function formatEducationScore(entry: ProfileCardEducation): string | null {
  if (entry.scoreValue == null) return null
  if (entry.scoreType === 'percentage') return `${entry.scoreValue}%`
  return `${entry.scoreValue} ${entry.scoreType?.startsWith('cgpa') ? 'CGPA' : 'GPA'}`
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const {
    fullName,
    status,
    category,
    primaryRole,
    yearsOfExperience,
    secondaryRoles,
    skills,
    domain,
    education,
    resumeLink,
    portfolioLink,
    location,
    isMncAlumni,
    isFaangMaangAlumni,
    isStartupAlumni,
    platformBadges,
    verifiedAchievementCounts,
    phone,
    email,
    whatsappLink,
  } = profile

  const counts = verifiedAchievementCounts
  const achievementParts = counts
    ? ([
        counts.projects > 0 ? `${counts.projects} projects` : null,
        counts.research > 0 ? `${counts.research} papers` : null,
        counts.achievements > 0 ? `${counts.achievements} wins` : null,
      ].filter(Boolean) as string[])
    : []

  const hasContactInfo = Boolean(phone || email || whatsappLink)
  const hasDocuments = Boolean(resumeLink || portfolioLink)
  const alumniBadges = [
    isFaangMaangAlumni ? 'FAANG/MAANG Alumni' : null,
    isMncAlumni ? 'MNC Alumni' : null,
    isStartupAlumni ? 'Startup Experience' : null,
  ].filter(Boolean) as string[]

  const isApproved = status === 'approved'

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-soft transition-shadow duration-200 hover:shadow-lift">
      {!isApproved && (
        <div className="bg-surface px-5 py-1.5 text-xs font-medium text-ink/60 sm:px-6">
          {statusBannerText[status]}
        </div>
      )}

      {/* Identity band. A tinted header strip separates who this is from what
          they can do — previously the name sat in the same undifferentiated
          column as the skill chips and the resume link, so a card scanned as
          one long list with no entry point. */}
      <div className="relative isolate overflow-hidden border-b border-line bg-gradient-to-br from-primary/10 via-transparent to-accent/10 px-5 py-5 sm:px-6">
        <div
          className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-wrap items-start gap-4">
          <Avatar name={fullName || 'Candidate'} size="lg" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold text-ink sm:text-xl">
                {fullName || 'Unnamed candidate'}
              </h3>
              {isApproved && <Badge tone="verified">✓ Verified</Badge>}
            </div>

            <p className={['mt-0.5 text-sm', primaryRole ? 'text-ink/70' : 'text-ink/40'].join(' ')}>
              {primaryRole?.roleName || 'Role not set'}
            </p>

            {/* The one-line factual summary: seniority, domain, where.
                Each item keeps its icon so the row is scannable without
                reading it, and the whole row wraps rather than truncating. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/50">
              {category && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandIcon glyph={contactIcons.briefcase} className="h-3.5 w-3.5" />
                  {categoryLabel[category]}
                </span>
              )}
              {yearsOfExperience != null && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandIcon glyph={contactIcons.clock} className="h-3.5 w-3.5" />
                  {yearsOfExperience}+ yrs
                </span>
              )}
              {domain && <span className="inline-flex items-center gap-1.5">◆ {domain.domainName}</span>}
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandIcon glyph={contactIcons.location} className="h-3.5 w-3.5" />
                  {location}
                </span>
              )}
            </div>
          </div>

          {alumniBadges.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              {alumniBadges.map((text) => (
                <Badge key={text} tone="boost">
                  {text}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5 sm:p-6">
        {/* Skills lead, and lead open: it is the first thing anyone actually
            reads on a candidate card, and folding it by default would hide
            the answer to the question the card exists to answer. */}
        {skills.length > 0 && (
          <FoldBlock
            label="Skills"
            defaultOpen
            summary={`${skills.length} listed`}
          >
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <Badge key={skill.id} tone="neutral">
                  {skill.skillName}
                </Badge>
              ))}
            </div>
          </FoldBlock>
        )}

        {education && education.length > 0 && (
          <FoldBlock
            label="Education"
            defaultOpen
            summary={
              education[education.length - 1]?.institution ?? `${education.length} entries`
            }
          >
            <ul className="flex flex-col gap-2">
              {education.map((entry) => {
                const period = formatEducationPeriod(entry)
                const score = formatEducationScore(entry)
                return (
                  <li
                    key={entry.id}
                    className="rounded-card border border-line bg-surface/50 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{entry.institution}</p>
                      <span className="rounded-full bg-verified/12 px-2 py-0.5 text-[10px] font-bold text-verified">
                        ✓ {EDUCATION_LEVEL_SHORT[entry.level]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink/60">
                      {[entry.degree, entry.branch, entry.boardOrUniversity]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                    {(period || score) && (
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink/45">
                        {period && <span>{period}</span>}
                        {score && <span className="font-medium text-ink/65">{score}</span>}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </FoldBlock>
        )}

        {secondaryRoles.length > 0 && (
          <FoldBlock label="Also works as" summary={`${secondaryRoles.length} more roles`}>
            <div className="flex flex-wrap gap-1.5">
              {secondaryRoles.map((role) => (
                <Badge key={role.id} tone="neutral">
                  {role.roleName}
                </Badge>
              ))}
            </div>
          </FoldBlock>
        )}

        {/* Absent from a company's payload entirely — see ProfileCardData. */}
        {platformBadges && platformBadges.length > 0 && (
          <FoldBlock label="Coding profiles" summary={`${platformBadges.length} platforms`}>
            <div className="flex flex-wrap gap-2">
              {platformBadges.map((badge) => (
                <PlatformChip key={badge.id} badge={badge} />
              ))}
            </div>
          </FoldBlock>
        )}

        {achievementParts.length > 0 && counts && (
          <FoldBlock label="Verified work" summary={achievementParts.join(' · ')}>
            <ul className="list-inside list-disc text-sm text-ink/70">
              {counts.projects > 0 && <li>{counts.projects} verified projects</li>}
              {counts.research > 0 && <li>{counts.research} verified research papers</li>}
              {counts.achievements > 0 && <li>{counts.achievements} verified achievements</li>}
            </ul>
          </FoldBlock>
        )}

        {/* System-generated contest scores. Shown without an unlock, like the
            achievements above it — see components/contests/ContestPerformance. */}
        <ContestPerformance candidateId={profile.id} className="border-t border-line pt-4" />

        {hasDocuments && (
          <FoldBlock label="Documents" defaultOpen>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {resumeLink && (
                <ContactLink
                  href={resumeLink}
                  external
                  glyph={contactIcons.resume}
                  label="Resume"
                  value="Open resume"
                />
              )}
              {portfolioLink && (
                <ContactLink
                  href={portfolioLink}
                  external
                  glyph={contactIcons.portfolio}
                  label="Portfolio"
                  value={portfolioLink.replace(/^https?:\/\/(www\.)?/, '')}
                />
              )}
            </div>
          </FoldBlock>
        )}

        {hasContactInfo && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-verified">
              🔓 Contact unlocked
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {phone && (
                <ContactLink
                  href={`tel:${phone}`}
                  glyph={contactIcons.phone}
                  label="Phone"
                  value={phone}
                />
              )}
              {email && (
                <ContactLink
                  href={`mailto:${email}`}
                  glyph={contactIcons.email}
                  label="Email"
                  value={email}
                />
              )}
              {whatsappLink && (
                <ContactLink
                  href={whatsappLink}
                  external
                  glyph={contactIcons.whatsapp}
                  label="WhatsApp"
                  value="Message on WhatsApp"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
