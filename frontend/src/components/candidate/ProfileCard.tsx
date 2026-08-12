import { useState } from 'react'
import Badge from '../ui/Badge'
import Avatar from '../ui/Avatar'
import BrandIcon, { contactIcons, platformIconFor } from '../ui/BrandIcon'
import ContestPerformance from '../contests/ContestPerformance'

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
  resumeLink: string | null
  portfolioLink: string | null
  isMncAlumni: boolean
  isFaangMaangAlumni: boolean
  isStartupAlumni: boolean
  platformBadges: {
    id: string
    platformName: string
    badgeSelected: string
    platformProfileLink: string
    verificationStatus: 'pending' | 'verified' | 'rejected'
  }[]
  verifiedAchievementCounts: { projects: number; research: number; achievements: number }
  // contact fields are only ever populated for a company viewer after an unlock (Phase 3) — undefined/null here in Phase 2
  phone?: string | null
  email?: string | null
  whatsappLink?: string | null
  /** Optional context shown under the name when present. */
  location?: string | null
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
function PlatformChip({ badge }: { badge: ProfileCardData['platformBadges'][number] }) {
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

export default function ProfileCard({ profile }: ProfileCardProps) {
  const [achievementsExpanded, setAchievementsExpanded] = useState(false)

  const {
    fullName,
    status,
    category,
    primaryRole,
    yearsOfExperience,
    secondaryRoles,
    skills,
    domain,
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

  const achievementParts = [
    verifiedAchievementCounts.projects > 0 ? `${verifiedAchievementCounts.projects} projects` : null,
    verifiedAchievementCounts.research > 0 ? `${verifiedAchievementCounts.research} papers` : null,
    verifiedAchievementCounts.achievements > 0 ? `${verifiedAchievementCounts.achievements} wins` : null,
  ].filter(Boolean) as string[]

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

      <div className="flex flex-col gap-5 p-5 sm:p-6">
        {(secondaryRoles.length > 0 || skills.length > 0) && (
          <div className="flex flex-col gap-3">
            {secondaryRoles.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">
                  Also works as
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {secondaryRoles.map((role) => (
                    <Badge key={role.id} tone="neutral">
                      {role.roleName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {skills.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">
                  Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <Badge key={skill.id} tone="neutral">
                      {skill.skillName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {platformBadges.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">
              Coding profiles
            </p>
            <div className="flex flex-wrap gap-2">
              {platformBadges.map((badge) => (
                <PlatformChip key={badge.id} badge={badge} />
              ))}
            </div>
          </div>
        )}

        {achievementParts.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setAchievementsExpanded((prev) => !prev)}
              aria-expanded={achievementsExpanded}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink/70 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              ✦ {achievementParts.join(' · ')} verified
              <span
                className={[
                  'transition-transform duration-200',
                  achievementsExpanded ? 'rotate-180' : '',
                ].join(' ')}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
            {achievementsExpanded && (
              <ul className="mt-2 animate-fade-in list-inside list-disc text-sm text-ink/70">
                {verifiedAchievementCounts.projects > 0 && (
                  <li>{verifiedAchievementCounts.projects} verified projects</li>
                )}
                {verifiedAchievementCounts.research > 0 && (
                  <li>{verifiedAchievementCounts.research} verified research papers</li>
                )}
                {verifiedAchievementCounts.achievements > 0 && (
                  <li>{verifiedAchievementCounts.achievements} verified achievements</li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* System-generated contest scores. Shown without an unlock, like the
            achievements above it — see components/contests/ContestPerformance. */}
        <ContestPerformance candidateId={profile.id} className="border-t border-line pt-5" />

        {hasDocuments && (
          <div className="grid grid-cols-1 gap-2 border-t border-line pt-5 sm:grid-cols-2">
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
        )}

        {hasContactInfo && (
          <div className="border-t border-line pt-5">
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
