import { useState } from 'react'
import Badge from '../ui/Badge'
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

function PlatformChip({ badge }: { badge: ProfileCardData['platformBadges'][number] }) {
  const isVerified = badge.verificationStatus === 'verified'
  return (
    <a
      href={badge.platformProfileLink}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-ink/70">
        {badge.platformName.charAt(0).toUpperCase()}
      </span>
      <span>{badge.platformName}</span>
      {isVerified && <span className="font-semibold text-verified">{badge.badgeSelected}</span>}
    </a>
  )
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const [achievementsExpanded, setAchievementsExpanded] = useState(false)

  const {
    fullName,
    status,
    primaryRole,
    yearsOfExperience,
    secondaryRoles,
    skills,
    domain,
    resumeLink,
    isMncAlumni,
    isFaangMaangAlumni,
    isStartupAlumni,
    platformBadges,
    verifiedAchievementCounts,
    phone,
    email,
    whatsappLink,
  } = profile

  const roleLine = primaryRole
    ? yearsOfExperience
      ? `${primaryRole.roleName} · ${yearsOfExperience}+ yrs`
      : primaryRole.roleName
    : null

  const achievementParts = [
    verifiedAchievementCounts.projects > 0 ? `${verifiedAchievementCounts.projects} projects` : null,
    verifiedAchievementCounts.research > 0 ? `${verifiedAchievementCounts.research} papers` : null,
    verifiedAchievementCounts.achievements > 0 ? `${verifiedAchievementCounts.achievements} wins` : null,
  ].filter(Boolean) as string[]

  const hasContactInfo = Boolean(phone || email || whatsappLink)
  const alumniBadges = [
    isMncAlumni ? 'MNC Alumni' : null,
    isFaangMaangAlumni ? 'FAANG/MAANG Alumni' : null,
    isStartupAlumni ? 'Startup Experience' : null,
  ].filter(Boolean) as string[]

  return (
    <div className="overflow-hidden rounded-card bg-card shadow-soft">
      {status !== 'approved' && (
        <div className="bg-surface px-6 py-1.5 text-xs font-medium text-ink/60">
          {statusBannerText[status]}
        </div>
      )}

      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {platformBadges.map((badge) => (
              <PlatformChip key={badge.id} badge={badge} />
            ))}
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
            {status === 'approved' && <Badge tone="verified">✓ Verified</Badge>}
            {alumniBadges.map((text) => (
              <Badge key={text} tone="boost">
                {text}
              </Badge>
            ))}
          </div>
        </div>

        {fullName && <h3 className="mt-3 text-lg font-semibold text-ink">{fullName}</h3>}

        <p className={`mt-1 text-sm ${primaryRole ? 'text-ink/80' : 'text-ink/40'}`}>
          {roleLine || 'Role not set'}
        </p>

        {secondaryRoles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {secondaryRoles.map((role) => (
              <Badge key={role.id} tone="neutral">
                {role.roleName}
              </Badge>
            ))}
          </div>
        )}

        {skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Badge key={skill.id} tone="neutral">
                {skill.skillName}
              </Badge>
            ))}
          </div>
        )}

        {domain && (
          <div className="mt-2">
            <Badge tone="neutral">{domain.domainName}</Badge>
          </div>
        )}

        {resumeLink && (
          <a
            href={resumeLink}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            View resume ↗
          </a>
        )}

        {achievementParts.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setAchievementsExpanded((prev) => !prev)}
              aria-expanded={achievementsExpanded}
              className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-primary/10 hover:text-primary"
            >
              {achievementParts.join(' · ')}
              <span aria-hidden="true">{achievementsExpanded ? '▲' : '▼'}</span>
            </button>
            {achievementsExpanded && (
              <ul className="mt-2 list-inside list-disc text-sm text-ink/70">
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
        <ContestPerformance candidateId={profile.id} className="mt-4 border-t border-line pt-4" />

        {hasContactInfo && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3 text-sm">
            {phone && (
              <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 text-ink/70 hover:text-primary">
                <span aria-hidden="true">☎</span>
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-ink/70 hover:text-primary">
                <span aria-hidden="true">✉</span>
                {email}
              </a>
            )}
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-ink/70 hover:text-primary"
              >
                <span aria-hidden="true">💬</span>
                WhatsApp
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
