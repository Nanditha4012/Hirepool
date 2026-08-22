import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import BrandIcon, { contactIcons } from '@/components/ui/BrandIcon'

/**
 * The candidate card shown on the company's Search and Unlocked Candidates
 * pages — replaces the old expandable ProfileCard on those two pages
 * specifically. ProfileCard itself is unchanged and still used for a
 * candidate's own dashboard view of themselves (it shows fields — resume
 * link, portfolio link, coding-platform badges — that only make sense
 * there).
 *
 * Same full information ProfileCard showed (all skills, all education
 * entries, secondary roles, real contact values once unlocked) — just laid
 * out flat instead of behind fold/expand toggles, and restyled to the
 * design agreed on. No summarizing/trimming of what data actually renders.
 *
 * `domain`/`location`/`secondaryRoles`/the alumni flags are optional
 * because GET /companies/me/unlocked returns a smaller field set than
 * search does (see companyApi.ts's UnlockedCandidate vs
 * CandidateSearchResult) — this card degrades gracefully rather than
 * showing fabricated data for the Unlocked Candidates page.
 */
export interface CandidateSummaryCardEducation {
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
}

export interface CandidateSummaryCardData {
  id: string
  fullName: string | null
  category: 'fresher' | 'experienced' | 'executive' | null
  primaryRole: { id: string; roleName: string } | null
  yearsOfExperience: number | null
  domain?: { id: string; domainName: string } | null
  location?: string | null
  skills: { id: string; skillName: string }[]
  secondaryRoles?: { id: string; roleName: string }[]
  education?: CandidateSummaryCardEducation[]
  isMncAlumni?: boolean
  isFaangMaangAlumni?: boolean
  isStartupAlumni?: boolean
  isUnlockedByMe: boolean
  phone: string | null
  email: string | null
  whatsappLink: string | null
}

interface CandidateSummaryCardProps {
  candidate: CandidateSummaryCardData
  /** Any of the three action handlers can be omitted — its button simply
   * doesn't render. Search passes all three; Unlocked Candidates (which
   * has no messaging/sheet entry point today) passes none and shows the
   * card with no action row at all. */
  onMessage?: () => void
  onViewSheet?: () => void
  onUnlock?: () => void
  unlocking?: boolean
  unlockError?: string | null
}

const categoryLabel: Record<NonNullable<CandidateSummaryCardData['category']>, string> = {
  fresher: 'Fresher',
  experienced: 'Experienced',
  executive: 'Executive',
}

const EDUCATION_LEVEL_SHORT: Record<CandidateSummaryCardEducation['level'], string> = {
  tenth: '10th',
  twelfth: '12th',
  diploma: 'Diploma',
  undergraduate: 'UG',
  postgraduate: 'PG',
  doctorate: 'PhD',
}

function formatEducationPeriod(entry: CandidateSummaryCardEducation): string | null {
  if (entry.isOngoing) return `${entry.startYear ?? '…'} – present`
  if (entry.startYear && entry.endYear) return `${entry.startYear} – ${entry.endYear}`
  return entry.endYear ? String(entry.endYear) : null
}

function formatEducationScore(entry: CandidateSummaryCardEducation): string | null {
  if (entry.scoreValue == null) return null
  if (entry.scoreType === 'percentage') return `${entry.scoreValue}%`
  return `${entry.scoreValue} ${entry.scoreType?.startsWith('cgpa') ? 'CGPA' : 'GPA'}`
}

/** One contact channel, as a small icon button with its real value —
 * matches ProfileCard's ContactLink exactly (same component would be
 * imported, but ProfileCard doesn't export it). */
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
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink/40">{label}</span>
        <span className="block truncate text-sm font-medium text-ink group-hover:text-primary">{value}</span>
      </span>
    </a>
  )
}

export default function CandidateSummaryCard({
  candidate,
  onMessage,
  onViewSheet,
  onUnlock,
  unlocking = false,
  unlockError,
}: CandidateSummaryCardProps) {
  const {
    fullName,
    category,
    primaryRole,
    yearsOfExperience,
    domain,
    location,
    skills,
    secondaryRoles,
    education,
    isMncAlumni,
    isFaangMaangAlumni,
    isStartupAlumni,
    isUnlockedByMe,
    phone,
    email,
    whatsappLink,
  } = candidate

  const alumniBadges = [
    isFaangMaangAlumni ? 'FAANG/MAANG Alumni' : null,
    isMncAlumni ? 'MNC Alumni' : null,
    isStartupAlumni ? 'Startup Experience' : null,
  ].filter(Boolean) as string[]

  const hasContactInfo = Boolean(phone || email || whatsappLink)

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden rounded-card border border-line bg-card shadow-soft transition-shadow duration-200 hover:shadow-lift">
      {/* Identity band. */}
      <div className="relative isolate overflow-hidden border-b border-line bg-gradient-to-br from-primary/10 via-transparent to-accent/10 px-6 py-5">
        <div
          className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-start gap-4">
          <Avatar name={fullName || 'Candidate'} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold text-ink">{fullName || 'Unnamed candidate'}</h3>
              <Badge tone="verified">✓ Verified</Badge>
            </div>
            <p className={['mt-0.5 text-sm', primaryRole ? 'text-ink/70' : 'text-ink/40'].join(' ')}>
              {primaryRole?.roleName || 'Role not set'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/55">
              {category && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandIcon glyph={contactIcons.briefcase} className="h-4 w-4" />
                  {categoryLabel[category]}
                </span>
              )}
              {yearsOfExperience != null && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandIcon glyph={contactIcons.clock} className="h-4 w-4" />
                  {yearsOfExperience}+ yrs
                </span>
              )}
              {domain && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandIcon glyph={contactIcons.domain} className="h-4 w-4" />
                  {domain.domainName}
                </span>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandIcon glyph={contactIcons.location} className="h-4 w-4" />
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

      {/* Body — grows to fill the row's stretched height, so extra space
          (a candidate with less data than their row-mate) lands here
          rather than the card box itself being a different size than its
          neighbours. */}
      <div className="flex flex-1 flex-col gap-4 px-6 py-5">
        {skills.length > 0 && (
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/40">
              Skills <span className="ml-1 font-medium normal-case text-ink/45">{skills.length} listed</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <span
                  key={skill.id}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink/70"
                >
                  {skill.skillName}
                </span>
              ))}
            </div>
          </div>
        )}

        {secondaryRoles && secondaryRoles.length > 0 && (
          <div className="border-t border-line pt-4">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/40">Also works as</p>
            <div className="flex flex-wrap gap-1.5">
              {secondaryRoles.map((role) => (
                <span
                  key={role.id}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink/70"
                >
                  {role.roleName}
                </span>
              ))}
            </div>
          </div>
        )}

        {education && education.length > 0 && (
          <div className="border-t border-line pt-4">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/40">Education</p>
            <ul className="flex flex-col gap-2">
              {education.map((entry) => {
                const period = formatEducationPeriod(entry)
                const score = formatEducationScore(entry)
                return (
                  <li key={entry.id} className="rounded-card border border-line bg-surface/50 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{entry.institution}</p>
                      <span className="rounded-full bg-verified/12 px-2 py-0.5 text-[10px] font-bold text-verified">
                        ✓ {EDUCATION_LEVEL_SHORT[entry.level]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink/60">
                      {[entry.degree, entry.branch, entry.boardOrUniversity].filter(Boolean).join(' · ') || '—'}
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
          </div>
        )}

        <div className="mt-auto border-t border-line pt-4">
          {hasContactInfo ? (
            <>
              <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-verified">
                <BrandIcon glyph={contactIcons.lockOpen} className="h-3.5 w-3.5" />
                Contact unlocked
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {phone && (
                  <ContactLink href={`tel:${phone}`} glyph={contactIcons.phone} label="Phone" value={phone} />
                )}
                {email && (
                  <ContactLink href={`mailto:${email}`} glyph={contactIcons.email} label="Email" value={email} />
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
            </>
          ) : (
            // Visible even before an unlock — previously this section just
            // didn't render at all until the Unlock Contact button was
            // pressed, with nothing on the card itself hinting contact info
            // existed but was gated.
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">
              <BrandIcon glyph={contactIcons.lockClosed} className="h-3.5 w-3.5" />
              Contact locked
            </p>
          )}
        </div>
      </div>

      {/* Actions — a sibling of the flex-1 body above, not inside it, so
          they sit flush at the bottom of the card regardless of how much
          content is above them. Omitted entirely when no handler was
          passed at all (e.g. Unlocked Candidates today). */}
      {(onViewSheet || onMessage || (!isUnlockedByMe && onUnlock)) && (
        <div className="flex flex-wrap gap-2 border-t border-line px-6 py-4">
          {onViewSheet && (
            <Button type="button" size="sm" variant="secondary" onClick={onViewSheet}>
              Profile sheet
            </Button>
          )}
          {onMessage && (
            <Button type="button" size="sm" className="flex-1" onClick={onMessage}>
              Message
            </Button>
          )}
          {!isUnlockedByMe && onUnlock && (
            <Button type="button" size="sm" variant="secondary" loading={unlocking} onClick={onUnlock}>
              Unlock Contact
            </Button>
          )}
        </div>
      )}
      {unlockError && <p className="px-6 pb-4 text-xs text-danger">{unlockError}</p>}
    </div>
  )
}
